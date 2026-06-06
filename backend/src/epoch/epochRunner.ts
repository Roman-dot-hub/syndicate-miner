// ─────────────────────────────────────────────
// epochRunner.ts — ГЛАВНЫЙ ИГРОВОЙ ЦИКЛ
//
// Запускается каждые 5 минут через node-cron.
// Порядок выполнения:
//   1. Захват Redis-лока (защита от двойного запуска)
//   2. Загрузка состояния из БД
//   3. Списание электричества (IGC)
//   4. Расчёт износа и поломок
//   5. Сборка снапшота майнеров с реф. хешрейтом
//   6. Розыгрыш блока (Solo Lottery)
//   7. Распределение наград Pool
//   8. Проверка и применение халвинга
//   9. IGC-мониторинг (supply/demand ratio + аварийные меры)
//  10. Запись всех изменений в БД (одна транзакция)
//  11. Освобождение лока
// ─────────────────────────────────────────────

import {
  EPOCHS_PER_DAY,
  REFERRAL_L1_HASHRATE_BONUS,
  REFERRAL_L2_HASHRATE_BONUS,
  REFERRAL_L1_IGC_SHARE,
  REFERRAL_L2_IGC_SHARE,
  REDIS_EPOCH_LOCK,
  REDIS_GLOBAL_H,
  REDIS_ELEC_MULT,
  ELEC_RATIO_MULT_MIN,
  ELEC_RATIO_MULT_MAX,
  STAKE_IGC_BASE_PER_TON_PER_DAY,
  STAKE_IGC_MIN_PER_TON_PER_DAY,
  STAKE_IGC_MAX_PER_TON_PER_DAY,
  ELEC_RATIO_SENSITIVITY,
  REDIS_TAP_PREFIX,
  EPOCH_INTERVAL_MS,
  SYNDICATE_LEVEL_MILESTONES,
  SYNDICATE_LEVEL_XP_COSTS,
  SYNDICATE_XP_PER_BLOCK_WIN,
  SYNDICATE_BONUS_DEFS,
  GPU_BASE_UPTIME,
  UPS_LEVELS,
  PROVIDER_LEVELS,
  FAN_LEVELS,
  SERVER_ROOM_LEVELS,
  ANTITRUST_PLAYER_CAPS,
  ANTITRUST_SYNDICATE_CAPS,
  ANTITRUST_MIN_GLOBAL_HASHRATE,
} from './constants';

import { checkHalving, getActivePhase }     from './halvingChecker';
import { calculateWear, effectiveHashrate } from './wearEngine';
import { processElectricityBill }           from './electricityBill';
import { runBlockLottery }                  from './soloLottery';
import { monitorIgcBalance }                from '../monitoring/igcMonitor';
import {
  distributePoolReward,
  calculateIgcEarned,
}                                           from './poolDistributor';
import { sendTgMessage, sendTgBroadcast }  from '../notifications/sendTgNotification';

import type {
  GPU,
  Farm,
  User,
  PoolStats,
  MinerSnapshot,
  EpochResult,
} from './types';

// ── Заглушки БД и Redis (замени на реальные клиенты) ─────
// В продакшне: import { db } from '../db/client'; import { redis } from '../redis/client';
import { db, pool, type DbClient } from '../db/client';
import { redis }             from '../redis/client';

// ─────────────────────────────────────────────────────────
export async function runEpoch(): Promise<EpochResult | null> {
  const epochAt = new Date();
  const errors:  string[] = [];

  // ── 1. Redis lock — защита от параллельного запуска ────
  // Если Redis недоступен (dev без Docker) — пропускаем лок и продолжаем
  const ttlSec = Math.floor((EPOCH_INTERVAL_MS - 10_000) / 1000);
  let lockAcquired: string | null = 'OK'; // по умолчанию — без лока
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lockAcquired = await (redis as any).set(
      REDIS_EPOCH_LOCK, '1', 'EX', ttlSec, 'NX',
    ) as string | null;
  } catch {
    console.warn('[Epoch] Redis недоступен — запускаем без лока (dev mode).');
  }

  if (!lockAcquired) {
    console.warn('[Epoch] Пропускаем — предыдущая эпоха ещё не завершена.');
    return null;
  }

  console.log(`\n[Epoch] ═══ СТАРТ ${epochAt.toISOString()} ═══`);

  try {
    // ── 2. Загрузка состояния ───────────────────────────
    const poolStats: PoolStats   = await db.getPoolStats();

    // Пул пустой — нечего раздавать, пропускаем эпоху
    if (poolStats.reservePoolTon <= 0) {
      console.warn('[Epoch] Пул пустой (0 TON) — эпоха пропущена. Пополни контракт.');
      try { await redis.del(REDIS_EPOCH_LOCK); } catch { /* Redis недоступен */ }
      return null;
    }

    const allFarms:  Farm[]      = await db.getActiveFarms();
    const allUsers:  User[]      = await db.getAllUsers();
    const usersMap               = new Map(allUsers.map(u => [u.id, u]));

    // Загружаем синдикатные данные для применения бонусов
    const userSyndicateMap   = new Map<string, { syndicateId: string; hashrateBonus: number; wearReduction: number }>();
    const syndicateWinnerMap = new Map<string, string>(); // syndicateId → userId (leader, for notifications)
    const activeSynBonuses   = new Map<string, Set<string>>(); // syndicateId → Set<bonusType>
    try {
      const { rows: memberships } = await pool.query(
        `SELECT sm.user_id, sm.syndicate_id, sm.role, s.level
         FROM syndicate_members sm JOIN syndicates s ON s.id = sm.syndicate_id`,
      );
      const { rows: bonusRows } = await pool.query(
        `SELECT syndicate_id, type FROM syndicate_bonuses WHERE expires_at > NOW()`,
      );

      for (const b of bonusRows) {
        if (!activeSynBonuses.has(b.syndicate_id)) activeSynBonuses.set(b.syndicate_id, new Set());
        activeSynBonuses.get(b.syndicate_id)!.add(b.type);
      }

      for (const m of memberships) {
        const level   = parseInt(m.level);
        const milestoneKeys = Object.keys(SYNDICATE_LEVEL_MILESTONES).map(Number).sort((a, b) => b - a);
        const mKey    = milestoneKeys.find(k => level >= k);
        const passive = mKey ? SYNDICATE_LEVEL_MILESTONES[mKey] : null;

        // Временные бонусы синдиката поверх пассивных
        const synBonuses = activeSynBonuses.get(m.syndicate_id) ?? new Set<string>();
        let hashrateBonus = passive?.hashrateBonus ?? 0;
        if (synBonuses.has('boost_x1'))  hashrateBonus += 0.10;
        if (synBonuses.has('boost_x2'))  hashrateBonus += 0.20;
        if (synBonuses.has('domination')) hashrateBonus += 0.50;

        userSyndicateMap.set(m.user_id, {
          syndicateId:  m.syndicate_id,
          hashrateBonus,
          wearReduction: passive?.wearReduction ?? 0,
        });
        if (m.role === 'leader') syndicateWinnerMap.set(m.syndicate_id, m.user_id);
      }
    } catch {
      console.warn('[Epoch] Не удалось загрузить данные синдикатов');
    }

    // ── 3. Сезонная ставка (синусоида × halvingRate) ──
    const cycleDay    = poolStats.cycle_day ?? 1; // 1..28
    const seasonMod   = 1 + 0.25 * Math.sin(2 * Math.PI * cycleDay / 28);
    const seasonRate  = poolStats.dripRate * seasonMod;

    // Коэффициент электричества — в противофазе к сезону
    // Лето (пик) → 0.95x, Зима (дно) → 1.25x
    let elecMultiplier = 2.0 - seasonMod; // 0.75 – 1.25, нейтраль = 1.0

    // Индексация по IGC-ratio: дефицит → дешевле, профицит → дороже
    const igcRatio     = poolStats.igcRatioSmoothed ?? 1;
    const ratioMult    = Math.max(
      ELEC_RATIO_MULT_MIN,
      Math.min(ELEC_RATIO_MULT_MAX, 1.0 + (igcRatio - 1.0) * ELEC_RATIO_SENSITIVITY),
    );
    elecMultiplier    *= ratioMult;
    console.log(`[Epoch] ⚡ elecMult: сезон=${(2.2 - seasonMod).toFixed(3)} ratio=${igcRatio.toFixed(3)} ratioMult=${ratioMult.toFixed(3)} → итого=${elecMultiplier.toFixed(3)}`);

    // ── 3а. Случайные события фермы (генератор) ─────────
    // lucky_miner: ровно раз в сутки в случайное время (Redis-флаг lucky_gen:{date})
    // heat_wave / power_surge: ~раз в 2 дня (1/576 за эпоху)
    try {
      // lucky_miner — раз в сутки, окно сбора 4 часа
      const today = new Date().toISOString().slice(0, 10);
      const luckyGenKey = `lucky_gen:${today}`;
      const luckyAlreadyGen = await redis.exists(luckyGenKey).catch(() => 1);
      if (!luckyAlreadyGen && Math.random() < 1 / 288) {
        const { rows: existing } = await pool.query(
          `SELECT 1 FROM system_events WHERE type = 'lucky_miner' AND active_until > NOW() LIMIT 1`,
        );
        if (existing.length === 0) {
          await pool.query(
            `INSERT INTO system_events (type, payload, active_until) VALUES ('lucky_miner', '{}', NOW() + INTERVAL '4 hours')`,
          );
          await redis.set(luckyGenKey, '1', 'EX', 86400);
          console.log(`[Epoch] ⚡ lucky_miner: событие создано, окно 4 часа`);
        }
      }

      // heat_wave и power_surge — автоматические глобальные события
      const AUTO_EVENTS = [
        { type: 'heat_wave',   intervalSec: 6 * 3600, payload: { boost_electricity: 1.3  }, label: '🌡️ Волна жары' },
        { type: 'power_surge', intervalSec: 2 * 3600, payload: { boost_electricity: 0.75 }, label: '🔋 Скачок напряжения' },
      ] as const;
      for (const ev of AUTO_EVENTS) {
        if (Math.random() < 1 / 576) {
          const { rows: existing } = await pool.query(
            `SELECT 1 FROM system_events WHERE type = $1 AND active_until > NOW() LIMIT 1`,
            [ev.type],
          );
          if (existing.length === 0) {
            await pool.query(
              `INSERT INTO system_events (type, payload, active_until) VALUES ($1, $2, NOW() + INTERVAL '${ev.intervalSec} seconds')`,
              [ev.type, JSON.stringify(ev.payload)],
            );
            console.log(`[Epoch] 🎲 ${ev.label} активна`);
          }
        }
      }
    } catch { /* Не критично */ }

    // ── 3б. Читаем активные системные события ───────────
    // lucky_miner теперь клеймится вручную — персональный бонус в Redis lucky_active:{userId}
    const sysEvents = await db.getActiveSystemEvents().catch(() => []);

    for (const ev of sysEvents) {
      if ((ev.type === 'emergency_burn' || ev.type === 'heat_wave') && ev.payload?.boost_electricity) {
        elecMultiplier *= ev.payload.boost_electricity;
        console.log(`[Epoch] ⚡ ${ev.type} → elec ×${ev.payload.boost_electricity}`);
      }
      if ((ev.type === 'electricity_discount' || ev.type === 'power_surge') && ev.payload?.boost_electricity) {
        elecMultiplier *= ev.payload.boost_electricity;
        console.log(`[Epoch] 💡 ${ev.type} → elec ×${ev.payload.boost_electricity}`);
      }
    }

    // Персональные lucky_miner бонусы — батч-проверка через Redis KEYS
    const luckyUserIds = new Set<string>();
    try {
      const luckyKeys = await redis.keys('lucky_active:*');
      for (const k of luckyKeys) luckyUserIds.add(k.replace('lucky_active:', ''));
    } catch { /* Redis недоступен — без бонуса */ }

    // Награда за эту эпоху (с сезонной поправкой)
    const dailyReward  = poolStats.reservePoolTon * seasonRate;
    const epochReward  = dailyReward / EPOCHS_PER_DAY;

    let globalHashrate       = 0;
    let activeMinerCount     = 0;
    const minerSnapshots:  MinerSnapshot[]                  = [];
    const igcPerEpoch:     Map<string, number>              = new Map();

    // Накопители изменений для БД
    const gpuUpdates:      Array<{ id: string; health: number; status: string }> = [];
    const farmIgcUpdates:  Array<{ farmId: string; igcBalance: number }>         = [];
    const offlineGpuSets:  Set<string>                                           = new Set();

    // Уведомления о низком IGC (отправляем после транзакции)
    const lowIgcAlerts: Array<{ tgUserId: number | string; igcRemaining: number; daysLeft: number }> = [];

    // IGC-мониторинг: накопители за эпоху
    let totalIgcProduced  = 0;  // supply: IGC добыто всеми майнерами
    let totalIgcConsumed  = 0;  // demand: IGC потреблено (свет + износ)

    // ── 3–4. Электричество + Износ по каждой ферме ─────
    for (const farm of allFarms) {
      const farmGpus: GPU[] = await db.getActiveFarmGpus(farm.id);

      if (farmGpus.length === 0) continue;

      // 4. Электричество (с сезонным коэффициентом + скидкой провайдера)
      // level 0 = не куплено → нет бонусов
      const providerDef = farm.providerLevel > 0
        ? (PROVIDER_LEVELS.find(l => l.level === farm.providerLevel) ?? null)
        : null;
      const providerDiscount = providerDef ? 1 - (providerDef.igcDiscountPct / 100) : 1;
      const providerUptime   = providerDef?.uptimeBonus ?? 0;
      // season_shield: в зимний период (elecMultiplier > 1) отменяет штраф — клэмпим до нейтрали
      const farmSynInfo    = userSyndicateMap.get(farm.userId);
      const farmSynBonuses = farmSynInfo ? activeSynBonuses.get(farmSynInfo.syndicateId) : null;
      const effectiveElecMult = (farmSynBonuses?.has('season_shield') && elecMultiplier > 1)
        ? 1.0
        : elecMultiplier;
      const elec = processElectricityBill(farm, farmGpus, effectiveElecMult * providerDiscount);
      totalIgcConsumed += elec.igcCharged;
      farmIgcUpdates.push({ farmId: farm.id, igcBalance: elec.igcCharged });
      elec.offlineGpuIds.forEach(id => offlineGpuSets.add(id));

      // Проверяем низкий IGC: хватит ли на 1 день (288 эпох)
      if (elec.igcCharged > 0) {
        const dailyCost = elec.igcCharged * EPOCHS_PER_DAY;
        const daysLeft  = elec.igcRemaining / dailyCost;
        if (daysLeft < 1) {
          const farmUser = usersMap.get(farm.userId);
          if (farmUser?.tgUserId) {
            lowIgcAlerts.push({ tgUserId: farmUser.tgUserId, igcRemaining: elec.igcRemaining, daysLeft });
          }
        }
      }

      if (elec.farmShutdown || elec.offlineGpuIds.length > 0) {
        const farmUser = usersMap.get(farm.userId);
        if (farmUser?.tgUserId) {
          const shutdownKey = `igc_offline:${farmUser.tgUserId}`;
          // Уведомление об остановке — не чаще раза в 4 часа
          redis.exists(shutdownKey).then(async (already) => {
            if (!already) {
              await redis.set(shutdownKey, '1', 'EX', 14_400);
              const count = elec.offlineGpuIds.length;
              sendTgMessage(
                farmUser.tgUserId,
                `🔴 <b>${elec.farmShutdown ? 'Ферма остановлена!' : `${count} майнер(ов) отключено`}</b>\n\n` +
                `Не хватило IGC на оплату электричества.\n` +
                `${elec.farmShutdown ? 'Все майнеры ушли в offline.' : `Отключены самые дорогие карты (${count} шт.).`}\n\n` +
                `Зайди в игру — как только IGC пополнится, карты можно перезапустить.`,
              ).catch(() => {});
            }
          }).catch(() => {});
        }
        if (elec.farmShutdown) {
          console.log(`[Epoch] Ферма ${farm.id} остановлена — нет IGC на электричество.`);
          continue;
        }
      }

      // 4. Износ каждой карты
      let farmHashrate = 0;

      for (const gpu of farmGpus) {
        if (offlineGpuSets.has(gpu.id)) continue;

        const wear = calculateWear(gpu, farm.coolingLevel);
        // Применяем снижение износа от синдиката
        let finalHealth = wear.newHealth;
        let finalBroken = wear.broken;
        const userSynInfo = userSyndicateMap.get(farm.userId);
        if (userSynInfo && userSynInfo.wearReduction > 0 && !wear.broken) {
          const reducedWear = wear.wearApplied * (1 - userSynInfo.wearReduction);
          finalHealth = Math.max(0, gpu.health - reducedWear);
        }
        // shield_break активен → игнорируем поломки
        const synBonusSet = userSynInfo ? activeSynBonuses.get(userSynInfo.syndicateId) : null;
        if (synBonusSet?.has('shield_break')) finalBroken = false;

        gpuUpdates.push({
          id:     gpu.id,
          health: finalBroken ? 0 : finalHealth,
          status: finalBroken ? 'broken' : 'active',
        });

        if (finalBroken) {
          console.log(`[Epoch] 💥 GPU ${gpu.id} (tier ${gpu.modelTier}) СЛОМАЛАСЬ! Health → 0.`);
          errors.push(`GPU ${gpu.id} сломана`);
          // Уведомление игроку о поломке
          const brokenUser = usersMap.get(farm.userId);
          if (brokenUser?.tgUserId) {
            const GPU_NAMES: Record<number, string> = {
              0:'USB Nano', 1:'RX 580', 2:'GTX 1660S', 3:'RTX 3070',
              4:'RTX 4090', 5:'ASIC S19', 6:'Quantum X1',
            };
            const gpuName = GPU_NAMES[gpu.modelTier] ?? 'GPU';
            sendTgMessage(
              brokenUser.tgUserId,
              `💥 <b>${gpuName} сломалась!</b>\n\n` +
              `Карта вышла из строя и прекратила майнинг.\n` +
              `Зайди и почини в Верстаке 👇`,
            ).catch(() => {});
          }
          continue;
        }

        // Уведомление при первом пересечении порога 30% здоровья
        if (finalHealth < 30 && gpu.health >= 30) {
          const warnUser = usersMap.get(farm.userId);
          if (warnUser?.tgUserId) {
            const warnKey = `health_warn:${gpu.id}`;
            try {
              const alreadyWarned = await redis.exists(warnKey);
              if (!alreadyWarned) {
                await redis.set(warnKey, '1', 'EX', 86_400); // раз в 24ч
                const GPU_NAMES: Record<number, string> = {
                  0:'USB Nano', 1:'RX 580', 2:'GTX 1660S', 3:'RTX 3070',
                  4:'RTX 4090', 5:'ASIC S19', 6:'Quantum X1',
                };
                sendTgMessage(
                  warnUser.tgUserId,
                  `⚠️ <b>Критический износ!</b>\n\n` +
                  `${GPU_NAMES[gpu.modelTier] ?? 'GPU'} — <b>${Math.round(finalHealth)}% здоровья</b>.\n` +
                  `Высокий риск поломки сегодня. Срочно почини! 👇`,
                ).catch(() => {});
              }
            } catch { /* Redis недоступен — пропускаем */ }
          }
        }

        // Эффективный хешрейт с учётом износа и uptime
        const gpuH = effectiveHashrate({ ...gpu, health: finalHealth });
        const upsDef = farm.upsLevel > 0
          ? (UPS_LEVELS.find(l => l.level === farm.upsLevel) ?? null) : null;
        const fanDef = gpu.fanLevel > 0
          ? (FAN_LEVELS.find(l => l.level === gpu.fanLevel) ?? null)  : null;
        const effectiveUptimePct = Math.min(99,
          (GPU_BASE_UPTIME[gpu.modelTier] ?? 85)
          + (upsDef?.uptimeBonus ?? 0)
          + providerUptime
          + (fanDef?.uptimeBonus ?? 0),
        );
        farmHashrate += gpuH * (effectiveUptimePct / 100);
      }

      // Применяем бонус серверной комнаты (хешрейт всей фермы)
      const serverRoomDef = farm.serverRoomLevel > 0
        ? (SERVER_ROOM_LEVELS.find(l => l.level === farm.serverRoomLevel) ?? null)
        : null;
      if (serverRoomDef) farmHashrate *= (1 + serverRoomDef.hashrateBonus);

      if (farmHashrate === 0) continue;

      // ── 5. Снапшот майнера с реферальным бонусом ───
      const user      = usersMap.get(farm.userId);
      if (!user) continue;

      // H_total_user = H_base + Σ(H_L1 × 5%) + Σ(H_L2 × 2%)
      let refHashrate = 0;
      for (const refId of (user.referrals_l1 ?? [])) {
        const ref = usersMap.get(refId);
        if (ref) refHashrate += (ref.baseHashrate ?? 0) * REFERRAL_L1_HASHRATE_BONUS;
      }
      for (const refId of (user.referrals_l2 ?? [])) {
        const ref = usersMap.get(refId);
        if (ref) refHashrate += (ref.baseHashrate ?? 0) * REFERRAL_L2_HASHRATE_BONUS;
      }

      let totalUserH = farmHashrate + refHashrate;

      // Применяем синдикатный бонус к хешрейту
      const synData = userSyndicateMap.get(user.id);
      if (synData && synData.hashrateBonus > 0) {
        totalUserH *= (1 + synData.hashrateBonus);
      }

      // Применяем буст от Tap-to-Cool (+10% если boost_end > now)
      try {
        const nowSec   = Math.floor(Date.now() / 1000);
        const storedEnd = parseInt(await redis.get(`${REDIS_TAP_PREFIX}end:${user.id}`) ?? '0', 10);
        if (storedEnd > nowSec) {
          totalUserH *= 1.10;
          console.log(`[Epoch] ❄️ Tap boost: user ${user.id} → ${totalUserH.toFixed(2)} H (+10%)`);
        }
      } catch { /* Redis недоступен — без буста */ }

      globalHashrate  += totalUserH;
      activeMinerCount++;

      // igc_boost: +50% IGC для участников синдиката с активным бустом
      const userSynBonuses = synData ? activeSynBonuses.get(synData.syndicateId) : null;
      const igcMult    = (userSynBonuses?.has('igc_boost') ? 2.0 : 1.0) * (luckyUserIds.has(user.id) ? 1.5 : 1.0);
      const igcEarned  = calculateIgcEarned(totalUserH) * igcMult;
      igcPerEpoch.set(user.id, igcEarned);
      totalIgcProduced += igcEarned;

      minerSnapshots.push({
        userId:   user.id,
        farmId:   farm.id,
        hashrate: totalUserH,
        baseH:    farmHashrate,
        mode:     farm.miningMode,
        igcBal:   user.igcBalance,
      });
    }

    // Обновляем кэш глобального хешрейта и множителя электричества в Redis
    try { await redis.set(REDIS_GLOBAL_H, globalHashrate.toFixed(4)); } catch { /* Redis недоступен */ }
    try { await redis.set(REDIS_ELEC_MULT, elecMultiplier.toFixed(4)); } catch { /* Redis недоступен */ }

    // ── 5.5 Антимонопольное законодательство ───────────
    const currentPhaseNow = poolStats.currentPhase ?? 1;
    const playerCap       = ANTITRUST_PLAYER_CAPS[currentPhaseNow] ?? 0.05;
    const syndicateCap    = ANTITRUST_SYNDICATE_CAPS[currentPhaseNow] ?? 0.15;
    const antitrustActive = globalHashrate >= ANTITRUST_MIN_GLOBAL_HASHRATE;

    if (antitrustActive) {
      // Индивидуальный кап: урезаем хешрейт игрока если превышает X% глобального
      const playerMaxH = globalHashrate * playerCap;
      for (const snap of minerSnapshots) {
        if (snap.hashrate > playerMaxH) {
          snap.hashrate = playerMaxH;
        }
      }

      // Синдикатный кап: считаем суммарный хешрейт каждого синдиката среди pool-майнеров
      const poolSnaps = minerSnapshots.filter(s => s.mode === 'pool');
      const poolTotalH = poolSnaps.reduce((s, m) => s + m.hashrate, 0);
      if (poolTotalH > 0) {
        // Группируем хешрейт по синдикатам
        const synHashMap = new Map<string, number>(); // syndicateId → суммарный H
        for (const snap of poolSnaps) {
          const synData = userSyndicateMap.get(snap.userId);
          if (!synData) continue;
          synHashMap.set(synData.syndicateId, (synHashMap.get(synData.syndicateId) ?? 0) + snap.hashrate);
        }
        // Применяем кап: если синдикат превышает syndicateCap — пропорционально урезаем участников
        const synMaxH = poolTotalH * syndicateCap;
        for (const [synId, synH] of synHashMap) {
          if (synH > synMaxH) {
            const scale = synMaxH / synH;
            for (const snap of poolSnaps) {
              const synData = userSyndicateMap.get(snap.userId);
              if (synData?.syndicateId === synId) snap.hashrate *= scale;
            }
          }
        }
      }
    }

    // ── 6. Розыгрыш блока (Solo Lottery) ───────────────
    const lottery = runBlockLottery(minerSnapshots);
    let   soloWinnerId: string | null = null;

    // ── 7. Распределение наград ─────────────────────────
    const poolMiners = minerSnapshots.filter(m => m.mode === 'pool');
    const distribution = distributePoolReward(
      epochReward,
      poolMiners,
      igcPerEpoch,
      usersMap,
    );

    let totalDistributed = distribution.totalDistributed;

    // Реферальные IGC-бонусы — это дополнительная эмиссия из пула 10B.
    // Добавляем к totalIgcProduced, чтобы total_igc_minted и market index
    // отражали ВСЕ IGC, вошедшие в обращение (включая реферальные).
    const totalReferralIgc = distribution.referralPayouts
      .reduce((sum, r) => sum + r.igcBonus, 0);

    // Solo-победитель забирает весь epoch reward (без комиссии)
    if (lottery.soloWinnerId) {
      soloWinnerId     = lottery.soloWinnerId;
      totalDistributed = epochReward;
      console.log(`[Epoch] 🏆 СОЛО ПОБЕДА: ${soloWinnerId} забрал ${epochReward.toFixed(6)} TON!`);

      const winner = usersMap.get(soloWinnerId);
      if (winner?.tgUserId) {
        sendTgMessage(
          winner.tgUserId,
          `🏆 <b>Solo-победа!</b>\n\n` +
          `Ты выиграл блок эпохи и получил <b>${epochReward.toFixed(6)} TON</b>!\n\n` +
          `💰 Открой игру, чтобы вывести награду.`,
        ).catch(err => errors.push(`solo_notify_error: ${err}`));
      }
    }

    // ── 7а. Синдикатный XP за победу в блоке + stats ──
    if (soloWinnerId) {
      const winnerSyn = userSyndicateMap.get(soloWinnerId);
      if (winnerSyn) {
        try {
          const { rows: [synRow] } = await pool.query(
            `UPDATE syndicates
             SET xp = xp + $1,
                 total_blocks_won = total_blocks_won + 1,
                 total_ton_earned = total_ton_earned + $2
             WHERE id = $3
             RETURNING xp, level`,
            [SYNDICATE_XP_PER_BLOCK_WIN, epochReward, winnerSyn.syndicateId],
          );
          const newLevel = calcSyndicateLevelFromXp(parseFloat(synRow.xp));
          if (newLevel > parseInt(synRow.level)) {
            await pool.query(
              `UPDATE syndicates SET level = $1 WHERE id = $2`,
              [newLevel, winnerSyn.syndicateId],
            );
          }
        } catch { /* не критично */ }
      }
    }

    // ── 7б. Синдикатная статистика TON + IGC за эпоху ──
    // Накапливаем по синдикатам: TON (pool-выплаты) + IGC (все майнеры)
    try {
      const synTonAccum = new Map<string, number>(); // syndicateId → totalTon
      const synIgcAccum = new Map<string, number>(); // syndicateId → totalIgc

      // TON от pool-выплат участникам синдиката
      for (const payout of distribution.minerPayouts) {
        const synInfo = userSyndicateMap.get(payout.userId);
        if (!synInfo) continue;
        if (payout.tonEarned > 0)
          synTonAccum.set(synInfo.syndicateId, (synTonAccum.get(synInfo.syndicateId) ?? 0) + payout.tonEarned);
      }

      // IGC всех майнеров синдиката (pool + solo)
      for (const snapshot of minerSnapshots) {
        const synInfo = userSyndicateMap.get(snapshot.userId);
        if (!synInfo) continue;
        const igcEarned = igcPerEpoch.get(snapshot.userId) ?? 0;
        if (igcEarned > 0)
          synIgcAccum.set(synInfo.syndicateId, (synIgcAccum.get(synInfo.syndicateId) ?? 0) + igcEarned);
      }

      // Один UPDATE за синдикат
      const allSynIds = new Set([...synTonAccum.keys(), ...synIgcAccum.keys()]);
      for (const synId of allSynIds) {
        const ton = synTonAccum.get(synId) ?? 0;
        const igc = synIgcAccum.get(synId) ?? 0;
        await pool.query(
          `UPDATE syndicates
           SET total_ton_earned = total_ton_earned + $1,
               total_igc_earned = total_igc_earned + $2
           WHERE id = $3`,
          [ton, igc, synId],
        );
      }
    } catch (e) {
      console.warn('[Epoch] Ошибка обновления статистики синдикатов:', e);
    }

    // ── 8. Стейкинг IGC-yield ──────────────────────────
    // Каждую эпоху начисляем IGC стейкерам: base/ratio, зажато в [min, max].
    // ratio<1 (дефицит IGC) → больше IGC; ratio>1 (профицит) → меньше IGC.
    let totalStakingIgc = 0;
    try {
      const { rows: stakers } = await pool.query(
        `SELECT u.id AS user_id, u.staked_ton, f.id AS farm_id
         FROM users u JOIN farms f ON f.user_id = u.id
         WHERE u.staked_ton > 0`,
      );
      const ratio = parseFloat(poolStats.igcRatioSmoothed?.toString() ?? '1') || 1;
      const igcPerTonPerDay = Math.min(
        STAKE_IGC_MAX_PER_TON_PER_DAY,
        Math.max(STAKE_IGC_MIN_PER_TON_PER_DAY, STAKE_IGC_BASE_PER_TON_PER_DAY / ratio),
      );
      const igcPerTonPerEpoch = igcPerTonPerDay / EPOCHS_PER_DAY;
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
      for (const s of stakers) {
        const yieldIgc = parseFloat(s.staked_ton) * igcPerTonPerEpoch;
        if (yieldIgc <= 0) continue;
        // Начисляем в users.igc_balance (farms не имеет этого поля)
        await pool.query(
          `UPDATE users SET igc_balance = igc_balance + $1 WHERE id = $2`,
          [parseFloat(yieldIgc.toFixed(6)), s.user_id],
        );
        // Накапливаем суточный доход стейкинга в Redis (earn:stk:{userId}:{date})
        try {
          await redis.hincrbyfloat(`earn:stk:${s.user_id}:${today}`, 'igc', yieldIgc);
          await redis.expire(`earn:stk:${s.user_id}:${today}`, 9 * 24 * 3600); // 9 дней TTL
        } catch { /* Redis недоступен */ }
        totalStakingIgc += yieldIgc;
      }
      if (totalStakingIgc > 0) {
        console.log(`[Epoch] 💰 Стейкинг: ${stakers.length} стейкеров, начислено ${totalStakingIgc.toFixed(4)} IGC`);
      }
    } catch (e) {
      errors.push(`staking_yield_error: ${e}`);
    }
    totalIgcProduced += totalStakingIgc;

    // ── 9. Халвинг ─────────────────────────────────────
    const updatedStats: PoolStats = {
      ...poolStats,
      reservePoolTon: poolStats.reservePoolTon - totalDistributed,
      totalPaidOut:   poolStats.totalPaidOut   + totalDistributed,
      adminEarnedTon: poolStats.adminEarnedTon + distribution.commissionTaken,
      totalIgcMinted: (poolStats.totalIgcMinted ?? 0) + totalIgcProduced + totalReferralIgc,
      totalIgcBurned: (poolStats.totalIgcBurned ?? 0) + totalIgcConsumed,
    };

    const halvingResult   = checkHalving(updatedStats);
    let halvingTriggered  = false;

    if (halvingResult.triggered) {
      halvingTriggered          = true;
      updatedStats.dripRate     = halvingResult.newDripRate;
      updatedStats.currentPhase = halvingResult.newPhase as 1 | 2 | 3 | 4;
      console.log(`[Epoch] ⚡ ХАЛВИНГ! Фаза ${halvingResult.previousPhase} → ${halvingResult.newPhase}`);

      const allTgIds = allUsers.map(u => u.tgUserId).filter(Boolean);
      if (halvingResult.message && allTgIds.length > 0) {
        sendTgBroadcast(allTgIds, halvingResult.message)
          .then(r => console.log(`[Epoch] Халвинг broadcast: ${r.sent} доставлено, ${r.failed} ошибок`))
          .catch(err => errors.push(`halving_broadcast_error: ${err}`));
      }
    }

    // ── 9. IGC мониторинг ──────────────────────────────
    const igcStats = await monitorIgcBalance(
      totalIgcProduced + totalReferralIgc,   // mining + referral bonuses = полная эмиссия
      totalIgcConsumed,
      updatedStats.adminEarnedTon,
    ).catch(err => {
      // Мониторинг не должен ронять эпоху
      errors.push(`igc_monitor_error: ${err}`);
      return null;
    });

    // ── 10. Запись в БД — одна транзакция ──────────────
    await db.transaction(async (trx: DbClient) => {
      // Обновляем здоровье и статус карт
      for (const upd of gpuUpdates) {
        await trx.updateGpu(upd.id, { health: upd.health, status: upd.status });
      }

      // Отключаем карты с нехваткой IGC
      for (const gpuId of offlineGpuSets) {
        await trx.updateGpu(gpuId, { status: 'offline' });
      }

      // Обновляем IGC ферм (списание электричества)
      for (const upd of farmIgcUpdates) {
        await trx.updateFarmIgc(upd.farmId, upd.igcBalance);
      }

      // Начисляем TON pool-майнерам + пишем в историю заработка
      for (const payout of distribution.minerPayouts) {
        await trx.creditUser(payout.userId, {
          ton: payout.tonEarned,
          igc: payout.igcEarned,
        });
        await trx.upsertDailyEarnings(payout.userId, epochAt, payout.tonEarned, payout.igcEarned);
      }

      // Реферальные IGC-бонусы (pool-майнеры)
      // Solo-майнеры добавляются ниже
      const refBonusMap = new Map<string, number>(); // referrerId → суммарный igcBonus
      for (const ref of distribution.referralPayouts) {
        refBonusMap.set(ref.referrerId, (refBonusMap.get(ref.referrerId) ?? 0) + ref.igcBonus);
      }

      // Solo-майнеры: тоже дают реферальный IGC-бонус своим инвайтерам
      const poolPayoutUserIds = new Set(distribution.minerPayouts.map(p => p.userId));
      for (const snapshot of minerSnapshots) {
        if (poolPayoutUserIds.has(snapshot.userId)) continue; // pool уже учтён выше
        const igcEarned = igcPerEpoch.get(snapshot.userId) ?? 0;
        if (igcEarned <= 0) continue;
        const miner = usersMap.get(snapshot.userId);
        if (!miner) continue;
        if (miner.inviter_id) {
          const l1Bonus = parseFloat((igcEarned * REFERRAL_L1_IGC_SHARE).toFixed(4));
          refBonusMap.set(miner.inviter_id, (refBonusMap.get(miner.inviter_id) ?? 0) + l1Bonus);
          const l1User = usersMap.get(miner.inviter_id);
          if (l1User?.inviter_id) {
            const l2Bonus = parseFloat((igcEarned * REFERRAL_L2_IGC_SHARE).toFixed(4));
            refBonusMap.set(l1User.inviter_id, (refBonusMap.get(l1User.inviter_id) ?? 0) + l2Bonus);
          }
        }
      }

      // Начисляем реферальные бонусы + пишем транзакции + daily earnings
      for (const [referrerId, igcBonus] of refBonusMap) {
        if (igcBonus <= 0) continue;
        await trx.creditUser(referrerId, { ton: 0, igc: igcBonus });
        await trx.upsertDailyEarnings(referrerId, epochAt, 0, igcBonus);
        await pool.query(
          `INSERT INTO transactions (user_id, type, amount_ton, amount_igc)
           VALUES ($1, 'referral_bonus', 0, $2)`,
          [referrerId, igcBonus],
        );
      }

      // Solo-победитель получает TON + пишем в историю
      if (soloWinnerId) {
        await trx.creditUser(soloWinnerId, { ton: epochReward, igc: 0 });
        await trx.upsertDailyEarnings(soloWinnerId, epochAt, epochReward, 0);
      }

      // Начисляем IGC solo-майнерам (pool-майнеры уже получили IGC выше)
      for (const snapshot of minerSnapshots) {
        if (poolPayoutUserIds.has(snapshot.userId)) continue; // уже начислено
        const igcEarned = igcPerEpoch.get(snapshot.userId) ?? 0;
        if (igcEarned > 0) {
          await trx.creditUser(snapshot.userId, { ton: 0, igc: igcEarned });
          await trx.upsertDailyEarnings(snapshot.userId, epochAt, 0, igcEarned);
        }
      }

      // Обновляем pool_stats
      await trx.updatePoolStats(updatedStats);

      // Лог эпохи
      await trx.insertEpochLog({
        epochAt,
        globalHashrate,
        rewardDistributed: totalDistributed,
        poolAfter:         updatedStats.reservePoolTon,
        phase:             updatedStats.currentPhase,
        activeMinerCount,
      });
    });

    // ── Кэшируем дневной заработок в Redis ────────────────
    const todayStr = epochAt.toISOString().slice(0, 10); // YYYY-MM-DD UTC
    try {
      const pipe = redis.pipeline();

      // Pool-майнеры: TON + IGC
      for (const payout of distribution.minerPayouts) {
        const key = `earn:d:${payout.userId}:${todayStr}`;
        if (payout.tonEarned > 0) pipe.hincrbyfloat(key, 'ton', payout.tonEarned);
        if (payout.igcEarned > 0) pipe.hincrbyfloat(key, 'igc', payout.igcEarned);
        pipe.expire(key, 9 * 86400);
      }

      // Solo-победитель: TON
      if (soloWinnerId) {
        const key = `earn:d:${soloWinnerId}:${todayStr}`;
        pipe.hincrbyfloat(key, 'ton', epochReward);
        pipe.expire(key, 9 * 86400);
      }

      // Solo-майнеры: IGC (pool-майнеры уже записаны выше)
      const poolPayoutIdsRedis = new Set(distribution.minerPayouts.map(p => p.userId));
      for (const snapshot of minerSnapshots) {
        if (poolPayoutIdsRedis.has(snapshot.userId)) continue;
        const igcEarned = igcPerEpoch.get(snapshot.userId) ?? 0;
        if (igcEarned > 0) {
          const key = `earn:d:${snapshot.userId}:${todayStr}`;
          pipe.hincrbyfloat(key, 'igc', igcEarned);
          pipe.expire(key, 9 * 86400);
        }
      }

      await pipe.exec();
    } catch { /* Redis недоступен — пропускаем кэш */ }

    // ── Уведомления о низком IGC (fire-and-forget) ─────────
    for (const alert of lowIgcAlerts) {
      const warnKey = `igc_warn:${alert.tgUserId}`;
      try {
        // Отправляем не чаще раза в 20 часов
        const already = await redis.exists(warnKey);
        if (!already) {
          await redis.set(warnKey, '1', 'EX', 79_200); // 22 часа
          sendTgMessage(
            alert.tgUserId,
            `⚠️ <b>Мало IGC на электричество!</b>\n\n` +
            `Остаток: <b>${alert.igcRemaining.toFixed(1)} IGC</b>\n` +
            `Хватит примерно на <b>${(alert.daysLeft * 24).toFixed(0)} часов</b>.\n\n` +
            `Если IGC закончится — самые дорогие майнеры уйдут в offline. ` +
            `Зайди в игру и проверь ферму 👇`,
          ).catch(() => {});
        }
      } catch { /* Redis недоступен — пропускаем */ }
    }

    const result: EpochResult = {
      epochAt,
      globalHashrate,
      rewardPool:       epochReward,
      distributed:      totalDistributed,
      poolAfter:        updatedStats.reservePoolTon,
      phase:            updatedStats.currentPhase,
      activeMinerCount,
      soloWinner:       soloWinnerId,
      halvingTriggered,
      errors,
    };

    console.log(
      `[Epoch] ✓ Завершена | ` +
      `Пул: ${result.poolAfter.toFixed(4)} TON | ` +
      `Раздано: ${result.distributed.toFixed(6)} TON | ` +
      `Майнеров: ${activeMinerCount} | ` +
      `Фаза: ${result.phase} | ` +
      `Сезон: день ${cycleDay} | ` +
      `IGC ratio: ${igcStats?.ratio.toFixed(3) ?? 'n/a'} (${igcStats?.status ?? 'n/a'})`,
    );

    return result;

  } catch (err) {
    errors.push(String(err));
    console.error('[Epoch] ❌ Критическая ошибка:', err);
    return null;

  } finally {
    // ── 11. Освобождаем лок всегда ─────────────────────
    try { await redis.del(REDIS_EPOCH_LOCK); } catch { /* Redis недоступен */ }
  }
}

function calcSyndicateLevelFromXp(xp: number): number {
  let level = 1;
  let remaining = xp;
  for (let i = 0; i < SYNDICATE_LEVEL_XP_COSTS.length; i++) {
    if (remaining >= SYNDICATE_LEVEL_XP_COSTS[i]) {
      remaining -= SYNDICATE_LEVEL_XP_COSTS[i];
      level++;
    } else break;
    if (level >= 50) break;
  }
  return Math.min(level, 50);
}

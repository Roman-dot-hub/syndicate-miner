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
  REDIS_EPOCH_LOCK,
  REDIS_GLOBAL_H,
  REDIS_TAP_PREFIX,
  EPOCH_INTERVAL_MS,
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
import { db, type DbClient } from '../db/client';
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

    // ── 3. Сезонная ставка (синусоида × halvingRate) ──
    const cycleDay    = poolStats.cycle_day ?? 1; // 1..28
    const seasonMod   = 1 + 0.25 * Math.sin(2 * Math.PI * cycleDay / 28);
    const seasonRate  = poolStats.dripRate * seasonMod;

    // Коэффициент электричества — в противофазе к сезону
    // Лето (пик) → 0.95x, Зима (дно) → 1.25x
    let elecMultiplier = 2.2 - seasonMod; // ~0.95 – 1.45

    // ── 3а. Читаем активные системные события ───────────
    // emergency_burn: boost_electricity × N (поднимает спрос IGC при профиците)
    // electricity_discount: multiplier (снижает стоимость при дефиците IGC)
    const sysEvents = await db.getActiveSystemEvents().catch(() => []);

    for (const ev of sysEvents) {
      if (ev.type === 'emergency_burn' && ev.payload?.boost_electricity) {
        elecMultiplier *= ev.payload.boost_electricity;
        console.log(`[Epoch] ⚡ emergency_burn активен → elec ×${ev.payload.boost_electricity}`);
      }
      if (ev.type === 'electricity_discount' && ev.payload?.multiplier) {
        elecMultiplier *= ev.payload.multiplier;
        console.log(`[Epoch] 💡 electricity_discount активен → elec ×${ev.payload.multiplier}`);
      }
    }

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

      // 4. Электричество (с сезонным коэффициентом)
      const elec = processElectricityBill(farm, farmGpus, elecMultiplier);
      totalIgcConsumed += elec.igcCharged;
      farmIgcUpdates.push({ farmId: farm.id, igcBalance: elec.igcRemaining });
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
        gpuUpdates.push({
          id:     gpu.id,
          health: wear.newHealth,
          status: wear.broken ? 'broken' : 'active',
        });

        if (wear.broken) {
          console.log(`[Epoch] 💥 GPU ${gpu.id} (tier ${gpu.modelTier}) СЛОМАЛАСЬ! Health → 0.`);
          errors.push(`GPU ${gpu.id} сломана`);
          continue;
        }

        // Эффективный хешрейт с учётом износа
        const gpuH = effectiveHashrate({ ...gpu, health: wear.newHealth });
        farmHashrate += gpuH;
      }

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

      const igcEarned = calculateIgcEarned(totalUserH);
      igcPerEpoch.set(user.id, igcEarned);

      minerSnapshots.push({
        userId:   user.id,
        farmId:   farm.id,
        hashrate: totalUserH,
        baseH:    farmHashrate,
        mode:     farm.miningMode,
        igcBal:   user.igcBalance,
      });
    }

    // Обновляем кэш глобального хешрейта в Redis
    try { await redis.set(REDIS_GLOBAL_H, globalHashrate.toFixed(4)); } catch { /* Redis недоступен */ }

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

    // ── 8. Халвинг ─────────────────────────────────────
    const updatedStats: PoolStats = {
      ...poolStats,
      reservePoolTon: poolStats.reservePoolTon - totalDistributed,
      totalPaidOut:   poolStats.totalPaidOut   + totalDistributed,
      adminEarnedTon: poolStats.adminEarnedTon + distribution.commissionTaken,
      totalIgcMinted: (poolStats.totalIgcMinted ?? 0) + totalIgcProduced,
      totalIgcBurned: poolStats.totalIgcBurned ?? 0,
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
      totalIgcProduced,
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

      // Начисляем TON pool-майнерам
      for (const payout of distribution.minerPayouts) {
        await trx.creditUser(payout.userId, {
          ton: payout.tonEarned,
          igc: payout.igcEarned,
        });
      }

      // Реферальные IGC-бонусы
      for (const ref of distribution.referralPayouts) {
        await trx.creditUser(ref.referrerId, { ton: 0, igc: ref.igcBonus });
      }

      // Solo-победитель
      if (soloWinnerId) {
        await trx.creditUser(soloWinnerId, { ton: epochReward, igc: 0 });
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

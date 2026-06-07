// ─────────────────────────────────────────────
// routes/sync.ts  →  GET /api/sync
//
// Возвращает полный снапшот состояния игрока:
// балансы, ферма, GPU, пул, IGC-статус, сезон.
// Вызывается фронтендом каждые 2 секунды.
// ─────────────────────────────────────────────

import { FastifyInstance } from 'fastify';
import { Pool }            from 'pg';
import { pgPoolConfig }    from '../db/client';
import { telegramAuthHook } from '../auth/telegramAuth';
import { sync }             from '../db/queries';
import { getLiveIgcStatus } from '../monitoring/igcMonitor';
import { sendTgMessage }    from '../notifications/sendTgNotification';
import { redis }                                                  from '../redis/client';
import { REDIS_TAP_PREFIX, REDIS_GLOBAL_H, REDIS_ELEC_MULT, TAP_SESSION_LIMIT,
         REDIS_AD_COUNT_PREFIX, REDIS_AD_COOLDOWN_PREFIX, AD_VIEWS_PER_CYCLE,
         SYNDICATE_LEVEL_MILESTONES, SYNDICATE_BASE_MAX_MEMBERS,
         SYNDICATE_LEVEL_XP_COSTS,
         ELEC_RATIO_MULT_MIN, ELEC_RATIO_MULT_MAX, ELEC_RATIO_SENSITIVITY,
         STAKE_IGC_BASE_PER_TON_PER_DAY, STAKE_IGC_MIN_PER_TON_PER_DAY,
         STAKE_IGC_MAX_PER_TON_PER_DAY, STAKE_UNSTAKE_DAILY_LIMIT_PCT } from '../epoch/constants';

const pool = new Pool(pgPoolConfig);

export async function syncRoutes(app: FastifyInstance) {

  app.get('/api/sync', {
    preHandler: telegramAuthHook,
  }, async (req, reply) => {
    const tgUser = (req as any).tgUser;

    // ── Найти или создать пользователя ────────
    let { rows: [user] } = await pool.query(
      `SELECT id FROM users WHERE tg_user_id = $1`,
      [tgUser.id],
    );

    if (!user) {
      // Новый игрок: регистрация с USB-майнером
      // Поддерживаем оба формата: "ref_12345" (из t.me ссылки) и "12345" (plain)
      const rawRef  = (req.query as any).ref as string | undefined;
      const refCode = rawRef?.startsWith('ref_') ? rawRef.slice(4) : rawRef;
      user = await registerNewPlayer(tgUser, refCode);
    }

    // ── Основные данные ───────────────────────
    let snapshot: Awaited<ReturnType<typeof sync.getUserSnapshot>>;
    let igcStatus: Awaited<ReturnType<typeof getLiveIgcStatus>>;
    try {
      [snapshot, igcStatus] = await Promise.all([
        sync.getUserSnapshot(user.id),
        getLiveIgcStatus(),
      ]);
    } catch (err: any) {
      console.error('[sync] getUserSnapshot failed:', err?.message, err?.stack);
      throw new Error(`snapshot failed: ${err?.message}`);
    }

    // ── Сезонная информация ───────────────────
    let poolRow: any;
    try {
      const { rows: [row] } = await pool.query(
        `SELECT cycle_day, season, drip_rate, current_phase,
                reserve_pool_ton, total_paid_out,
                total_igc_minted, total_igc_burned, igc_ratio_smoothed,
                staking_daily_unstaked, staking_daily_unstake_date
         FROM pool_stats WHERE id = 1`,
      );
      poolRow = row;
    } catch (err: any) {
      console.error('[sync] pool_stats query failed:', err?.message);
      throw new Error(`pool_stats failed: ${err?.message}`);
    }

    const seasonRate = poolRow
      ? poolRow.drip_rate * (1 + 0.25 * Math.sin(2 * Math.PI * poolRow.cycle_day / 28))
      : 0;

    // ── Ad Boost ────────
    let tapBoost = { active: false, secondsLeft: 0, adViewsInCycle: 0, adViewsPerCycle: AD_VIEWS_PER_CYCLE, adCooldownSeconds: 0 };
    try {
      const nowSec = Math.floor(Date.now() / 1000);
      const [storedEndRaw, adCountRaw, cooldownTtl] = await Promise.all([
        redis.get(`${REDIS_TAP_PREFIX}end:${user.id}`),
        redis.get(`${REDIS_AD_COUNT_PREFIX}${user.id}`),
        redis.ttl(`${REDIS_AD_COOLDOWN_PREFIX}${user.id}`),
      ]);
      const secondsLeft = Math.max(0, parseInt(storedEndRaw ?? '0', 10) - nowSec);
      tapBoost = {
        active:            secondsLeft > 0,
        secondsLeft,
        adViewsInCycle:    parseInt(adCountRaw ?? '0', 10),
        adViewsPerCycle:   AD_VIEWS_PER_CYCLE,
        adCooldownSeconds: Math.max(0, cooldownTtl),
      };
    } catch { /* Redis недоступен */ }

    // ── Сглаженный IGC ratio из pool_stats (EMA, обновляется каждую эпоху) ──
    const igcRatio = parseFloat(poolRow?.igc_ratio_smoothed ?? '1');

    // ── Глобальный хешрейт: Redis → fallback БД ──────────
    let globalHashrate = 0;
    try {
      const raw = await redis.get(REDIS_GLOBAL_H);
      globalHashrate = parseFloat(raw ?? '0');
    } catch { /* Redis недоступен */ }

    // ── Множитель электричества: Redis → fallback расчёт на лету ──
    let electricityMult = 1.0;
    try {
      const raw = await redis.get(REDIS_ELEC_MULT);
      if (raw) {
        electricityMult = parseFloat(raw);
      } else {
        // Redis пуст (первый запуск) — считаем по формуле
        const cycleDay  = poolRow?.cycle_day ?? 1;
        const seasonMod = 1 + 0.25 * Math.sin(2 * Math.PI * cycleDay / 28);
        const ratioMult = Math.max(ELEC_RATIO_MULT_MIN, Math.min(ELEC_RATIO_MULT_MAX, 1.0 + (igcRatio - 1.0) * ELEC_RATIO_SENSITIVITY));
        electricityMult = (2.0 - seasonMod) * ratioMult;
      }
    } catch {
      // Redis недоступен — fallback
      const cycleDay  = poolRow?.cycle_day ?? 1;
      const seasonMod = 1 + 0.25 * Math.sin(2 * Math.PI * cycleDay / 28);
      const ratioMult = Math.max(ELEC_RATIO_MULT_MIN, Math.min(ELEC_RATIO_MULT_MAX, 1.0 + (igcRatio - 1.0) * ELEC_RATIO_SENSITIVITY));
      electricityMult = (2.0 - seasonMod) * ratioMult;
    }
    if (!globalHashrate) {
      try {
        // Берём MAX за последние 10 минут, а не LIMIT 1.
        // Причина: из-за double-epoch bug два инстанса пишут разные global_hashrate
        // в одном 5-минутном слоте (~831 и ~994 GH/s). LIMIT 1 случайно хватает
        // то один, то другой → отображаемый доход скачет даже когда ферма не менялась.
        // MAX стабильно возвращает полное (верхнее) значение.
        const { rows: [lastEpoch] } = await pool.query(
          `SELECT MAX(global_hashrate) AS global_hashrate
           FROM epoch_log
           WHERE epoch_at > NOW() - INTERVAL '10 minutes'`,
        );
        globalHashrate = parseFloat(lastEpoch?.global_hashrate ?? '0');
      } catch { /* нет данных эпохи */ }
    }

    // ── Сетевая статистика ────────────────────
    const { rows: [netStats] } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM users)                         AS total_users,
         (SELECT COUNT(*) FROM gpus WHERE status = 'active') AS active_miners`,
    );

    // ── История заработка: читаем из БД (надёжно, не зависит от Redis) ──
    // epochRunner пишет в user_daily_earnings в той же транзакции что и creditUser
    let earningsData = { yesterdayTon: 0, yesterdayIgc: 0, weekTon: 0, weekIgc: 0 };
    try {
      const { rows: earnRows } = await pool.query<{
        date: string; ton_earned: string; igc_earned: string;
      }>(
        `SELECT date::text, ton_earned, igc_earned
         FROM user_daily_earnings
         WHERE user_id = $1
           AND date >= CURRENT_DATE - INTERVAL '7 days'
         ORDER BY date DESC`,
        [user.id],
      );
      const todayUtc     = new Date().toISOString().slice(0, 10);
      const yesterdayUtc = (() => {
        const d = new Date(); d.setUTCDate(d.getUTCDate() - 1);
        return d.toISOString().slice(0, 10);
      })();
      for (const row of earnRows) {
        const ton = parseFloat(row.ton_earned);
        const igc = parseFloat(row.igc_earned);
        if (row.date === yesterdayUtc) {
          earningsData.yesterdayTon = ton;
          earningsData.yesterdayIgc = igc;
        }
        // weekTon = последние 7 дней включая сегодня
        earningsData.weekTon += ton;
        earningsData.weekIgc += igc;
      }
    } catch (err: any) {
      console.error('[sync] earnings query failed:', err?.message);
    }

    // ── Лог транзакций (последние 30) ──────────────────────
    let txLog: Array<{ type: string; amountTon: number; amountIgc: number; createdAt: string }> = [];
    try {
      const { rows: txRows } = await pool.query(
        `SELECT type, amount_ton, amount_igc, created_at::text AS created_at
         FROM transactions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 30`,
        [user.id],
      );
      txLog = txRows.map(r => ({
        type:      r.type,
        amountTon: parseFloat(r.amount_ton ?? '0'),
        amountIgc: parseFloat(r.amount_igc ?? '0'),
        createdAt: r.created_at,
      }));
    } catch (err: any) {
      console.error('[sync] txlog query failed:', err?.message);
    }

    // ── Стейкинг (вычисляем до reply.send, чтобы не использовать async IIFE внутри объекта) ──
    const stakedTon      = parseFloat((snapshot.user as any)?.staked_ton ?? '0');
    const poolSize       = parseFloat(poolRow?.reserve_pool_ton ?? '0');
    const stakeDailyLimit = poolSize * STAKE_UNSTAKE_DAILY_LIMIT_PCT;
    const stakeIsToday   = poolRow?.staking_daily_unstake_date
      ? new Date(poolRow.staking_daily_unstake_date).toDateString() === new Date().toDateString()
      : false;
    const stakeAlreadyOut = stakeIsToday ? parseFloat(poolRow?.staking_daily_unstaked ?? '0') : 0;
    const igcRatioNow     = parseFloat(poolRow?.igc_ratio_smoothed ?? '1') || 1;
    const igcPerTonPerDay = Math.min(
      STAKE_IGC_MAX_PER_TON_PER_DAY,
      Math.max(STAKE_IGC_MIN_PER_TON_PER_DAY, STAKE_IGC_BASE_PER_TON_PER_DAY / igcRatioNow),
    );
    let stakingEarnedToday = 0;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const h = await redis.hgetall(`earn:stk:${user.id}:${today}`);
      stakingEarnedToday = parseFloat(h?.igc ?? '0');
    } catch { /* Redis недоступен */ }
    const stakingData = {
      stakedTon,
      dailyYieldIgc:       parseFloat((stakedTon * igcPerTonPerDay).toFixed(4)),
      stakingEarnedToday:  parseFloat(stakingEarnedToday.toFixed(4)),
      unstakeLimitTon:     parseFloat(stakeDailyLimit.toFixed(4)),
      unstakeRemainingTon: parseFloat(Math.max(0, stakeDailyLimit - stakeAlreadyOut).toFixed(4)),
    };

    // ── Рефералы игрока ──────────────────────
    let referrals: any[] = [];
    try {
      const { rows } = await pool.query(`
        SELECT r.level, r.created_at::text AS joined_at,
               u.tg_username, u.tg_user_id::text AS tg_user_id,
               COALESCE((
                 SELECT SUM(
                   CASE g2.model_tier
                     WHEN 0 THEN 0.1 WHEN 1 THEN 3  WHEN 2 THEN 6
                     WHEN 3 THEN 15  WHEN 4 THEN 45  WHEN 5 THEN 110
                     WHEN 6 THEN 250 ELSE 0 END
                   * CASE WHEN g2.overclocked THEN 1.2 ELSE 1 END
                   * CASE WHEN g2.undervolted THEN 0.85 ELSE 1 END
                 )
                 FROM farms f2
                 JOIN gpus g2 ON g2.farm_id = f2.id AND g2.status = 'active'
                 WHERE f2.user_id = u.id
               ), 0) AS hashrate_gh
        FROM referrals r
        JOIN users u ON u.id = r.invitee_id
        WHERE r.inviter_id = $1
        ORDER BY r.level ASC, r.created_at DESC
      `, [user.id]);
      referrals = rows;
    } catch (err: any) {
      console.error('[sync] referrals query failed:', err?.message);
    }

    // ── Активные системные события ────────────
    const { rows: events } = await pool.query(
      `SELECT type, payload, active_until FROM system_events WHERE active_until > NOW()`,
    );

    // ── Персональный бонус Удача майнера ─────
    let luckyBonus: { eventActive: boolean; claimed: boolean; bonusSecondsLeft: number; eventEndsIn: number } = {
      eventActive: false, claimed: false, bonusSecondsLeft: 0, eventEndsIn: 0,
    };
    try {
      const luckyEvent = events.find((e: any) => e.type === 'lucky_miner');
      if (luckyEvent) {
        luckyBonus.eventActive = true;
        luckyBonus.eventEndsIn = Math.max(0, Math.round((new Date(luckyEvent.active_until).getTime() - Date.now()) / 1000));
        const bonusTtl = await redis.ttl(`lucky_active:${user.id}`);
        luckyBonus.claimed = bonusTtl > 0;
        luckyBonus.bonusSecondsLeft = bonusTtl > 0 ? bonusTtl : 0;
      }
    } catch { /* Redis недоступен */ }

    // ── Данные синдиката игрока ───────────────
    let syndicateData: any = null;
    try {
      const { rows: [memberRow] } = await pool.query(
        `SELECT sm.syndicate_id, sm.role,
                s.name, s.level, s.xp, s.treasury_igc, s.leader_id,
                s.total_blocks_won, s.total_ton_earned, s.total_igc_earned,
                s.created_at
         FROM syndicate_members sm
         JOIN syndicates s ON s.id = sm.syndicate_id
         WHERE sm.user_id = $1`,
        [user.id],
      );
      if (memberRow) {
        const [{ rows: members }, { rows: activeBonuses }, { rows: [gpuCountRow] }] = await Promise.all([
          pool.query(
            `SELECT sm.user_id, sm.role, u.tg_username
             FROM syndicate_members sm
             JOIN users u ON u.id = sm.user_id
             WHERE sm.syndicate_id = $1
             ORDER BY sm.role DESC, sm.joined_at ASC`,
            [memberRow.syndicate_id],
          ),
          pool.query(
            `SELECT type, expires_at FROM syndicate_bonuses
             WHERE syndicate_id = $1 AND expires_at > NOW()`,
            [memberRow.syndicate_id],
          ),
          pool.query(
            `SELECT COUNT(g.id) AS active_gpu_count
             FROM syndicate_members sm
             JOIN gpus g ON g.user_id = sm.user_id AND g.status = 'active'
             WHERE sm.syndicate_id = $1`,
            [memberRow.syndicate_id],
          ),
        ]);

        const level = parseInt(memberRow.level);
        const xp    = parseFloat(memberRow.xp);
        // Найти применимый бонусный milestone
        const milestoneKeys = Object.keys(SYNDICATE_LEVEL_MILESTONES).map(Number).sort((a, b) => b - a);
        const activeMilestoneKey = milestoneKeys.find(k => level >= k);
        const passiveBonus  = activeMilestoneKey ? SYNDICATE_LEVEL_MILESTONES[activeMilestoneKey] : null;
        const maxMembers    = passiveBonus?.maxMembers ?? SYNDICATE_BASE_MAX_MEMBERS;

        // XP до следующего уровня
        let xpRemaining = xp;
        for (let i = 0; i < level - 1 && i < SYNDICATE_LEVEL_XP_COSTS.length; i++) {
          xpRemaining -= SYNDICATE_LEVEL_XP_COSTS[i];
        }
        const xpToNext = level < 50 ? SYNDICATE_LEVEL_XP_COSTS[level - 1] ?? 0 : 0;

        syndicateData = {
          id:             memberRow.syndicate_id,
          name:           memberRow.name,
          level,
          xp,
          xpToNext,
          xpProgress:    xpToNext > 0 ? Math.max(0, xpRemaining) : xp,
          treasuryIgc:   parseFloat(memberRow.treasury_igc),
          memberCount:   members.length,
          maxMembers,
          role:          memberRow.role,
          hashrateBonus: passiveBonus?.hashrateBonus ?? 0,
          wearReduction: passiveBonus?.wearReduction ?? 0,
          activeBonuses: activeBonuses.map((b: any) => ({ type: b.type, expiresAt: b.expires_at })),
          members:       members.map((m: any) => ({ userId: m.user_id, username: m.tg_username, role: m.role })),
          totalBlocksWon: parseInt(memberRow.total_blocks_won ?? '0', 10),
          totalTonEarned: parseFloat(memberRow.total_ton_earned ?? '0'),
          totalIgcEarned: parseFloat(memberRow.total_igc_earned ?? '0'),
          activeGpuCount: parseInt(gpuCountRow?.active_gpu_count ?? '0', 10),
          foundedAt:      memberRow.created_at ?? null,
        };
      }
    } catch (err: any) {
      console.error('[sync] syndicate query failed:', err?.message);
    }

    // ── snake_case → camelCase mapping ───────────
    const rawUser = snapshot.user as any;
    const rawFarm = snapshot.farm as any;
    const rawGpus = (snapshot.gpus ?? []) as any[];

    const mappedUser = rawUser ? {
      id:         rawUser.id,
      tgUserId:   String(rawUser.tg_user_id ?? ''),
      tonBalance: parseFloat(rawUser.ton_balance ?? '0'),
      igcBalance: parseFloat(rawUser.igc_balance ?? '0'),
      miningMode: rawUser.mining_mode ?? 'pool',
    } : null;

    const mappedFarm = rawFarm ? {
      id:              rawFarm.id,
      level:           rawFarm.level,
      coolingLevel:    rawFarm.cooling_level    ?? 0,
      workbenchLevel:  rawFarm.workbench_level  ?? 0,
      maxSlots:        rawFarm.max_slots ?? 5,
      igcBalance:      parseFloat(rawUser?.igc_balance ?? '0'),
      serverRoomLevel: rawFarm.server_room_level ?? 0,
      upsLevel:        rawFarm.ups_level         ?? 0,
      providerLevel:   rawFarm.provider_level    ?? 0,
    } : null;

    const mapGpu = (g: any) => ({
      id:            g.id,
      modelTier:     g.model_tier,
      health:        parseFloat(g.health ?? '100'),
      status:        g.status,
      overclocked:   g.overclocked ?? false,
      undervolted:   g.undervolted ?? false,
      coolingLevel:  g.coolingLevel  ?? g.cooling_level  ?? 1,  // camelCase (из rowToGpu) или snake_case
      isRefurbished: g.is_refurbished ?? g.isRefurbished ?? false,
      pasteLevel:    g.pasteLevel    ?? g.paste_level    ?? 0,  // 0 = не куплено
      fanLevel:      g.fanLevel      ?? g.fan_level      ?? 0,  // 0 = не куплено
    });

    const mappedGpus      = rawGpus.filter((g: any) => g.status !== 'stored').map(mapGpu);
    const mappedStoredGpus = rawGpus.filter((g: any) => g.status === 'stored').map(mapGpu);

    return reply.send({
      ok: true,
      data: {
        user:       mappedUser,
        farm:       mappedFarm,
        gpus:       mappedGpus,
        storedGpus: mappedStoredGpus,
        igc:   igcStatus,
        season: {
          day:        poolRow?.cycle_day ?? 1,
          name:       poolRow?.season ?? 'spring',
          dripRate:   parseFloat(seasonRate.toFixed(4)),
          phase:      poolRow?.current_phase ?? 1,
          poolTon:    parseFloat(poolRow?.reserve_pool_ton ?? '0'),
          totalPaid:  parseFloat(poolRow?.total_paid_out ?? '0'),
        },
        staking: stakingData,
        igcSupply: {
          totalMinted:     parseFloat(poolRow?.total_igc_minted ?? '0'),
          totalBurned:     parseFloat(poolRow?.total_igc_burned  ?? '0'),
          remaining:       10_000_000_000 - parseFloat(poolRow?.total_igc_minted ?? '0'),
          ratio:           igcRatio,
          pricePerIgc:     Math.max(0.00005, Math.min(0.0005, 0.0001 / Math.max(0.5, igcRatio))),
          electricityMult: parseFloat(electricityMult.toFixed(3)),
        },
        earnings: earningsData,
        txLog,
        tapBoost,
        network: {
          totalUsers:    parseInt(netStats?.total_users  ?? '0', 10),
          activeMiners:  parseInt(netStats?.active_miners ?? '0', 10),
          globalHashrate,
        },
        events: events.reduce((acc: Record<string, any>, e: any) => {
          if (e.type !== 'lucky_miner') acc[e.type] = e.payload; // lucky_miner управляется отдельно
          return acc;
        }, {}),
        luckyBonus,
        syndicate: syndicateData,
        referrals: referrals.map((r: any) => ({
          level:      parseInt(r.level),
          username:   r.tg_username ?? null,
          tgUserId:   r.tg_user_id,
          joinedAt:   r.joined_at,
          hashrateGh: parseFloat(r.hashrate_gh ?? '0'),
        })),
      },
    });
  });
}

// ── Регистрация нового игрока ──────────────────

async function registerNewPlayer(
  tgUser:  { id: number; first_name: string; username?: string },
  refCode?: string,
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Найти инвайтера по tg_user_id если передан ref
    let inviterId: string | null = null;
    if (refCode) {
      const { rows: [inv] } = await client.query(
        `SELECT id FROM users WHERE tg_user_id = $1`,
        [Number(refCode)],
      );
      inviterId = inv?.id ?? null;
    }

    // Создать пользователя (mining_mode = 'solo' по умолчанию из схемы БД)
    // ⚠️ БЕТА: новым игрокам выдаём 20 тестовых TON — убрать перед запуском смарт-контракта
    const BETA_START_TON = 20;
    const { rows: [newUser] } = await client.query(`
      INSERT INTO users (tg_user_id, tg_username, ton_balance, igc_balance, inviter_id)
      VALUES ($1, $2, $3, 150, $4)
      RETURNING id
    `, [tgUser.id, tgUser.username ?? null, BETA_START_TON, inviterId]);

    // Создать ферму (уровень 1 = Балкон, 5 слотов)
    const { rows: [farm] } = await client.query(`
      INSERT INTO farms (user_id, level, cooling_level, max_slots)
      VALUES ($1, 1, 0, 5)
      RETURNING id
    `, [newUser.id]);

    // Выдать USB-майнер (tier 0, бесплатный, вечный)
    await client.query(`
      INSERT INTO gpus (farm_id, user_id, model_tier, health, status, purchase_price_ton)
      VALUES ($1, $2, 0, 100, 'active', 0)
    `, [farm.id, newUser.id]);

    // Записать реферальные связи
    if (inviterId) {
      // L1: прямая связь
      await client.query(
        `INSERT INTO referrals (inviter_id, invitee_id, level) VALUES ($1, $2, 1)
         ON CONFLICT DO NOTHING`,
        [inviterId, newUser.id],
      );

      // L2: дедушка нового игрока
      const { rows: [inviter] } = await client.query(
        `SELECT inviter_id FROM users WHERE id = $1`,
        [inviterId],
      );
      if (inviter?.inviter_id) {
        await client.query(
          `INSERT INTO referrals (inviter_id, invitee_id, level) VALUES ($1, $2, 2)
           ON CONFLICT DO NOTHING`,
          [inviter.inviter_id, newUser.id],
        );
      }
    }

    await client.query('COMMIT');
    console.log(`[Sync] Новый игрок: tg_id=${tgUser.id}, ref=${refCode ?? 'none'}`);

    // Уведомляем инвайтеров о новом рефереле (fire-and-forget)
    if (inviterId) {
      const newName = tgUser.username
        ? `@${tgUser.username}`
        : tgUser.first_name;

      // L1 — прямой инвайтер
      const { rows: [l1] } = await pool.query(
        `SELECT tg_user_id FROM users WHERE id = $1`, [inviterId],
      );
      if (l1?.tg_user_id) {
        sendTgMessage(
          l1.tg_user_id,
          `👥 <b>Новый реферал (L1)!</b>\n\n` +
          `<b>${escapeHtml(newName)}</b> присоединился по твоей ссылке.\n` +
          `Ты получаешь <b>5%</b> от его хешрейта навсегда. 📈`,
        ).catch(() => {});
      }

      // L2 — дедушка нового игрока
      const { rows: [grandparent] } = await pool.query(
        `SELECT u.tg_user_id FROM users u
         JOIN users child ON child.id = $1
         WHERE u.id = child.inviter_id`,
        [inviterId],
      );
      if (grandparent?.tg_user_id) {
        sendTgMessage(
          grandparent.tg_user_id,
          `👥 <b>Новый реферал (L2)!</b>\n\n` +
          `<b>${escapeHtml(newName)}</b> вступил через твою реферальную сеть.\n` +
          `Ты получаешь <b>2%</b> от его хешрейта. 📈`,
        ).catch(() => {});
      }
    }

    return newUser;

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

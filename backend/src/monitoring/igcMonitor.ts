// ─────────────────────────────────────────────
// monitoring/igcMonitor.ts
//
// Отслеживает баланс IGC в сети за каждую эпоху и сутки.
// Логирует отношение supply/demand.
// Триггерит аварийные меры при выходе за пороги.
//
// Здоровый диапазон: supply/demand = 0.8 – 1.2
// ─────────────────────────────────────────────

import { Pool } from 'pg';
import { pgPoolConfig } from '../db/client';
import { redis } from '../redis/client';

const pool = new Pool(pgPoolConfig);

// ── Пороги ────────────────────────────────────
export const IGC_HEALTH = {
  RATIO_MIN:        0.8,   // ниже → дефицит IGC, Refurbish дорожает
  RATIO_MAX:        1.2,   // выше → профицит IGC, нужен burn-event
  CRITICAL_MIN:     0.5,   // критический дефицит → emergency mint
  CRITICAL_MAX:     2.0,   // критический профицит → emergency burn
  BUYBACK_SHARE:    0.15,  // 15% от admin_earned_ton идёт на buyback
  IGC_FLOOR_TON:    0.0001,// 1 IGC = минимум 0.0001 TON
  SUMMER_BURN_IGC:  500,   // стоимость «Сезонного разгона» в IGC
} as const;

// Redis-ключи для накопления за сутки
const R_SUPPLY  = 'igc:daily:supply';
const R_DEMAND  = 'igc:daily:demand';
const R_RATIO   = 'igc:daily:ratio';
const R_ALERT   = 'igc:alert:active';

// ── Типы ─────────────────────────────────────
export type IgcHealthStatus =
  | 'healthy'          // 0.8–1.2
  | 'mild_surplus'     // 1.2–2.0
  | 'mild_deficit'     // 0.5–0.8
  | 'critical_surplus' // > 2.0
  | 'critical_deficit' // < 0.5

export interface IgcEpochStats {
  epochSupply:   number;  // IGC произведено за эпоху
  epochDemand:   number;  // IGC потреблено за эпоху
  dailySupply:   number;  // накопленное за сутки
  dailyDemand:   number;  // накопленное за сутки
  ratio:         number;  // dailySupply / dailyDemand
  status:        IgcHealthStatus;
  actionTaken:   string | null;
}

export interface IgcMonitorLog {
  id?:            number;
  loggedAt:       Date;
  epochSupply:    number;
  epochDemand:    number;
  dailyRatio:     number;
  status:         IgcHealthStatus;
  actionTaken:    string | null;
  adminBuyback:   number; // TON потрачено на buyback
}

// ═════════════════════════════════════════════
// Основная функция — вызывается в конце каждой эпохи
// ═════════════════════════════════════════════

/**
 * @param epochSupply  — IGC добыто всеми майнерами в эту эпоху
 * @param epochDemand  — IGC потреблено (свет + износ + refurbish) в эту эпоху
 * @param adminTon     — текущий баланс admin_earned_ton (для buyback)
 */
export async function monitorIgcBalance(
  epochSupply:  number,
  epochDemand:  number,
  adminTon:     number,
): Promise<IgcEpochStats> {

  // ── Накапливаем суточные счётчики в БД (атомарный сброс при смене даты) ──
  // Надёжнее Redis: не теряется при перезапуске сервиса
  const { rows: [ps] } = await pool.query<{
    igc_daily_supply: string;
    igc_daily_demand: string;
    igc_ratio_smoothed: string;
  }>(`
    UPDATE pool_stats
    SET
      igc_daily_supply = CASE
        WHEN igc_daily_date = CURRENT_DATE THEN igc_daily_supply + $1
        ELSE $1
      END,
      igc_daily_demand = CASE
        WHEN igc_daily_date = CURRENT_DATE THEN igc_daily_demand + $2
        ELSE $2
      END,
      igc_daily_date = CURRENT_DATE
    WHERE id = 1
    RETURNING igc_daily_supply, igc_daily_demand, igc_ratio_smoothed
  `, [epochSupply, epochDemand]);

  const dailySupply = parseFloat(ps.igc_daily_supply);
  const dailyDemand = parseFloat(ps.igc_daily_demand);

  // ── Сглаженный ratio предыдущего шага ───────────────────
  const prevSmoothed = parseFloat(ps.igc_ratio_smoothed ?? '1');

  // ── Raw ratio из дневных накопителей ─────────────────────
  // Включает: майнинг + рефералы + sell_igc (supply — игрок выставляет IGC на продажу)
  //           электричество + ремонт + апгрейды + синдикаты + buy_igc (demand — игрок покупает IGC)
  // Защита от раннего утра: если накоплено < 1 IGC — слишком мало данных,
  // не меняем ratio (rawRatio = prevSmoothed → EMA не двигается).
  // Clamp [0.3, 4.0] до EMA — отсекает выбросы из одиночных крупных транзакций.
  const hasEnoughData = (dailySupply + dailyDemand) >= 1.0;
  const rawRatio = hasEnoughData
    ? Math.max(0.3, Math.min(4.0, dailySupply / Math.max(dailyDemand, 0.01)))
    : prevSmoothed; // недостаточно данных — держим текущее значение

  // ── EMA-сглаживание (α=0.04, ~4ч полупериод = 50 эпох) ──────────────────
  // α=0.04 vs старого 0.1: одиночный выброс двигает индекс на 4% вместо 10%.
  // Реальные изменения в экономике отражаются за 4–8 часов, не за минуты.
  const EMA_ALPHA = 0.04;
  const ratio     = EMA_ALPHA * rawRatio + (1 - EMA_ALPHA) * prevSmoothed;

  // Сохраняем сглаженный ratio в БД
  await pool.query(
    `UPDATE pool_stats SET igc_ratio_smoothed = $1 WHERE id = 1`,
    [parseFloat(ratio.toFixed(6))],
  );
  // Redis — best-effort кэш для getLiveIgcStatus
  try {
    await redis.set(R_RATIO, ratio.toFixed(6));
    await redis.set('igc:smoothed:ratio', ratio.toFixed(6));
  } catch { /* Redis недоступен — ratio читается из pool_stats */ }

  const status     = classifyRatio(ratio);
  let   actionTaken: string | null = null;
  let   adminBuyback = 0;

  // ── Аварийные меры ────────────────────────
  if (status === 'critical_surplus' || status === 'mild_surplus') {
    const action = await handleSurplus(ratio, adminTon);
    actionTaken  = action.description;
    adminBuyback = action.tonSpent;
  }

  if (status === 'critical_deficit' || status === 'mild_deficit') {
    const action = await handleDeficit(ratio);
    actionTaken  = action.description;
  }

  // ── Запись в БД ───────────────────────────
  await logToDb({
    loggedAt:    new Date(),
    epochSupply,
    epochDemand,
    dailyRatio:  ratio,
    status,
    actionTaken,
    adminBuyback,
  });

  console.log(
    `[IGC Monitor] ratio=${ratio.toFixed(3)} | ` +
    `supply=${dailySupply.toFixed(1)} | ` +
    `demand=${dailyDemand.toFixed(1)} | ` +
    `status=${status}` +
    (actionTaken ? ` | action=${actionTaken}` : ''),
  );

  return {
    epochSupply,
    epochDemand,
    dailySupply,
    dailyDemand,
    ratio,
    status,
    actionTaken,
  };
}

// ═════════════════════════════════════════════
// Классификация
// ═════════════════════════════════════════════

function classifyRatio(ratio: number): IgcHealthStatus {
  if (ratio >= IGC_HEALTH.CRITICAL_MAX) return 'critical_surplus';
  if (ratio >= IGC_HEALTH.RATIO_MAX)    return 'mild_surplus';
  if (ratio <= IGC_HEALTH.CRITICAL_MIN) return 'critical_deficit';
  if (ratio <= IGC_HEALTH.RATIO_MIN)    return 'mild_deficit';
  return 'healthy';
}

// ═════════════════════════════════════════════
// Обработка профицита IGC (слишком много IGC)
// ═════════════════════════════════════════════

async function handleSurplus(
  ratio:    number,
  adminTon: number,
): Promise<{ description: string; tonSpent: number }> {

  // Дедупликация через БД (Redis ненадёжен) — не дублируем активную меру
  // Mild surplus: buyback-ордер за последние 6 часов
  // Critical surplus: активный system_events 'emergency_burn'
  if (ratio < IGC_HEALTH.CRITICAL_MAX) {
    const { rows: [recent] } = await pool.query(
      `SELECT 1 FROM igc_buyback_orders WHERE created_at > NOW() - INTERVAL '6 hours' LIMIT 1`,
    );
    if (recent) return { description: 'surplus_already_active', tonSpent: 0 };
  } else {
    const { rows: [active] } = await pool.query(
      `SELECT 1 FROM system_events WHERE type = 'emergency_burn' AND active_until > NOW() LIMIT 1`,
    );
    if (active) return { description: 'surplus_already_active', tonSpent: 0 };
  }

  // Mild surplus (1.2–2.0): buyback IGC за 15% от admin_earned_ton
  if (ratio < IGC_HEALTH.CRITICAL_MAX) {
    const tonForBuyback = adminTon * IGC_HEALTH.BUYBACK_SHARE;
    const igcToBuy      = Math.floor(tonForBuyback / IGC_HEALTH.IGC_FLOOR_TON);

    await pool.query(`
      UPDATE pool_stats
      SET admin_earned_ton = admin_earned_ton - $1
      WHERE id = 1
    `, [tonForBuyback]);

    await pool.query(`
      INSERT INTO igc_buyback_orders (ton_allocated, igc_target, price_per_igc, status)
      VALUES ($1, $2, $3, 'open')
    `, [tonForBuyback, igcToBuy, IGC_HEALTH.IGC_FLOOR_TON]);

    try { await redis.set(R_ALERT, 'surplus', 'EX', 3600 * 6); } catch { /* Redis недоступен */ }
    return {
      description: `buyback_${igcToBuy}_igc_for_${tonForBuyback.toFixed(4)}_ton`,
      tonSpent:     tonForBuyback,
    };
  }

  // Critical surplus (> 2.0): активируем экстренный burn-event
  await pool.query(`
    INSERT INTO system_events (type, payload, active_until)
    VALUES ('emergency_burn', '{"discount_refurbish": 0.5, "boost_electricity": 1.3}',
            NOW() + INTERVAL '48 hours')
    ON CONFLICT (type) DO UPDATE
    SET active_until = NOW() + INTERVAL '48 hours'
  `);

  try { await redis.set(R_ALERT, 'surplus', 'EX', 3600 * 48); } catch { /* Redis недоступен */ }
  return {
    description: 'emergency_burn_event_48h',
    tonSpent:     0,
  };
}

// ═════════════════════════════════════════════
// Обработка дефицита IGC (слишком мало IGC)
// ═════════════════════════════════════════════

async function handleDeficit(
  ratio: number,
): Promise<{ description: string }> {

  // Дедупликация через БД (Redis ненадёжен) — проверяем активные system_events
  const eventType = ratio > IGC_HEALTH.CRITICAL_MIN ? 'refurbish_discount' : 'electricity_discount';
  const { rows: [active] } = await pool.query(
    `SELECT 1 FROM system_events WHERE type = $1 AND active_until > NOW() LIMIT 1`,
    [eventType],
  );
  if (active) return { description: 'deficit_already_active' };

  // Mild deficit: снижаем стоимость Refurbish на 20%
  if (ratio > IGC_HEALTH.CRITICAL_MIN) {
    await pool.query(`
      INSERT INTO system_events (type, payload, active_until)
      VALUES ('refurbish_discount', '{"multiplier": 0.8}',
              NOW() + INTERVAL '24 hours')
      ON CONFLICT (type) DO UPDATE
      SET payload = '{"multiplier": 0.8}',
          active_until = NOW() + INTERVAL '24 hours'
    `);
    try { await redis.set(R_ALERT, 'deficit', 'EX', 3600 * 24); } catch { /* Redis недоступен */ }
    return { description: 'refurbish_discount_20pct_24h' };
  }

  // Critical deficit: снижаем стоимость электричества на 30% на 24 часа
  await pool.query(`
    INSERT INTO system_events (type, payload, active_until)
    VALUES ('electricity_discount', '{"multiplier": 0.7}',
            NOW() + INTERVAL '24 hours')
    ON CONFLICT (type) DO UPDATE
    SET payload = '{"multiplier": 0.7}',
        active_until = NOW() + INTERVAL '24 hours'
  `);
  try { await redis.set(R_ALERT, 'deficit', 'EX', 3600 * 24); } catch { /* Redis недоступен */ }
  return { description: 'electricity_discount_30pct_24h' };
}

// ═════════════════════════════════════════════
// Запись лога в БД
// ═════════════════════════════════════════════

async function logToDb(log: IgcMonitorLog): Promise<void> {
  await pool.query(`
    INSERT INTO igc_monitor_log
      (logged_at, epoch_supply, epoch_demand, daily_ratio, status, action_taken, admin_buyback_ton)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [
    log.loggedAt,
    log.epochSupply,
    log.epochDemand,
    log.dailyRatio,
    log.status,
    log.actionTaken,
    log.adminBuyback,
  ]);
}

// ═════════════════════════════════════════════
// Утилиты для dashboard / аналитики
// ═════════════════════════════════════════════

/** Текущий live-статус (для /api/sync) — читает из БД, Redis как кэш */
export async function getLiveIgcStatus(): Promise<{
  ratio:  number;
  status: IgcHealthStatus;
  supply: number;
  demand: number;
}> {
  // Источник правды — pool_stats в БД (не сбрасывается при рестарте Redis)
  try {
    const { rows: [ps] } = await pool.query<{
      igc_ratio_smoothed: string;
      igc_daily_supply:   string;
      igc_daily_demand:   string;
    }>(`SELECT igc_ratio_smoothed, igc_daily_supply, igc_daily_demand
        FROM pool_stats WHERE id = 1`);

    const ratio = parseFloat(ps?.igc_ratio_smoothed ?? '1');
    return {
      ratio,
      status: classifyRatio(ratio),
      supply: parseFloat(ps?.igc_daily_supply ?? '0'),
      demand: parseFloat(ps?.igc_daily_demand ?? '0'),
    };
  } catch {
    return { ratio: 1, status: 'healthy', supply: 0, demand: 0 };
  }
}

/** История за последние N суток (для графика в дашборде) */
export async function getIgcHistory(days: number = 7) {
  const { rows } = await pool.query(`
    SELECT
      DATE_TRUNC('day', logged_at) AS day,
      AVG(daily_ratio)             AS avg_ratio,
      SUM(epoch_supply)            AS total_supply,
      SUM(epoch_demand)            AS total_demand,
      MODE() WITHIN GROUP (ORDER BY status) AS dominant_status
    FROM igc_monitor_log
    WHERE logged_at > NOW() - INTERVAL '${days} days'
    GROUP BY 1
    ORDER BY 1 DESC
  `);
  return rows;
}

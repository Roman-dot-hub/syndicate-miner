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
import { redis } from '../redis/client';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

  // ── Накапливаем суточные счётчики в Redis ──
  const [dailySupplyRaw, dailyDemandRaw] = await Promise.all([
    redis.incrbyfloat(R_SUPPLY, epochSupply),
    redis.incrbyfloat(R_DEMAND, epochDemand),
  ]);

  // TTL 25 часов — автосброс после суток
  await redis.expire(R_SUPPLY, 25 * 3600);
  await redis.expire(R_DEMAND, 25 * 3600);

  const dailySupply = parseFloat(dailySupplyRaw);
  const dailyDemand = parseFloat(dailyDemandRaw);

  // ── Считаем отношение ─────────────────────
  // Избегаем деления на ноль в начале суток
  const ratio = dailyDemand > 0.01
    ? dailySupply / dailyDemand
    : dailySupply > 0 ? 99 : 1; // много supply без demand = гиперинфляция

  await redis.set(R_RATIO, ratio.toFixed(4));

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

  // Уже активна мера — не дублируем
  const alertActive = await redis.get(R_ALERT);
  if (alertActive === 'surplus') {
    return { description: 'surplus_already_active', tonSpent: 0 };
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

    // Создаём системный ордер на покупку IGC по floor-цене
    await pool.query(`
      INSERT INTO igc_buyback_orders (ton_allocated, igc_target, price_per_igc, status)
      VALUES ($1, $2, $3, 'open')
    `, [tonForBuyback, igcToBuy, IGC_HEALTH.IGC_FLOOR_TON]);

    await redis.set(R_ALERT, 'surplus', 'EX', 3600 * 6);

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

  await redis.set(R_ALERT, 'surplus', 'EX', 3600 * 48);

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

  const alertActive = await redis.get(R_ALERT);
  if (alertActive === 'deficit') {
    return { description: 'deficit_already_active' };
  }

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

    await redis.set(R_ALERT, 'deficit', 'EX', 3600 * 24);
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

  await redis.set(R_ALERT, 'deficit', 'EX', 3600 * 24);
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

/** Текущий live-статус из Redis (для /api/sync) */
export async function getLiveIgcStatus(): Promise<{
  ratio:  number;
  status: IgcHealthStatus;
  supply: number;
  demand: number;
}> {
  const [ratioRaw, supplyRaw, demandRaw] = await Promise.all([
    redis.get(R_RATIO),
    redis.get(R_SUPPLY),
    redis.get(R_DEMAND),
  ]);

  const ratio = parseFloat(ratioRaw ?? '1');
  return {
    ratio,
    status: classifyRatio(ratio),
    supply: parseFloat(supplyRaw ?? '0'),
    demand: parseFloat(demandRaw ?? '0'),
  };
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

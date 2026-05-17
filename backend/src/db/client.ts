// ─────────────────────────────────────────────
// db/client.ts — типизированный клиент PostgreSQL
//
// Использует pg (node-postgres) напрямую.
// Все методы, которые нужны epochRunner, реализованы здесь.
// ─────────────────────────────────────────────

import { Pool, PoolClient } from 'pg';
import type { GPU, Farm, User, PoolStats } from '../epoch/types';

// Тип публичного интерфейса БД (используется для типизации транзакций)
export type DbClient = {
  getPoolStats(): Promise<PoolStats>;
  getActiveFarms(): Promise<Farm[]>;
  getAllUsers(): Promise<(User & { inviter_id?: string })[]>;
  getActiveFarmGpus(farmId: string): Promise<GPU[]>;
  getActiveSystemEvents(): Promise<Array<{ type: string; payload: Record<string, number> }>>;
  creditUser(userId: string, amounts: { ton: number; igc: number }, client?: PoolClient): Promise<void>;
  updateGpu(gpuId: string, fields: { health?: number; status?: string }, client?: PoolClient): Promise<void>;
  updateFarmIgc(farmId: string, igcBalance: number, client?: PoolClient): Promise<void>;
  updatePoolStats(stats: PoolStats, client?: PoolClient): Promise<void>;
  insertEpochLog(data: {
    epochAt: Date; globalHashrate: number; rewardDistributed: number;
    poolAfter: number; phase: number; activeMinerCount: number;
    soloWinnerId?: string | null; halvingTriggered?: boolean; errors?: string[];
  }, client?: PoolClient): Promise<number>;
  transaction<T>(fn: (trx: DbClient) => Promise<T>): Promise<T>;
};

// ── Общий конфиг пула (используй во всех файлах) ──
export const pgPoolConfig = {
  connectionString:       process.env.DATABASE_URL,
  max:                    20,
  idleTimeoutMillis:      30_000,
  connectionTimeoutMillis: 10_000,
  ssl: process.env.DATABASE_URL?.includes('supabase.co') ||
       process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : false,
} as const;

// ── Подключение ───────────────────────────────
const pool = new Pool(pgPoolConfig);

pool.on('error', (err) => {
  console.error('[DB] Неожиданная ошибка пула:', err);
});

// ── Хелпер: маппинг строки БД → GPU ──────────
function rowToGpu(row: Record<string, unknown>): GPU {
  return {
    id:            row.id           as string,
    farmId:        row.farm_id      as string,
    userId:        row.user_id      as string,
    modelTier:     row.model_tier   as number,
    health:        parseFloat(row.health as string),
    overclocked:   row.overclocked  as boolean,
    coolingLevel:  row.cooling_level as number,
    status:        row.status       as GPU['status'],
    isRefurbished: row.is_refurbished as boolean,
  };
}

function rowToFarm(row: Record<string, unknown>): Farm {
  return {
    id:           row.id           as string,
    userId:       row.user_id      as string,
    miningMode:   row.mining_mode  as Farm['miningMode'],
    level:        row.level        as number,
    coolingLevel: row.cooling_level as number,
    igcBalance:   parseFloat(row.igc_balance as string),
  };
}

function rowToUser(row: Record<string, unknown>): User & { inviter_id?: string; baseHashrate?: number } {
  return {
    id:           row.id           as string,
    tgUserId:     String(row.tg_user_id),
    tonBalance:   parseFloat(row.ton_balance as string),
    igcBalance:   parseFloat(row.igc_balance as string),
    miningMode:   row.mining_mode  as User['miningMode'],
    referrals_l1: [],  // заполняется отдельно
    referrals_l2: [],
    inviter_id:   row.inviter_id as string | undefined,
    baseHashrate: 0,   // заполняется в epochRunner
  };
}

function rowToPoolStats(row: Record<string, unknown>): PoolStats {
  return {
    reservePoolTon: parseFloat(row.reserve_pool_ton as string),
    dripRate:       parseFloat(row.drip_rate        as string),
    currentPhase:   row.current_phase as PoolStats['currentPhase'],
    totalPaidOut:   parseFloat(row.total_paid_out   as string),
    adminEarnedTon: parseFloat(row.admin_earned_ton as string),
  };
}

// ── Публичный интерфейс БД ─────────────────────

export const db: DbClient = {

  // Глобальное состояние пула (singleton-строка)
  async getPoolStats(): Promise<PoolStats> {
    const { rows } = await pool.query('SELECT * FROM pool_stats WHERE id = 1');
    return rowToPoolStats(rows[0]);
  },

  // Все активные фермы (у которых есть хотя бы один active GPU)
  async getActiveFarms(): Promise<Farm[]> {
    const { rows } = await pool.query(`
      SELECT f.*, u.igc_balance
      FROM   farms f
      JOIN   users u ON u.id = f.user_id
      WHERE  EXISTS (
        SELECT 1 FROM gpus g
        WHERE  g.farm_id = f.id AND g.status = 'active'
      )
    `);
    return rows.map(rowToFarm);
  },

  // Все пользователи с рефералами (для расчёта реф.хешрейта)
  async getAllUsers(): Promise<(User & { inviter_id?: string })[]> {
    const { rows: userRows } = await pool.query(`
      SELECT u.*,
             COALESCE(l1.ids, '{}') AS ref_l1_ids,
             COALESCE(l2.ids, '{}') AS ref_l2_ids
      FROM users u
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(invitee_id::text) AS ids
        FROM   referrals
        WHERE  inviter_id = u.id AND level = 1
      ) l1 ON true
      LEFT JOIN LATERAL (
        SELECT ARRAY_AGG(invitee_id::text) AS ids
        FROM   referrals
        WHERE  inviter_id = u.id AND level = 2
      ) l2 ON true
    `);

    return userRows.map(row => ({
      ...rowToUser(row),
      referrals_l1: (row.ref_l1_ids as string[]) ?? [],
      referrals_l2: (row.ref_l2_ids as string[]) ?? [],
    }));
  },

  // Active GPU конкретной фермы
  async getActiveFarmGpus(farmId: string): Promise<GPU[]> {
    const { rows } = await pool.query(`
      SELECT g.*, f.cooling_level
      FROM   gpus g
      JOIN   farms f ON f.id = g.farm_id
      WHERE  g.farm_id = $1 AND g.status = 'active'
    `, [farmId]);
    return rows.map(rowToGpu);
  },

  // Активные системные события (emergency_burn, electricity_discount, refurbish_discount)
  async getActiveSystemEvents(): Promise<Array<{ type: string; payload: Record<string, number> }>> {
    const { rows } = await pool.query(
      `SELECT type, payload FROM system_events WHERE active_until > NOW()`,
    );
    return rows as Array<{ type: string; payload: Record<string, number> }>;
  },

  // Начисление TON и IGC пользователю
  async creditUser(
    userId: string,
    { ton, igc }: { ton: number; igc: number },
    client?: PoolClient,
  ): Promise<void> {
    const q = client ?? pool;
    await q.query(`
      UPDATE users
      SET    ton_balance = ton_balance + $1,
             igc_balance = igc_balance + $2
      WHERE  id = $3
    `, [ton, igc, userId]);
  },

  // Обновление здоровья и статуса GPU
  async updateGpu(
    gpuId:  string,
    fields: { health?: number; status?: string },
    client?: PoolClient,
  ): Promise<void> {
    const q = client ?? pool;
    const sets: string[] = [];
    const vals: unknown[] = [];
    let   i = 1;

    if (fields.health !== undefined) { sets.push(`health = $${i++}`); vals.push(fields.health); }
    if (fields.status !== undefined) { sets.push(`status = $${i++}`); vals.push(fields.status); }

    if (sets.length === 0) return;
    vals.push(gpuId);
    await q.query(`UPDATE gpus SET ${sets.join(', ')} WHERE id = $${i}`, vals);
  },

  // Обновление IGC-баланса фермы (после списания электричества)
  async updateFarmIgc(farmId: string, igcBalance: number, client?: PoolClient): Promise<void> {
    const q = client ?? pool;
    await q.query('UPDATE users u SET igc_balance = $1 FROM farms f WHERE f.id = $2 AND f.user_id = u.id',
      [igcBalance, farmId]);
  },

  // Обновление глобального pool_stats
  async updatePoolStats(stats: PoolStats, client?: PoolClient): Promise<void> {
    const q = client ?? pool;
    await q.query(`
      UPDATE pool_stats SET
        reserve_pool_ton = $1,
        drip_rate        = $2,
        current_phase    = $3,
        total_paid_out   = $4,
        admin_earned_ton = $5,
        updated_at       = NOW()
      WHERE id = 1
    `, [
      stats.reservePoolTon,
      stats.dripRate,
      stats.currentPhase,
      stats.totalPaidOut,
      stats.adminEarnedTon,
    ]);
  },

  // Запись лога эпохи
  async insertEpochLog(data: {
    epochAt:           Date;
    globalHashrate:    number;
    rewardDistributed: number;
    poolAfter:         number;
    phase:             number;
    activeMinerCount:  number;
    soloWinnerId?:     string | null;
    halvingTriggered?: boolean;
    errors?:           string[];
  }, client?: PoolClient): Promise<number> {
    const q = client ?? pool;
    const { rows } = await q.query(`
      INSERT INTO epoch_log
        (epoch_at, global_hashrate, reward_distributed, pool_after,
         phase, active_miner_count, solo_winner_id, halving_triggered, errors)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id
    `, [
      data.epochAt,
      data.globalHashrate,
      data.rewardDistributed,
      data.poolAfter,
      data.phase,
      data.activeMinerCount,
      data.soloWinnerId ?? null,
      data.halvingTriggered ?? false,
      data.errors ?? [],
    ]);
    return rows[0].id as number;
  },

  // ── Транзакция (передаётся в epochRunner) ────
  async transaction<T>(
    fn: (trx: typeof db & { _client: PoolClient }) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Создаём контекст транзакции — все методы db, но с client
      const trx = {
        ...db,
        _client:        client,
        creditUser:     (id: string, amounts: { ton: number; igc: number }) =>
                          db.creditUser(id, amounts, client),
        updateGpu:      (id: string, f: { health?: number; status?: string }) =>
                          db.updateGpu(id, f, client),
        updateFarmIgc:  (farmId: string, bal: number) =>
                          db.updateFarmIgc(farmId, bal, client),
        updatePoolStats:(s: PoolStats) => db.updatePoolStats(s, client),
        insertEpochLog: (d: Parameters<typeof db.insertEpochLog>[0]) =>
                          db.insertEpochLog(d, client),
      };

      const result = await fn(trx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

export default db;

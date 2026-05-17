// ─────────────────────────────────────────────
// db/queries.ts — дополнительные методы БД
//
// Методы для: Marketplace, Refurbish,
// Auth (anti-кит), /api/sync (frontend)
// ─────────────────────────────────────────────

import { Pool } from 'pg';
import { pgPoolConfig } from './client';
import { GPU_SPECS, PHASE1_MAX_DAILY_SPEND_TON } from '../epoch/constants';

const pool = new Pool(pgPoolConfig);

// ══════════════════════════════════════════════
// MARKETPLACE
// ══════════════════════════════════════════════

/**
 * Рассчитывает рыночную цену GPU с учётом tier и health.
 * Используется для установки ценового коридора ±20%.
 *
 * Базовая цена × (health/100) × коэффициент tier
 */
const BASE_PRICES: Record<number, number> = {
  0: 0, 1: 1, 2: 2.5, 3: 8, 4: 25, 5: 70, 6: 200,
};

export function calcMarketPrice(modelTier: number, health: number): number {
  const base  = BASE_PRICES[modelTier] ?? 1;
  const decay = 0.3 + (health / 100) * 0.7; // от 30% до 100% от базы
  return parseFloat((base * decay).toFixed(4));
}

export const marketplace = {

  /** Создать лот. Цены min/max рассчитываются автоматически. */
  async createListing(data: {
    sellerId:      string;
    gpuId:         string;
    modelTier:     number;
    healthSnapshot: number;
    isRefurbished: boolean;
    priceTon:      number;
  }) {
    const marketPrice = calcMarketPrice(data.modelTier, data.healthSnapshot);
    const priceMin    = parseFloat((marketPrice * 0.80).toFixed(4));
    const priceMax    = parseFloat((marketPrice * 1.20).toFixed(4));

    if (data.priceTon < priceMin || data.priceTon > priceMax) {
      throw new Error(
        `Цена вне коридора: ${data.priceTon} TON. Допустимо: ${priceMin}–${priceMax} TON`,
      );
    }

    const { rows } = await pool.query(`
      INSERT INTO marketplace
        (seller_id, gpu_id, model_tier, health_snapshot,
         is_refurbished, price_ton, price_min_ton, price_max_ton)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `, [
      data.sellerId, data.gpuId, data.modelTier, data.healthSnapshot,
      data.isRefurbished, data.priceTon, priceMin, priceMax,
    ]);

    // GPU переходит в статус 'offline' (недоступен для майнинга пока на продаже)
    await pool.query(`UPDATE gpus SET status = 'offline' WHERE id = $1`, [data.gpuId]);

    return rows[0];
  },

  /** Список открытых лотов с фильтрацией. */
  async getListings(filter: {
    modelTier?: number;
    maxPrice?:  number;
    limit?:     number;
    offset?:    number;
  } = {}) {
    const conditions = ["m.status = 'open'", "m.expires_at > NOW()"];
    const params: unknown[] = [];
    let i = 1;

    if (filter.modelTier !== undefined) {
      conditions.push(`m.model_tier = $${i++}`);
      params.push(filter.modelTier);
    }
    if (filter.maxPrice !== undefined) {
      conditions.push(`m.price_ton <= $${i++}`);
      params.push(filter.maxPrice);
    }

    params.push(filter.limit  ?? 20);
    params.push(filter.offset ?? 0);

    const { rows } = await pool.query(`
      SELECT m.*,
             g.overclocked,
             -- Скрываем seller_id (слепой стакан)
             NULL::uuid AS seller_id
      FROM   marketplace m
      JOIN   gpus g ON g.id = m.gpu_id
      WHERE  ${conditions.join(' AND ')}
      ORDER  BY m.price_ton ASC
      LIMIT  $${i++} OFFSET $${i++}
    `, params);

    return rows;
  },

  /** Покупка лота. Атомарная передача GPU и TON. */
  async buyListing(listingId: string, buyerId: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Блокируем лот для изменения
      const { rows: [listing] } = await client.query(
        `SELECT * FROM marketplace WHERE id = $1 AND status = 'open' FOR UPDATE`,
        [listingId],
      );
      if (!listing) throw new Error('Лот не найден или уже продан');

      // Проверяем баланс покупателя
      const { rows: [buyer] } = await client.query(
        `SELECT ton_balance FROM users WHERE id = $1 FOR UPDATE`,
        [buyerId],
      );
      if (parseFloat(buyer.ton_balance) < listing.price_ton) {
        throw new Error('Недостаточно TON');
      }

      const commission = parseFloat((listing.price_ton * 0.05).toFixed(8)); // 5%
      const sellerGets = parseFloat((listing.price_ton - commission).toFixed(8));

      // Списываем у покупателя
      await client.query(
        `UPDATE users SET ton_balance = ton_balance - $1 WHERE id = $2`,
        [listing.price_ton, buyerId],
      );
      // Начисляем продавцу (минус комиссия)
      await client.query(
        `UPDATE users SET ton_balance = ton_balance + $1 WHERE id = $2`,
        [sellerGets, listing.seller_id],
      );
      // Комиссия — в admin_earned_ton
      await client.query(
        `UPDATE pool_stats SET admin_earned_ton = admin_earned_ton + $1 WHERE id = 1`,
        [commission],
      );
      // GPU переходит к покупателю
      await client.query(
        `UPDATE gpus SET user_id = $1, farm_id = (
           SELECT id FROM farms WHERE user_id = $1
         ), status = 'active' WHERE id = $2`,
        [buyerId, listing.gpu_id],
      );
      // Закрываем лот
      await client.query(
        `UPDATE marketplace SET status = 'sold', buyer_id = $1, sold_at = NOW() WHERE id = $2`,
        [buyerId, listingId],
      );

      await client.query('COMMIT');
      return { sellerGets, commission };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /** Снять лот с продажи (возврат GPU продавцу). */
  async cancelListing(listingId: string, sellerId: string) {
    const { rows: [listing] } = await pool.query(
      `UPDATE marketplace SET status = 'cancelled'
       WHERE id = $1 AND seller_id = $2 AND status = 'open'
       RETURNING gpu_id`,
      [listingId, sellerId],
    );
    if (!listing) throw new Error('Лот не найден');
    await pool.query(`UPDATE gpus SET status = 'active' WHERE id = $1`, [listing.gpu_id]);
  },

  /** Истёкшие лоты → cancelled, GPU возвращаем. Запускать кроном раз в час. */
  async expireOldListings() {
    const { rows } = await pool.query(`
      UPDATE marketplace SET status = 'expired'
      WHERE  status = 'open' AND expires_at < NOW()
      RETURNING gpu_id
    `);
    if (rows.length > 0) {
      const ids = rows.map((r: { gpu_id: string }) => r.gpu_id);
      await pool.query(
        `UPDATE gpus SET status = 'active' WHERE id = ANY($1::uuid[])`,
        [ids],
      );
    }
    return rows.length;
  },
};

// ══════════════════════════════════════════════
// REFURBISH (Верстак)
// ══════════════════════════════════════════════

export const refurbish = {

  /** Проверяет, может ли ферма восстановить GPU данного тира. */
  canRefurbish(workbenchLevel: number, modelTier: number): boolean {
    if (workbenchLevel === 0) return false;
    if (workbenchLevel === 1) return modelTier <= 2;  // T1–T2
    if (workbenchLevel === 2) return modelTier <= 4;  // T3–T4
    return true;                                      // T5–T6 (ASIC)
  },

  /**
   * Восстановить GPU: health → 100, is_refurbished → true.
   * Списывает IGC с пользователя.
   */
  async restoreGpu(userId: string, gpuId: string, costIgc: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [user] } = await client.query(
        `SELECT igc_balance FROM users WHERE id = $1 FOR UPDATE`,
        [userId],
      );
      if (parseFloat(user.igc_balance) < costIgc) {
        throw new Error('Недостаточно IGC для восстановления');
      }

      await client.query(
        `UPDATE users SET igc_balance = igc_balance - $1 WHERE id = $2`,
        [costIgc, userId],
      );
      await client.query(
        `UPDATE gpus SET health = 100, is_refurbished = TRUE, status = 'active'
         WHERE id = $1 AND user_id = $2`,
        [gpuId, userId],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

// ══════════════════════════════════════════════
// ANTI-КИТ (Фаза 1)
// ══════════════════════════════════════════════

export const antiWhale = {

  /**
   * Проверяет и фиксирует трату TON в Фазе 1.
   * Если лимит 30 TON/сутки превышен — бросает ошибку.
   */
  async checkAndRecordSpend(userId: string, amountTon: number, currentPhase: number) {
    if (currentPhase > 1) return; // лимит только в Фазе 1

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [user] } = await client.query(
        `SELECT daily_spend_ton, last_spend_reset FROM users WHERE id = $1 FOR UPDATE`,
        [userId],
      );

      // Сбрасываем счётчик если прошли сутки
      const resetAt  = new Date(user.last_spend_reset);
      const now      = new Date();
      const diffHrs  = (now.getTime() - resetAt.getTime()) / 3_600_000;

      let currentSpend = parseFloat(user.daily_spend_ton);
      if (diffHrs >= 24) {
        currentSpend = 0;
        await client.query(
          `UPDATE users SET daily_spend_ton = 0, last_spend_reset = NOW() WHERE id = $1`,
          [userId],
        );
      }

      if (currentSpend + amountTon > PHASE1_MAX_DAILY_SPEND_TON) {
        throw new Error(
          `Лимит Фазы 1: максимум ${PHASE1_MAX_DAILY_SPEND_TON} TON в сутки. ` +
          `Потрачено: ${currentSpend.toFixed(2)}, запрошено: ${amountTon}`,
        );
      }

      await client.query(
        `UPDATE users SET daily_spend_ton = daily_spend_ton + $1 WHERE id = $2`,
        [amountTon, userId],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /** Проверка лимита ASIC (max 2 в Фазе 1 без whitelist). */
  async checkAsicLimit(userId: string, currentPhase: number) {
    if (currentPhase > 1) return;

    const { rows: [user] } = await pool.query(
      `SELECT whitelist_asic FROM users WHERE id = $1`, [userId],
    );

    const { rows: [cnt] } = await pool.query(
      `SELECT COUNT(*) AS n FROM gpus
       WHERE user_id = $1 AND model_tier = 5 AND status != 'broken'`,
      [userId],
    );

    const maxAllowed = user.whitelist_asic ? 999 : 2;
    if (parseInt(cnt.n) >= maxAllowed) {
      throw new Error(
        `Лимит Фазы 1: не более ${maxAllowed} ASIC-майнера на аккаунт. Запросите whitelist.`,
      );
    }
  },
};

// ══════════════════════════════════════════════
// /api/sync — данные для frontend
// ══════════════════════════════════════════════

export const sync = {

  /** Полный снапшот состояния игрока для /api/sync */
  async getUserSnapshot(userId: string) {
    const [
      { rows: [user] },
      { rows: gpus  },
      { rows: [farm] },
      { rows: [pool_row] },
      { rows: refRows },
    ] = await Promise.all([
      pool.query(
        `SELECT id, ton_balance, igc_balance, mining_mode,
                daily_spend_ton, last_spend_reset
         FROM users WHERE id = $1`,
        [userId],
      ),
      pool.query(
        `SELECT g.*, f.cooling_level
         FROM gpus g JOIN farms f ON f.id = g.farm_id
         WHERE g.user_id = $1 ORDER BY g.created_at`,
        [userId],
      ),
      pool.query(
        `SELECT f.*, COALESCE(gpu_count.n, 0) AS active_gpu_count
         FROM farms f
         LEFT JOIN (
           SELECT farm_id, COUNT(*) AS n FROM gpus
           WHERE status = 'active' GROUP BY farm_id
         ) gpu_count ON gpu_count.farm_id = f.id
         WHERE f.user_id = $1`,
        [userId],
      ),
      pool.query(`SELECT reserve_pool_ton, drip_rate, current_phase FROM pool_stats WHERE id = 1`),
      pool.query(
        `SELECT r.level, COUNT(*) AS count,
                COALESCE(SUM(u2.igc_balance * 0), 0) AS placeholder
         FROM referrals r
         JOIN users u2 ON u2.id = r.invitee_id
         WHERE r.inviter_id = $1
         GROUP BY r.level`,
        [userId],
      ),
    ]);

    return {
      user:     user  ?? null,
      gpus:     gpus  ?? [],
      farm:     farm  ?? null,
      pool:     pool_row ?? null,
      referrals: refRows,
    };
  },
};

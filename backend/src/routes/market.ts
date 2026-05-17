// ─────────────────────────────────────────────
// routes/market.ts  →  /api/market/*
// ─────────────────────────────────────────────

import { FastifyInstance }  from 'fastify';
import { telegramAuthHook } from '../auth/telegramAuth';
import { marketplace, refurbish } from '../db/queries';
import { refurbishCost }    from '../epoch/wearEngine';
import { Pool }             from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function marketRoutes(app: FastifyInstance) {

  // ── GET /api/market — список открытых лотов ─
  app.get('/api/market', {
    preHandler: telegramAuthHook,
  }, async (req, reply) => {
    const q = req.query as Record<string, string>;
    const listings = await marketplace.getListings({
      modelTier: q.tier  ? parseInt(q.tier)  : undefined,
      maxPrice:  q.max   ? parseFloat(q.max) : undefined,
      limit:     q.limit ? parseInt(q.limit) : 20,
      offset:    q.page  ? parseInt(q.page) * 20 : 0,
    });
    return reply.send({ ok: true, data: listings });
  });

  // ── POST /api/market/list — выставить GPU на продажу ─
  app.post('/api/market/list', {
    preHandler: telegramAuthHook,
  }, async (req, reply) => {
    const tgUser = (req as any).tgUser;
    const { gpuId, priceTon } = req.body as { gpuId: string; priceTon: number };

    if (!gpuId || !priceTon || priceTon <= 0) {
      return reply.code(400).send({ error: 'gpuId и priceTon обязательны' });
    }

    const { rows: [user] } = await pool.query(
      `SELECT id FROM users WHERE tg_user_id = $1`, [tgUser.id],
    );
    if (!user) return reply.code(404).send({ error: 'Пользователь не найден' });

    const { rows: [gpu] } = await pool.query(
      `SELECT * FROM gpus WHERE id = $1 AND user_id = $2 AND status != 'broken'`,
      [gpuId, user.id],
    );
    if (!gpu) return reply.code(404).send({ error: 'GPU не найдена или сломана' });

    // Нельзя продавать USB Nano (T0)
    if (gpu.model_tier === 0) {
      return reply.code(400).send({ error: 'USB Nano нельзя продать' });
    }

    try {
      const listing = await marketplace.createListing({
        sellerId:       user.id,
        gpuId,
        modelTier:      gpu.model_tier,
        healthSnapshot: parseFloat(gpu.health),
        isRefurbished:  gpu.is_refurbished,
        priceTon,
      });
      return reply.send({ ok: true, listingId: listing.id });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // ── POST /api/market/buy — купить лот ─────
  app.post('/api/market/buy', {
    preHandler: telegramAuthHook,
  }, async (req, reply) => {
    const tgUser = (req as any).tgUser;
    const { listingId } = req.body as { listingId: string };

    const { rows: [user] } = await pool.query(
      `SELECT id FROM users WHERE tg_user_id = $1`, [tgUser.id],
    );
    if (!user) return reply.code(404).send({ error: 'Пользователь не найден' });

    try {
      const result = await marketplace.buyListing(listingId, user.id);
      return reply.send({ ok: true, ...result });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // ── POST /api/market/cancel — снять лот ──
  app.post('/api/market/cancel', {
    preHandler: telegramAuthHook,
  }, async (req, reply) => {
    const tgUser = (req as any).tgUser;
    const { listingId } = req.body as { listingId: string };

    const { rows: [user] } = await pool.query(
      `SELECT id FROM users WHERE tg_user_id = $1`, [tgUser.id],
    );
    if (!user) return reply.code(404).send({ error: 'Пользователь не найден' });

    try {
      await marketplace.cancelListing(listingId, user.id);
      return reply.send({ ok: true });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // ── POST /api/market/refurbish — восстановить GPU ─
  app.post('/api/market/refurbish', {
    preHandler: telegramAuthHook,
  }, async (req, reply) => {
    const tgUser = (req as any).tgUser;
    const { gpuId } = req.body as { gpuId: string };

    const { rows: [user] } = await pool.query(
      `SELECT id, igc_balance FROM users WHERE tg_user_id = $1`, [tgUser.id],
    );
    if (!user) return reply.code(404).send({ error: 'Пользователь не найден' });

    const { rows: [gpu] } = await pool.query(
      `SELECT g.*, f.workbench_level FROM gpus g
       JOIN farms f ON f.id = g.farm_id
       WHERE g.id = $1 AND g.user_id = $2`,
      [gpuId, user.id],
    );
    if (!gpu) return reply.code(404).send({ error: 'GPU не найдена' });
    if (gpu.health >= 100) return reply.code(400).send({ error: 'GPU уже в 100% состоянии' });

    if (!refurbish.canRefurbish(gpu.workbench_level, gpu.model_tier)) {
      return reply.code(400).send({ error: 'Недостаточный уровень верстака' });
    }

    // Учитываем скидку refurbish_discount если активна
    const { rows: [discountEvent] } = await pool.query(
      `SELECT payload FROM system_events
       WHERE type = 'refurbish_discount' AND active_until > NOW()`,
    );
    const mult      = discountEvent?.payload?.multiplier ?? 1.0;
    const baseCost  = refurbishCost(gpu);
    const finalCost = Math.ceil(baseCost * mult);

    try {
      await refurbish.restoreGpu(user.id, gpuId, finalCost);
      return reply.send({ ok: true, igcSpent: finalCost, discount: mult < 1 });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // ── GET /api/market/my — мои активные лоты ─
  app.get('/api/market/my', {
    preHandler: telegramAuthHook,
  }, async (req, reply) => {
    const tgUser = (req as any).tgUser;
    const { rows: [user] } = await pool.query(
      `SELECT id FROM users WHERE tg_user_id = $1`, [tgUser.id],
    );
    if (!user) return reply.code(404).send({ error: 'Пользователь не найден' });

    const { rows } = await pool.query(
      `SELECT * FROM marketplace
       WHERE seller_id = $1 AND status = 'open'
       ORDER BY created_at DESC`,
      [user.id],
    );
    return reply.send({ ok: true, data: rows });
  });
}

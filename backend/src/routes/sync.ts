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
      const refCode = (req.query as any).ref as string | undefined;
      user = await registerNewPlayer(tgUser, refCode);
    }

    // ── Основные данные ───────────────────────
    const [snapshot, igcStatus] = await Promise.all([
      sync.getUserSnapshot(user.id),
      getLiveIgcStatus(),
    ]);

    // ── Сезонная информация ───────────────────
    const { rows: [poolRow] } = await pool.query(
      `SELECT cycle_day, season, drip_rate, current_phase,
              reserve_pool_ton, total_paid_out
       FROM pool_stats WHERE id = 1`,
    );

    const seasonRate = poolRow
      ? poolRow.drip_rate * (1 + 0.25 * Math.sin(2 * Math.PI * poolRow.cycle_day / 28))
      : 0;

    // ── Активные системные события ────────────
    const { rows: events } = await pool.query(
      `SELECT type, payload FROM system_events WHERE active_until > NOW()`,
    );

    return reply.send({
      ok: true,
      data: {
        ...snapshot,
        igc: igcStatus,
        season: {
          day:        poolRow?.cycle_day ?? 1,
          name:       poolRow?.season ?? 'spring',
          dripRate:   parseFloat(seasonRate.toFixed(4)),
          phase:      poolRow?.current_phase ?? 1,
          poolTon:    parseFloat(poolRow?.reserve_pool_ton ?? '0'),
          totalPaid:  parseFloat(poolRow?.total_paid_out ?? '0'),
        },
        events: events.reduce((acc: Record<string, any>, e: any) => {
          acc[e.type] = e.payload;
          return acc;
        }, {}),
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

    // Создать пользователя
    const { rows: [newUser] } = await client.query(`
      INSERT INTO users (tg_user_id, tg_username, igc_balance, inviter_id)
      VALUES ($1, $2, 150, $3)
      RETURNING id
    `, [tgUser.id, tgUser.username ?? null, inviterId]);

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
    return newUser;

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

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
import { redis }                              from '../redis/client';
import { REDIS_TAP_PREFIX, TAP_SESSION_LIMIT } from '../epoch/constants';

const pool = new Pool(pgPoolConfig);

export async function syncRoutes(app: FastifyInstance) {

  app.get('/api/sync', {
    preHandler: telegramAuthHook,
  }, async (req, reply) => {
    console.log('[sync] request received');
    const tgUser = (req as any).tgUser;
    console.log('[sync] tgUser:', tgUser?.id);

    // ── Найти или создать пользователя ────────
    console.log('[sync] querying user by tg_user_id:', tgUser.id);
    let { rows: [user] } = await pool.query(
      `SELECT id FROM users WHERE tg_user_id = $1`,
      [tgUser.id],
    );
    console.log('[sync] user found:', user?.id ?? 'NOT FOUND — will register');

    if (!user) {
      // Новый игрок: регистрация с USB-майнером
      const refCode = (req.query as any).ref as string | undefined;
      user = await registerNewPlayer(tgUser, refCode);
    }

    // ── Основные данные ───────────────────────
    console.log('[sync] fetching snapshot for userId:', user.id);
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
    console.log('[sync] snapshot ok, pool row next');

    // ── Сезонная информация ───────────────────
    let poolRow: any;
    try {
      const { rows: [row] } = await pool.query(
        `SELECT cycle_day, season, drip_rate, current_phase,
                reserve_pool_ton, total_paid_out
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

    // ── Tap-to-Cool буст ─────────────────────
    let tapBoost = { active: false, secondsLeft: 0, cooldownSeconds: 0, tapsUsed: 0, tapsRemaining: TAP_SESSION_LIMIT };
    try {
      const nowSec = Math.floor(Date.now() / 1000);
      const [storedEndRaw, cooldownTtl, tapCountRaw] = await Promise.all([
        redis.get(`${REDIS_TAP_PREFIX}end:${user.id}`),
        redis.ttl(`${REDIS_TAP_PREFIX}cooldown:${user.id}`),
        redis.get(`${REDIS_TAP_PREFIX}count:${user.id}`),
      ]);
      const secondsLeft = Math.max(0, parseInt(storedEndRaw ?? '0', 10) - nowSec);
      const tapsUsed    = parseInt(tapCountRaw ?? '0', 10);
      tapBoost = {
        active:          secondsLeft > 0,
        secondsLeft,
        cooldownSeconds: Math.max(0, cooldownTtl),
        tapsUsed,
        tapsRemaining:   Math.max(0, TAP_SESSION_LIMIT - tapsUsed),
      };
    } catch { /* Redis недоступен */ }

    // ── Активные системные события ────────────
    const { rows: events } = await pool.query(
      `SELECT type, payload FROM system_events WHERE active_until > NOW()`,
    );

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
      id:           rawFarm.id,
      level:        rawFarm.level,
      coolingLevel: rawFarm.cooling_level ?? 0,
      maxSlots:     rawFarm.max_slots ?? 5,
      igcBalance:   parseFloat(rawUser?.igc_balance ?? '0'),
    } : null;

    const mappedGpus = rawGpus.map((g: any) => ({
      id:            g.id,
      modelTier:     g.model_tier,
      health:        parseFloat(g.health ?? '100'),
      status:        g.status,
      overclocked:   g.overclocked ?? false,
      coolingLevel:  g.cooling_level ?? 0,
      isRefurbished: g.is_refurbished ?? false,
    }));

    return reply.send({
      ok: true,
      data: {
        user:  mappedUser,
        farm:  mappedFarm,
        gpus:  mappedGpus,
        igc:   igcStatus,
        season: {
          day:        poolRow?.cycle_day ?? 1,
          name:       poolRow?.season ?? 'spring',
          dripRate:   parseFloat(seasonRate.toFixed(4)),
          phase:      poolRow?.current_phase ?? 1,
          poolTon:    parseFloat(poolRow?.reserve_pool_ton ?? '0'),
          totalPaid:  parseFloat(poolRow?.total_paid_out ?? '0'),
        },
        tapBoost,
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

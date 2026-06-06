import { FastifyInstance } from 'fastify';
import { Pool }             from 'pg';
import { pgPoolConfig }     from '../db/client';
import { telegramAuthHook } from '../auth/telegramAuth';

const pool = new Pool(pgPoolConfig);

const HASHRATE_SQL = `
  CASE g.model_tier
    WHEN 0 THEN 0.1  WHEN 1 THEN 3    WHEN 2 THEN 6
    WHEN 3 THEN 15   WHEN 4 THEN 45   WHEN 5 THEN 110
    WHEN 6 THEN 250  ELSE 0
  END
  * CASE WHEN g.overclocked THEN 1.2 ELSE 1.0 END
  * CASE WHEN g.undervolted THEN 0.85 ELSE 1.0 END
  * CASE f.server_room_level
      WHEN 1 THEN 1.03 WHEN 2 THEN 1.07 WHEN 3 THEN 1.12
      ELSE 1.0
    END
`;

export async function leaderboardRoutes(app: FastifyInstance) {
  app.get('/api/leaderboard', {
    preHandler: telegramAuthHook,
  }, async (req, reply) => {
    const tgUser = (req as any).tgUser;

    try {
      const { rows: top } = await pool.query(`
        WITH player_stats AS (
          SELECT
            u.tg_user_id,
            COALESCE(NULLIF(u.tg_username, ''), 'Игрок #' || u.tg_user_id::text) AS display_name,
            COALESCE(SUM(${HASHRATE_SQL}), 0)  AS total_hashrate,
            COUNT(g.id)::int                   AS active_gpus
          FROM users u
          LEFT JOIN gpus   g ON g.user_id = u.id AND g.status = 'active'
          LEFT JOIN farms  f ON f.user_id = u.id
          GROUP BY u.id, u.tg_user_id, u.tg_username
        )
        SELECT
          ROW_NUMBER() OVER (ORDER BY total_hashrate DESC)::int AS rank,
          tg_user_id, display_name, total_hashrate, active_gpus
        FROM player_stats
        ORDER BY total_hashrate DESC
        LIMIT 100
      `);

      const { rows: [me] } = await pool.query(`
        WITH player_stats AS (
          SELECT
            u.tg_user_id,
            COALESCE(SUM(${HASHRATE_SQL}), 0) AS total_hashrate,
            COUNT(g.id)::int                  AS active_gpus
          FROM users u
          LEFT JOIN gpus   g ON g.user_id = u.id AND g.status = 'active'
          LEFT JOIN farms  f ON f.user_id = u.id
          GROUP BY u.id, u.tg_user_id
        ),
        ranked AS (
          SELECT *, ROW_NUMBER() OVER (ORDER BY total_hashrate DESC)::int AS rank
          FROM player_stats
        )
        SELECT rank, total_hashrate, active_gpus
        FROM ranked
        WHERE tg_user_id = $1
      `, [tgUser.id]);

      return reply.send({
        ok:         true,
        top,
        myTgId:     tgUser.id,
        myRank:     me?.rank      ?? null,
        myHashrate: parseFloat(me?.total_hashrate ?? '0'),
        myGpus:     me?.active_gpus ?? 0,
      });

    } catch (err) {
      console.error('[leaderboard] SQL error:', (err as Error)?.message ?? err);
      return reply.code(500).send({ error: 'Ошибка загрузки рейтинга', detail: (err as Error)?.message });
    }
  });
}

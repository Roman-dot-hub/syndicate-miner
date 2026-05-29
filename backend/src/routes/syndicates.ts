// ─────────────────────────────────────────────
// routes/syndicates.ts  →  GET /api/syndicates
// Публичный список синдикатов для браузера вступления
// ─────────────────────────────────────────────

import { FastifyInstance } from 'fastify';
import { Pool }            from 'pg';
import { pgPoolConfig }    from '../db/client';
import { SYNDICATE_LEVEL_MILESTONES, SYNDICATE_BASE_MAX_MEMBERS } from '../epoch/constants';

const pool = new Pool(pgPoolConfig);

export async function syndicateRoutes(app: FastifyInstance) {
  app.get('/api/syndicates', async (_req, reply) => {
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.level,
              COUNT(sm.user_id) AS member_count
       FROM syndicates s
       LEFT JOIN syndicate_members sm ON sm.syndicate_id = s.id
       GROUP BY s.id
       ORDER BY s.level DESC, s.xp DESC
       LIMIT 50`,
    );

    const list = rows.map((s: any) => {
      const level = parseInt(s.level);
      const milestoneKeys = Object.keys(SYNDICATE_LEVEL_MILESTONES).map(Number).sort((a, b) => b - a);
      const mKey       = milestoneKeys.find(k => level >= k);
      const maxMembers = mKey ? SYNDICATE_LEVEL_MILESTONES[mKey].maxMembers : SYNDICATE_BASE_MAX_MEMBERS;
      return {
        id:           s.id,
        name:         s.name,
        level,
        member_count: parseInt(s.member_count),
        max_members:  maxMembers,
      };
    }).filter((s: any) => s.member_count < s.max_members); // только с местами

    return reply.send({ ok: true, data: list });
  });
}

// ─────────────────────────────────────────────
// routes/dev.ts — только для NODE_ENV=development
//
// Эндпоинты для ручного тестирования без Telegram.
// В production этот файл НЕ подключается.
// ─────────────────────────────────────────────

import { FastifyInstance } from 'fastify';
import { runEpoch }        from '../epoch/epochRunner';

export async function devRoutes(app: FastifyInstance) {

  // Ручной запуск одной эпохи
  app.post('/api/dev/trigger-epoch', async (_req, reply) => {
    console.log('[Dev] Ручной запуск эпохи...');
    try {
      const result = await runEpoch();
      if (!result) {
        return reply.code(400).send({ error: 'Эпоха не запустилась (пул пустой или лок занят)' });
      }
      return reply.send({ ok: true, epoch: result });
    } catch (err) {
      console.error('[Dev] trigger-epoch error:', err);
      return reply.code(500).send({ error: String(err) });
    }
  });

  // Сброс тестовых данных (только seed-пользователи)
  app.post('/api/dev/reset-seed', async (_req, reply) => {
    const { Pool } = await import('pg');
    const { pgPoolConfig } = await import('../db/client');
    const pg = new Pool(pgPoolConfig);
    try {
      // Балансы пользователей
      await pg.query(`
        UPDATE users SET
          ton_balance = CASE tg_user_id
            WHEN 100001 THEN 50.0
            WHEN 100002 THEN 10.0
            WHEN 100003 THEN 5.0
            WHEN 100004 THEN 2.0
            WHEN 100005 THEN 1.0
          END,
          igc_balance = CASE tg_user_id
            WHEN 100001 THEN 500.0
            WHEN 100002 THEN 100.0
            WHEN 100003 THEN 50.0
            WHEN 100004 THEN 20.0
            WHEN 100005 THEN 10.0
          END
        WHERE tg_user_id IN (100001,100002,100003,100004,100005)
      `);
      // Восстанавливаем GPU — статус active, health 100
      await pg.query(`
        UPDATE gpus SET status = 'active', health = 100
        WHERE user_id IN (
          SELECT id FROM users WHERE tg_user_id IN (100001,100002,100003,100004,100005)
        )
      `);
      // Пул
      await pg.query(
        `UPDATE pool_stats SET reserve_pool_ton = 10.0, total_paid_out = 0, admin_earned_ton = 0 WHERE id = 1`
      );
    } finally {
      await pg.end();
    }
    return reply.send({ ok: true, message: 'Seed сброшен (балансы + GPU + пул)' });
  });

  app.log.info('⚙️  Dev routes зарегистрированы (/api/dev/*)');
}

// ─────────────────────────────────────────────
// routes/adsgramReward.ts
//
// GET /api/adsgram-reward?user_id={user_id}&token=SECRET
//
// Adsgram вызывает этот endpoint server-to-server
// когда пользователь досмотрел рекламу до конца.
// ─────────────────────────────────────────────

import { FastifyInstance } from 'fastify';
import { redis }           from '../redis/client';
import {
  REDIS_TAP_PREFIX,
  REDIS_AD_COUNT_PREFIX,
  REDIS_AD_COOLDOWN_PREFIX,
  AD_BOOST_SEC,
  AD_VIEWS_PER_CYCLE,
  AD_COOLDOWN_SEC,
} from '../epoch/constants';

const ADSGRAM_SECRET = process.env.ADSGRAM_SECRET ?? '';

export async function adsgramRewardRoutes(app: FastifyInstance) {
  app.get('/api/adsgram-reward', async (req, reply) => {
    const { user_id, token } = req.query as { user_id?: string; token?: string };

    // 1. Проверка секретного токена (если задан в env)
    if (ADSGRAM_SECRET && token !== ADSGRAM_SECRET) {
      return reply.code(403).send({ error: 'Invalid token' });
    }

    // 2. Проверка user_id
    const userId = parseInt(user_id ?? '', 10);
    if (!userId || isNaN(userId)) {
      return reply.code(400).send({ error: 'Missing user_id' });
    }

    try {
      const nowSec      = Math.floor(Date.now() / 1000);
      const endKey      = `${REDIS_TAP_PREFIX}end:${userId}`;
      const countKey    = `${REDIS_AD_COUNT_PREFIX}${userId}`;
      const cooldownKey = `${REDIS_AD_COOLDOWN_PREFIX}${userId}`;

      // 3. Проверяем кулдаун
      const cooldownTtl = await redis.ttl(cooldownKey);
      if (cooldownTtl > 0) {
        // В паузе — Adsgram не должен был дать смотреть, но обрабатываем gracefully
        return reply.send({ ok: false, reason: 'cooldown', cooldownSeconds: cooldownTtl });
      }

      // 4. Добавляем +5 минут к бусту
      const storedEnd = parseInt(await redis.get(endKey) ?? '0', 10);
      const baseEnd   = Math.max(storedEnd, nowSec);
      const newEnd    = baseEnd + AD_BOOST_SEC;
      await redis.set(endKey, String(newEnd), 'EX', AD_BOOST_SEC * AD_VIEWS_PER_CYCLE + 3600);

      // 5. Счётчик цикла
      const viewCount = await redis.incr(countKey);
      if (viewCount === 1) await redis.expire(countKey, AD_COOLDOWN_SEC + 600);

      // 6. После 10-го — 4ч кулдаун
      if (viewCount >= AD_VIEWS_PER_CYCLE) {
        await redis.set(cooldownKey, '1', 'EX', AD_COOLDOWN_SEC);
        await redis.del(countKey);
      }

      console.log(`[AdReward] user=${userId} view=${Math.min(viewCount, AD_VIEWS_PER_CYCLE)}/${AD_VIEWS_PER_CYCLE} boost+${AD_BOOST_SEC}s`);

      return reply.send({
        ok: true,
        boostSeconds:   newEnd - nowSec,
        adViewsInCycle: Math.min(viewCount, AD_VIEWS_PER_CYCLE),
        adViewsPerCycle: AD_VIEWS_PER_CYCLE,
      });

    } catch (err) {
      console.error('[AdReward] Redis error:', (err as Error)?.message ?? err);
      return reply.code(500).send({ error: 'Redis unavailable' });
    }
  });
}

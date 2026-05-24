// ─────────────────────────────────────────────
// redis/client.ts — синглтон ioredis
//
// Единственное место подключения к Redis.
// Используется epochRunner (lock, global hashrate cache),
// и action routes (rate limit на tap_cool).
// ─────────────────────────────────────────────

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Log masked URL at startup so we can verify which Redis we're connecting to
const maskedUrl = REDIS_URL.replace(/:([^@]+)@/, ':***@');
console.log(`[Redis] Connecting to: ${maskedUrl}`);

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 5) {
      console.error('[Redis] Не удалось подключиться после 5 попыток.');
      return null; // прекратить попытки
    }
    return Math.min(times * 200, 2000); // экспоненциальная задержка
  },
  lazyConnect: false,
});

redis.on('connect',  () => console.log('[Redis] ✓ Подключено'));
redis.on('error',    (err) => console.error('[Redis] Ошибка:', err.message));
redis.on('reconnecting', () => console.warn('[Redis] Переподключение...'));

export default redis;

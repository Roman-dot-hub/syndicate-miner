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
  // 1 = команды быстро падают если нет соединения (catch в sync/epochRunner их ловит)
  maxRetriesPerRequest: 1,
  // Всегда пробуем переподключиться — с нарастающей задержкой до 10с
  retryStrategy: (times) => {
    const delay = Math.min(times * 300, 10_000);
    if (times % 10 === 0) {
      console.warn(`[Redis] Попытка переподключения #${times}, следующая через ${delay}ms`);
    }
    return delay;
  },
  enableOfflineQueue: true,  // команды встают в очередь пока нет соединения
  lazyConnect:        false,
});

redis.on('connect',     () => console.log('[Redis] ✓ Подключено'));
redis.on('ready',       () => console.log('[Redis] ✓ Готов к работе'));
redis.on('error',       (err) => {
  // Логируем только уникальные сообщения, не спамим
  if (!err.message?.includes('ECONNREFUSED') && !err.message?.includes('Connection is closed')) {
    console.error('[Redis] Ошибка:', err.message);
  }
});
redis.on('reconnecting', (ms: number) => console.warn(`[Redis] Переподключение через ${ms}ms...`));
redis.on('close',        () => console.warn('[Redis] Соединение закрыто, ждём переподключения...'));

export default redis;

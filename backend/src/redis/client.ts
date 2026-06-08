// ─────────────────────────────────────────────
// redis/client.ts — синглтон ioredis
//
// Единственное место подключения к Redis.
// Используется epochRunner (lock, global hashrate cache),
// и action routes (rate limit на tap_cool).
// ─────────────────────────────────────────────

import Redis from 'ioredis';

// Railway предоставляет Redis через отдельные переменные REDISHOST/REDISPASSWORD/REDISPORT/REDISUSER.
// Если REDIS_URL пустой или неполный — собираем URL из этих переменных.
function buildRedisUrl(): string {
  const raw = process.env.REDIS_URL ?? '';
  // Считаем URL валидным если он содержит хост (не просто "redis://")
  if (raw.length > 10 && raw.includes('@')) return raw;

  const host     = process.env.REDISHOST     ?? 'localhost';
  const port     = process.env.REDISPORT     ?? '6379';
  const user     = process.env.REDISUSER     ?? 'default';
  const password = process.env.REDISPASSWORD ?? '';

  if (password) {
    return `redis://${user}:${password}@${host}:${port}`;
  }
  return `redis://${host}:${port}`;
}

const REDIS_URL = buildRedisUrl();

// Log masked URL at startup so we can verify which Redis we're connecting to
const maskedUrl = REDIS_URL.replace(/:([^@]+)@/, ':***@');
console.log(`[Redis] Connecting to: ${maskedUrl}`);

export const redis = new Redis(REDIS_URL, {
  // Команды сразу падают если нет соединения — catch в sync/action их ловит
  maxRetriesPerRequest: 0,
  connectTimeout:       1500,  // 1.5с на установку TCP-соединения
  commandTimeout:       1500,  // 1.5с на ответ команды (ping, get, set и т.д.)
  enableOfflineQueue:   false, // НЕ ставить в очередь — сразу reject → catch срабатывает мгновенно
  lazyConnect:          false,
  retryStrategy: (times) => {
    // Переподключаемся фоново, но не блокируем запросы
    const delay = Math.min(times * 500, 15_000);
    if (times % 5 === 0) {
      console.warn(`[Redis] Переподключение #${times}, через ${delay}ms`);
    }
    return delay;
  },
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

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
// Дедупликация ошибок — один и тот же тип не спамит логи
let _lastErrMsg = '';
let _lastErrTs  = 0;
redis.on('error', (err) => {
  const msg = err.message ?? String(err);
  const now = Date.now();
  // Пропускаем типичные шумы: connection closed, ECONNREFUSED, Protocol error (Railway proxy)
  const isNoise = msg.includes('ECONNREFUSED')
    || msg.includes('Connection is closed')
    || msg.includes('Stream isn\'t writeable')
    || msg.includes('Protocol error')          // Railway TCP proxy возвращает HTTP
    || msg.includes('wrong version number');    // Railway с TLS mismatch
  if (isNoise) return;
  // Дедуп: не повторять одно и то же сообщение чаще раза в 30 секунд
  if (msg === _lastErrMsg && now - _lastErrTs < 30_000) return;
  _lastErrMsg = msg;
  _lastErrTs  = now;
  console.error('[Redis] Ошибка:', msg);
});
redis.on('reconnecting', () => { /* тихо переподключаемся */ });
redis.on('close',        () => { /* тихо */ });

export default redis;

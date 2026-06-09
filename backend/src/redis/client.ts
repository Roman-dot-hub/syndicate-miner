// ─────────────────────────────────────────────
// redis/client.ts — синглтон ioredis
//
// Единственное место подключения к Redis.
// Используется epochRunner (lock, global hashrate cache),
// и action routes (rate limit на tap_cool).
// ─────────────────────────────────────────────

import Redis from 'ioredis';

// Разбираем REDIS_URL в отдельные компоненты для явной передачи в ioredis.
// Railway private network иногда не принимает URL-формат корректно.
function parseRedisConfig(): { host: string; port: number; password?: string; username?: string } {
  const raw = process.env.REDIS_URL ?? '';

  if (raw.length > 10) {
    try {
      const u = new URL(raw.replace(/^redis:\/\//, 'http://').replace(/^rediss:\/\//, 'https://'));
      return {
        host:     u.hostname || 'redis.railway.internal',
        port:     parseInt(u.port || '6379', 10),
        password: u.password ? decodeURIComponent(u.password) : undefined,
        username: u.username && u.username !== 'default' ? u.username : undefined,
      };
    } catch { /* fallthrough */ }
  }

  // Фолбэк на отдельные переменные
  return {
    host:     process.env.REDISHOST     ?? 'localhost',
    port:     parseInt(process.env.REDISPORT ?? '6379', 10),
    password: process.env.REDISPASSWORD || undefined,
    username: process.env.REDISUSER && process.env.REDISUSER !== 'default'
                ? process.env.REDISUSER : undefined,
  };
}

const rCfg = parseRedisConfig();
console.log(`[Redis] Connecting to: ${rCfg.host}:${rCfg.port} (pwd: ${rCfg.password ? 'yes' : 'no'})`);

export const redis = new Redis({
  host:     rCfg.host,
  port:     rCfg.port,
  password: rCfg.password,
  username: rCfg.username,
  family:   4,               // Принудительно IPv4 — Railway private network иногда не даёт IPv6
  // Команды сразу падают если нет соединения — catch в sync/action их ловит
  maxRetriesPerRequest: 0,
  connectTimeout:       3000,
  commandTimeout:       3000,
  enableOfflineQueue:   false,
  lazyConnect:          false,
  enableReadyCheck:     false, // не блокировать на READONLY/LOADING
  retryStrategy: (times) => {
    const delay = Math.min(times * 1000, 30_000);
    if (times % 10 === 0) {
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

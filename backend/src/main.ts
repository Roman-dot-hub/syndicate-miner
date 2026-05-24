// ─────────────────────────────────────────────
// main.ts — точка входа сервера
// ─────────────────────────────────────────────

// Render free tier has no IPv6 outbound — force IPv4 DNS resolution
import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');

import Fastify        from 'fastify';
import cors           from '@fastify/cors';
import { syncRoutes }     from './routes/sync';
import { actionRoutes }   from './routes/action';
import { marketRoutes }   from './routes/market';
import { withdrawRoutes }     from './routes/withdraw';
import { leaderboardRoutes }  from './routes/leaderboard';
import { devRoutes }          from './routes/dev';
import { redis }          from './redis/client';

// Запускаем игровой цикл и суточный крон
import './cron';
import './monitoring/dailyCron';

const app = Fastify({ logger: process.env.NODE_ENV !== 'production' });

// ── CORS: разрешаем только Telegram Mini App ──
app.register(cors, {
  origin: [
    'https://web.telegram.org',
    'https://t.me',
    /\.telegram\.org$/,
    /\.vercel\.app$/,
    /\.railway\.app$/,
  ],
  methods: ['GET', 'POST'],
});

// ── Health check ──────────────────────────────
app.get('/health', async () => {
  let redisOk = false;
  try {
    await redis.ping();
    redisOk = true;
  } catch (e) {
    console.error('[Health] Redis ping failed:', (e as Error)?.message);
  }
  return { ok: true, ts: Date.now(), redis: redisOk };
});

// ── API routes ────────────────────────────────
app.register(syncRoutes);
app.register(actionRoutes);
app.register(marketRoutes);
app.register(withdrawRoutes);
app.register(leaderboardRoutes);

// ── Dev routes (только в development) ────────
if (process.env.NODE_ENV !== 'production') {
  app.register(devRoutes);
}

// ── Глобальный обработчик ошибок ──────────────
app.setErrorHandler((error, _req, reply) => {
  console.error('[Server Error]', error);
  // В разработке возвращаем реальную ошибку для отладки
  reply.code(500).send({
    error: 'Внутренняя ошибка сервера',
    detail: error?.message ?? String(error),
  });
});

// ── Запуск ────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '3000', 10);

app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) { console.error(err); process.exit(1); }
  console.log(`\n🚀 Syndicate Backend запущен на порту ${PORT}`);
  console.log(`   ENV: ${process.env.NODE_ENV ?? 'development'}`);
  console.log(`   BUILD: v2-actions-fixed`);
});

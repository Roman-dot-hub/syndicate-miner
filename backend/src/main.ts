// ─────────────────────────────────────────────
// main.ts — точка входа сервера
// ─────────────────────────────────────────────

import Fastify        from 'fastify';
import cors           from '@fastify/cors';
import { syncRoutes }     from './routes/sync';
import { actionRoutes }   from './routes/action';
import { marketRoutes }   from './routes/market';
import { withdrawRoutes } from './routes/withdraw';
import { devRoutes }      from './routes/dev';

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
  ],
  methods: ['GET', 'POST'],
});

// ── Health check ──────────────────────────────
app.get('/health', async () => ({ ok: true, ts: Date.now() }));

// ── API routes ────────────────────────────────
app.register(syncRoutes);
app.register(actionRoutes);
app.register(marketRoutes);
app.register(withdrawRoutes);

// ── Dev routes (только в development) ────────
if (process.env.NODE_ENV !== 'production') {
  app.register(devRoutes);
}

// ── Глобальный обработчик ошибок ──────────────
app.setErrorHandler((error, _req, reply) => {
  console.error('[Server Error]', error);
  reply.code(500).send({ error: 'Внутренняя ошибка сервера' });
});

// ── Запуск ────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '3000', 10);

app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) { console.error(err); process.exit(1); }
  console.log(`\n🚀 TON Miner Backend запущен на порту ${PORT}`);
  console.log(`   ENV: ${process.env.NODE_ENV ?? 'development'}`);
});

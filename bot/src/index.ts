// ─────────────────────────────────────────────
// index.ts — Syndicate Miner Telegram Bot
//
// Запуск: npm run dev (long polling, dev)
//         npm start   (webhooks, production)
// ─────────────────────────────────────────────

import { Bot }                   from 'grammy';
import { registerStartCommand }  from './commands/start';
import { registerStatsCommand }  from './commands/stats';
import { registerBroadcastCommand } from './commands/broadcast';

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('[Bot] BOT_TOKEN не задан в .env');
  process.exit(1);
}

if (!process.env.MINI_APP_URL) {
  console.warn('[Bot] MINI_APP_URL не задан — кнопка /start не будет работать');
}

const bot = new Bot(BOT_TOKEN);

// ── Команды ────────────────────────────────────
registerStartCommand(bot);
registerStatsCommand(bot);
registerBroadcastCommand(bot);

// ── Глобальный обработчик ошибок ───────────────
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`[Bot] Ошибка при обработке ${ctx.update.update_id}:`, err.error);
});

// ── Запуск ─────────────────────────────────────
bot.start({
  onStart: (info) => {
    console.log(`\n🤖 Бот @${info.username} запущен (long polling)`);
    console.log(`   NODE_ENV: ${process.env.NODE_ENV ?? 'development'}`);
    console.log(`   MINI_APP_URL: ${process.env.MINI_APP_URL ?? '(не задан)'}\n`);
  },
});

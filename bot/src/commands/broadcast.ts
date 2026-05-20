// ─────────────────────────────────────────────
// commands/broadcast.ts
//
// /broadcast <сообщение> — рассылка всем игрокам (только admin).
// Использование: /broadcast Текст сообщения
// Поддерживает HTML-разметку в тексте.
// ─────────────────────────────────────────────

import type { Bot, Context } from 'grammy';
import { Pool }              from 'pg';
import { adminOnly }         from '../middleware/adminCheck';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

const BATCH_SIZE  = 30;   // запросов в пакете
const BATCH_DELAY = 1100; // мс между пакетами (лимит TG: 30 msg/sec)

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function registerBroadcastCommand(bot: Bot<Context>) {
  bot.command('broadcast', adminOnly, async (ctx) => {
    const message = ctx.match?.trim();

    if (!message) {
      await ctx.reply(
        '📢 <b>Использование:</b> <code>/broadcast Текст сообщения</code>\n\n' +
        'Поддерживается HTML-разметка (bold, italic, code).',
        { parse_mode: 'HTML' },
      );
      return;
    }

    const { rows } = await db.query(
      `SELECT tg_user_id FROM users WHERE tg_user_id IS NOT NULL`,
    );

    if (rows.length === 0) {
      await ctx.reply('⚠️ В базе нет игроков для рассылки.');
      return;
    }

    const status = await ctx.reply(
      `📤 Начинаю рассылку для <b>${rows.length}</b> игроков...`,
      { parse_mode: 'HTML' },
    );

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        batch.map(async (row) => {
          try {
            await ctx.api.sendMessage(row.tg_user_id, message, { parse_mode: 'HTML' });
            sent++;
          } catch {
            failed++;
          }
        }),
      );

      if (i + BATCH_SIZE < rows.length) {
        await sleep(BATCH_DELAY);
      }
    }

    await ctx.api.editMessageText(
      status.chat.id,
      status.message_id,
      `✅ <b>Рассылка завершена</b>\n` +
      `📨 Отправлено: ${sent}\n` +
      `❌ Ошибок: ${failed}`,
      { parse_mode: 'HTML' },
    );
  });
}

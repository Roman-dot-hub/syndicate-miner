// ─────────────────────────────────────────────
// commands/start.ts
//
// /start — приветствие + кнопка открытия Mini App.
// Поддерживает deep link: /start ref_<userId> для реферальных ссылок.
// ─────────────────────────────────────────────

import { InlineKeyboard } from 'grammy';
import type { Bot, Context } from 'grammy';

export function registerStartCommand(bot: Bot<Context>) {
  bot.command('start', async (ctx) => {
    const miniAppUrl = process.env.MINI_APP_URL;
    if (!miniAppUrl) {
      await ctx.reply('⚙️ Mini App URL не настроен. Обратитесь к администратору.');
      return;
    }

    const payload = ctx.match?.trim();
    const refParam = payload?.startsWith('ref_') ? payload : null;

    const keyboard = new InlineKeyboard()
      .webApp('⛏️ Запустить игру', refParam ? `${miniAppUrl}?startParam=${refParam}` : miniAppUrl);

    await ctx.reply(
      `🎮 <b>Syndicate Miner</b>\n\n` +
      `Строй ферму из GPU и ASIC, добывай <b>TON</b> из общего пула и торгуй оборудованием на P2P-маркетплейсе.\n\n` +
      `⚡ Каждые 5 минут — новая эпоха и распределение наград.\n` +
      `🏆 Solo-режим: один блок → весь куш.\n` +
      `📈 Pool-режим: стабильный доход пропорционально хешрейту.\n\n` +
      `Жми кнопку ниже, чтобы начать!`,
      {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      },
    );
  });
}

// ─────────────────────────────────────────────
// commands/stats.ts
//
// /stats — статистика пула и игроков (только для admin).
// Запрашивает pool_stats и агрегаты из epoch_log / users.
// ─────────────────────────────────────────────

import type { Bot, Context } from 'grammy';
import { Pool }              from 'pg';
import { adminOnly }         from '../middleware/adminCheck';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

const SEASON_EMOJI: Record<string, string> = {
  spring: '🌸', summer: '☀️', autumn: '🍂', winter: '❄️',
};

export function registerStatsCommand(bot: Bot<Context>) {
  bot.command('stats', adminOnly, async (ctx) => {
    const [poolRow, usersRow, epochRow] = await Promise.all([
      db.query(`
        SELECT reserve_pool_ton, drip_rate, current_phase,
               total_paid_out, cycle_day, season
        FROM   pool_stats WHERE id = 1
      `),
      db.query(`SELECT COUNT(*) AS total FROM users`),
      db.query(`
        SELECT global_hashrate, reward_distributed, active_miner_count,
               epoch_at
        FROM   epoch_log
        ORDER BY epoch_at DESC LIMIT 1
      `),
    ]);

    const ps    = poolRow.rows[0];
    const users = usersRow.rows[0];
    const ep    = epochRow.rows[0];

    if (!ps) {
      await ctx.reply('⚠️ pool_stats не найдены в БД. Проверь миграции.');
      return;
    }

    const pool    = parseFloat(ps.reserve_pool_ton).toFixed(3);
    const paid    = parseFloat(ps.total_paid_out).toFixed(3);
    const rate    = (parseFloat(ps.drip_rate) * 100).toFixed(2);
    const season  = SEASON_EMOJI[ps.season] ?? '❓';
    const day     = ps.cycle_day ?? '?';
    const phase   = ps.current_phase ?? '?';

    let text = `📊 <b>Статистика Syndicate Miner</b>\n\n`;
    text += `💰 <b>Пул:</b> ${pool} TON\n`;
    text += `💸 <b>Выплачено:</b> ${paid} TON\n`;
    text += `📈 <b>Ставка:</b> ${rate}%/день (Фаза ${phase})\n`;
    text += `${season} <b>Сезон:</b> ${ps.season ?? '?'} (день ${day}/28)\n`;
    text += `👥 <b>Игроков:</b> ${users.total}\n`;

    if (ep) {
      const hashrate = parseFloat(ep.global_hashrate).toFixed(1);
      const reward   = parseFloat(ep.reward_distributed).toFixed(6);
      const miners   = ep.active_miner_count;
      const epochAt  = new Date(ep.epoch_at).toLocaleString('ru-RU', { timeZone: 'UTC' });
      text += `\n⚡ <b>Последняя эпоха</b> (${epochAt} UTC)\n`;
      text += `   Хешрейт: ${hashrate} H/s | Майнеров: ${miners}\n`;
      text += `   Раздано: ${reward} TON`;
    }

    await ctx.reply(text, { parse_mode: 'HTML' });
  });
}

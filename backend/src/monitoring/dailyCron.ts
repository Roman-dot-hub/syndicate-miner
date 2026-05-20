// ─────────────────────────────────────────────
// monitoring/dailyCron.ts
//
// Запускается раз в сутки в 00:00 UTC.
// 1. Продвигает cycleDay (1→2→...→28→1)
// 2. Обновляет сезон в pool_stats
// 3. Выводит суточный IGC-отчёт в консоль
// ─────────────────────────────────────────────

import cron from 'node-cron';
import { Pool } from 'pg';
import { pgPoolConfig } from '../db/client';
import { getIgcHistory, getLiveIgcStatus } from './igcMonitor';
import { syncPoolBalance } from './syncPoolBalance';
import { processWithdrawals } from '../workers/payoutWorker';
import { sendTgBroadcast } from '../notifications/sendTgNotification';

const pool = new Pool(pgPoolConfig);

function dayToSeason(day: number): string {
  if (day <= 7)  return 'spring';
  if (day <= 14) return 'summer';
  if (day <= 21) return 'autumn';
  return 'winter';
}

const SEASON_EMOJI: Record<string, string> = {
  spring: '🌸', summer: '☀️', autumn: '🍂', winter: '❄️',
};

async function advanceCycleDay() {
  const { rows: [stats] } = await pool.query(
    'SELECT cycle_day, season FROM pool_stats WHERE id = 1',
  );
  const currentDay    = stats?.cycle_day ?? 1;
  const previousSeason = stats?.season ?? null;
  const nextDay       = currentDay >= 28 ? 1 : currentDay + 1;
  const season        = dayToSeason(nextDay);

  await pool.query(
    'UPDATE pool_stats SET cycle_day = $1, season = $2 WHERE id = 1',
    [nextDay, season],
  );

  console.log(
    `[Daily] ${SEASON_EMOJI[season]} Сезон: ${season.toUpperCase()} ` +
    `| День цикла: ${nextDay}/28`,
  );

  // Уведомляем всех игроков при смене сезона (раз в 7 дней)
  if (season !== previousSeason) {
    const SEASON_MSG: Record<string, string> = {
      spring: `🌸 <b>Весна началась!</b>\n\nСтавка майнинга растёт. Самое время закупить IGC для Летнего разгона.`,
      summer: `☀️ <b>Лето — пик наград!</b>\n\nСтавка на максимуме. Открой игру и активируй <b>Сезонный разгон</b> (500 IGC → +10% хешрейта на 7 дней).`,
      autumn: `🍂 <b>Осень. Ставка падает</b>\n\nХорошее время продать GPU на P2P-маркетплейсе — цены ещё держатся.`,
      winter: `❄️ <b>Зима. Крипто-дно</b>\n\nСтавка минимальная, электричество дороже. Но слабые фермы выключатся — твоя доля в пуле вырастет.`,
    };

    const msg = SEASON_MSG[season];
    if (msg) {
      const { rows: users } = await pool.query(
        `SELECT tg_user_id FROM users WHERE tg_user_id IS NOT NULL`,
      );
      const tgIds = users.map((u: { tg_user_id: string }) => u.tg_user_id);

      if (tgIds.length > 0) {
        sendTgBroadcast(tgIds, msg)
          .then(r => console.log(`[Daily] Сезон ${season} broadcast: ${r.sent} доставлено, ${r.failed} ошибок`))
          .catch(err => console.error('[Daily] Ошибка рассылки сезона:', err));
      }
    }
  }
}

async function printDailyReport() {
  const [history, live] = await Promise.all([
    getIgcHistory(1),
    getLiveIgcStatus(),
  ]);

  const yesterday = history[0];
  console.log('\n══════════════════════════════════════');
  console.log('📊  СУТОЧНЫЙ ОТЧЁТ IGC-ЭКОНОМИКИ');
  console.log('══════════════════════════════════════');

  if (yesterday) {
    console.log(`  Supply/Demand ratio: ${parseFloat(yesterday.avg_ratio).toFixed(3)}`);
    console.log(`  IGC произведено:     ${parseFloat(yesterday.total_supply).toFixed(1)}`);
    console.log(`  IGC потреблено:      ${parseFloat(yesterday.total_demand).toFixed(1)}`);
    console.log(`  Статус:              ${yesterday.dominant_status}`);
  }

  const statusIcon: Record<string, string> = {
    healthy:          '✅',
    mild_surplus:     '⚠️ ',
    mild_deficit:     '⚠️ ',
    critical_surplus: '🚨',
    critical_deficit: '🚨',
  };

  console.log(`  Текущий live ratio:  ${live.ratio.toFixed(3)} ${statusIcon[live.status] ?? ''} ${live.status}`);
  console.log('══════════════════════════════════════\n');
}

// ── Запуск кронов ─────────────────────────────

// Каждые сутки в 00:00 UTC
cron.schedule('0 0 * * *', async () => {
  try {
    await advanceCycleDay();
    await printDailyReport();
  } catch (err) {
    console.error('[Daily Cron] Ошибка:', err);
  }
}, { timezone: 'UTC' });

// Синхронизация баланса пула с контрактом каждые 5 минут
cron.schedule('*/5 * * * *', async () => {
  try {
    await syncPoolBalance();
  } catch (err) {
    console.error('[SyncPool Cron] Ошибка:', err);
  }
}, { timezone: 'UTC' });

// Обработка очереди выплат каждые 2 минуты
cron.schedule('*/2 * * * *', async () => {
  try {
    await processWithdrawals();
  } catch (err) {
    console.error('[PayoutWorker Cron] Ошибка:', err);
  }
}, { timezone: 'UTC' });

// Очистка устаревших system_events каждый час
cron.schedule('0 * * * *', async () => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM system_events
       WHERE type != 'seasonal_cycle' AND active_until < NOW()`,
    );
    if (rowCount && rowCount > 0) {
      console.log(`[Cleanup] Удалено ${rowCount} устаревших system_events`);
    }
  } catch (err) {
    console.error('[Cleanup Cron] Ошибка:', err);
  }
}, { timezone: 'UTC' });

console.log('[Daily Cron] Планировщики суточного обслуживания запущены');

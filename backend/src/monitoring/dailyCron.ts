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
import { getIgcHistory, getLiveIgcStatus } from './igcMonitor';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
    'SELECT cycle_day FROM pool_stats WHERE id = 1',
  );
  const currentDay = stats?.cycle_day ?? 1;
  const nextDay    = currentDay >= 28 ? 1 : currentDay + 1;
  const season     = dayToSeason(nextDay);

  await pool.query(
    'UPDATE pool_stats SET cycle_day = $1, season = $2 WHERE id = 1',
    [nextDay, season],
  );

  console.log(
    `[Daily] ${SEASON_EMOJI[season]} Сезон: ${season.toUpperCase()} ` +
    `| День цикла: ${nextDay}/28`,
  );
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

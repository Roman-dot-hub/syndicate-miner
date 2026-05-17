// ─────────────────────────────────────────────
// cron.ts — точка входа планировщика эпох
//
// Запускает runEpoch() каждые 5 минут.
// Подключить в main.ts: import './cron';
// ─────────────────────────────────────────────

import cron from 'node-cron';
import { runEpoch } from './epoch/epochRunner';

// Каждые 5 минут: '*/5 * * * *'
cron.schedule('*/5 * * * *', async () => {
  try {
    await runEpoch();
  } catch (err) {
    // Глобальный catch — чтобы крон не упал навсегда при ошибке
    console.error('[Cron] Необработанная ошибка в runEpoch:', err);
  }
}, {
  scheduled: true,
  timezone:  'UTC',
});

console.log('[Cron] Планировщик эпох запущен (каждые 5 минут, UTC)');

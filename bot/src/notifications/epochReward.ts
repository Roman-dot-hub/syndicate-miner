// ─────────────────────────────────────────────
// notifications/epochReward.ts
//
// Уведомление игрока о награде эпохи.
// Вызывается из backend/src/notifications/sendTgNotification.ts
// через Telegram Bot API — напрямую, без бот-процесса.
//
// Этот файл содержит только шаблоны сообщений,
// чтобы backend и bot использовали одинаковые тексты.
// ─────────────────────────────────────────────

export interface EpochRewardPayload {
  tgUserId:  string | number;
  tonEarned: number;
  igcEarned: number;
  isSolo:    boolean;
  poolAfter: number;
  phase:     number;
}

export function buildEpochRewardMessage(p: EpochRewardPayload): string {
  const ton = p.tonEarned.toFixed(6);
  const igc = p.igcEarned.toFixed(1);

  if (p.isSolo) {
    return (
      `🏆 <b>Solo-победа!</b>\n\n` +
      `Ты выиграл блок и получил <b>${ton} TON</b> + <b>${igc} IGC</b>\n\n` +
      `💰 Пул: ${p.poolAfter.toFixed(3)} TON | Фаза ${p.phase}`
    );
  }

  return (
    `⚡ <b>Награда эпохи</b>\n\n` +
    `+${ton} TON &amp; +${igc} IGC начислено на твой баланс.\n\n` +
    `💰 Пул: ${p.poolAfter.toFixed(3)} TON | Фаза ${p.phase}`
  );
}

// Минимальный порог TON для отправки уведомления (не спамим за копейки)
export const NOTIFY_MIN_TON = 0.001;

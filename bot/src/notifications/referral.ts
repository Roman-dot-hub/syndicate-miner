// ─────────────────────────────────────────────
// notifications/referral.ts
//
// Уведомление инвайтера о новом рефереле.
// Вызывается из backend при регистрации нового пользователя
// с реферальным параметром.
// ─────────────────────────────────────────────

export interface ReferralPayload {
  inviterTgUserId: string | number;
  newUserName:     string;
  level:           1 | 2;
  igcBonus:        number;
}

export function buildReferralMessage(p: ReferralPayload): string {
  const levelLabel = p.level === 1 ? 'прямой реферал (L1)' : 'реферал реферала (L2)';
  const bonusPct   = p.level === 1 ? '5%' : '2%';

  return (
    `👥 <b>Новый ${levelLabel}!</b>\n\n` +
    `<b>${escapeHtml(p.newUserName)}</b> присоединился по твоей ссылке.\n\n` +
    `Ты получаешь ${bonusPct} от его хешрейта и <b>+${p.igcBonus.toFixed(1)} IGC</b> бонус.\n\n` +
    `💡 Больше рефералов → больше суммарный хешрейт → больше TON.`
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

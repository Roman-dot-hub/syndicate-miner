// ─────────────────────────────────────────────
// notifications/sendTgNotification.ts
//
// Отправка сообщений в Telegram напрямую через Bot API.
// Backend вызывает это без бот-процесса.
//
// Используется для:
// - Уведомлений о награде эпохи (solo-победа, крупные выплаты)
// - Халвинг-оповещений (broadcast всем)
// - Смены сезона (broadcast всем)
// - Реферальных бонусов (личное сообщение)
// ─────────────────────────────────────────────

const TG_API = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;

async function tgPost(method: string, body: object): Promise<void> {
  const res = await fetch(`${TG_API}/${method}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Не бросаем — уведомление не должно ронять бизнес-логику
    console.warn(`[TgNotify] ${method} failed ${res.status}: ${text.slice(0, 200)}`);
  }
}

/**
 * Отправить сообщение одному пользователю.
 */
export async function sendTgMessage(
  tgUserId: string | number,
  text:     string,
): Promise<void> {
  await tgPost('sendMessage', {
    chat_id:    tgUserId,
    text,
    parse_mode: 'HTML',
  });
}

/**
 * Разослать сообщение списку пользователей.
 * Соблюдает лимит Telegram: ≤ 30 сообщений/сек.
 */
export async function sendTgBroadcast(
  tgUserIds: (string | number)[],
  text:      string,
): Promise<{ sent: number; failed: number }> {
  const BATCH  = 30;
  const DELAY  = 1100; // мс

  let sent   = 0;
  let failed = 0;

  for (let i = 0; i < tgUserIds.length; i += BATCH) {
    const batch = tgUserIds.slice(i, i + BATCH);

    const results = await Promise.allSettled(
      batch.map(id => tgPost('sendMessage', {
        chat_id:    id,
        text,
        parse_mode: 'HTML',
      })),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') sent++;
      else failed++;
    }

    if (i + BATCH < tgUserIds.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY));
    }
  }

  return { sent, failed };
}

// ─────────────────────────────────────────────
// middleware/adminCheck.ts
//
// Проверка прав администратора по ADMIN_IDS из .env.
// Использовать как фильтр перед admin-командами.
// ─────────────────────────────────────────────

import type { Context } from 'grammy';

const ADMIN_IDS: Set<number> = new Set(
  (process.env.ADMIN_IDS ?? '')
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n)),
);

export function isAdmin(userId: number): boolean {
  return ADMIN_IDS.has(userId);
}

export async function adminOnly(ctx: Context, next: () => Promise<void>) {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    await ctx.reply('⛔ Доступ запрещён.');
    return;
  }
  await next();
}

// ─────────────────────────────────────────────
// auth/telegramAuth.ts
//
// Валидация подписи initData от Telegram.
// HMAC-SHA256 по bot token. Обязательна на каждом запросе.
// Документация: https://core.telegram.org/bots/webapps#validating-data
// ─────────────────────────────────────────────

import crypto from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';

export interface TelegramUser {
  id:         number;
  first_name: string;
  username?:  string;
  photo_url?: string;
}

/**
 * Валидирует строку initData и возвращает объект пользователя.
 * Бросает ошибку если подпись невалидна или устарела (> 24ч).
 */
export function validateInitData(
  initData: string,
  botToken: string,
): TelegramUser {
  const params = new URLSearchParams(initData);
  const hash   = params.get('hash');
  if (!hash) throw new Error('hash отсутствует в initData');

  // Собираем строку для проверки (все поля кроме hash, отсортированные)
  params.delete('hash');
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  // HMAC-SHA256: ключ = HMAC("WebAppData", botToken), данные = dataCheckString
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (expectedHash !== hash) {
    throw new Error('Невалидная подпись initData');
  }

  // Проверяем свежесть (не старше 7 дней)
  const authDate = parseInt(params.get('auth_date') ?? '0', 10);
  const ageMs    = Date.now() - authDate * 1000;
  if (ageMs > 604_800_000) {
    throw new Error('initData устарела (> 7 дней)');
  }

  const userJson = params.get('user');
  if (!userJson) throw new Error('user отсутствует в initData');

  return JSON.parse(userJson) as TelegramUser;
}

/**
 * Fastify preHandler middleware.
 * Читает X-TG-Init-Data из заголовков, валидирует, кладёт user в request.
 */
export async function telegramAuthHook(
  req:   FastifyRequest,
  reply: FastifyReply,
) {
  // В dev-режиме без реального Telegram разрешаем тестовый bypass
  if (process.env.NODE_ENV === 'development') {
    const mockUserId = req.headers['x-dev-user-id'];
    if (mockUserId) {
      (req as any).tgUser = { id: Number(mockUserId), first_name: 'Dev' };
      return;
    }
  }

  const initData = req.headers['x-tg-init-data'] as string | undefined;
  if (!initData) {
    return reply.code(401).send({ error: 'Отсутствует X-TG-Init-Data' });
  }

  try {
    const user        = validateInitData(initData, process.env.BOT_TOKEN!);
    (req as any).tgUser = user;
  } catch (err: any) {
    return reply.code(401).send({ error: err.message });
  }
}

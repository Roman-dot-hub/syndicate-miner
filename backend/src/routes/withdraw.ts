// ─────────────────────────────────────────────
// routes/withdraw.ts  →  POST /api/withdraw
//
// Запрос вывода TON на внешний кошелёк.
// Anti-fraud: hold 48ч для новых аккаунтов,
// лимит 1% пула в сутки (проверка в коде,
// аппаратно дублируется в смарт-контракте).
// ─────────────────────────────────────────────

import { FastifyInstance }  from 'fastify';
import { telegramAuthHook } from '../auth/telegramAuth';
import { Pool }             from 'pg';
import { pgPoolConfig }     from '../db/client';

const pool = new Pool(pgPoolConfig);

const MIN_WITHDRAW_TON = 0.5;    // минимальный вывод
const WITHDRAW_FEE_PHASE1 = 0.15; // 15% комиссия в Фазе 1 (возврат в пул)
const WITHDRAW_FEE_PHASE2 = 0.10;
const WITHDRAW_FEE_DEFAULT = 0.05;
const HOLD_HOURS_NEW_USER  = 48;  // холд для новых аккаунтов

export async function withdrawRoutes(app: FastifyInstance) {

  // ── POST /api/withdraw — запросить вывод ──
  app.post('/api/withdraw', {
    preHandler: telegramAuthHook,
  }, async (req, reply) => {
    const tgUser = (req as any).tgUser;
    const { amountTon, walletAddress } = req.body as {
      amountTon:     number;
      walletAddress: string;
    };

    if (!amountTon || amountTon < MIN_WITHDRAW_TON) {
      return reply.code(400).send({
        error: `Минимальная сумма вывода: ${MIN_WITHDRAW_TON} TON`,
      });
    }
    if (!walletAddress || !walletAddress.startsWith('UQ') && !walletAddress.startsWith('EQ')) {
      return reply.code(400).send({ error: 'Некорректный TON-адрес (должен начинаться с UQ/EQ)' });
    }

    const [{ rows: [user] }, { rows: [poolRow] }] = await Promise.all([
      pool.query(`SELECT *, EXTRACT(EPOCH FROM (NOW() - created_at))/3600 AS age_hours
                  FROM users WHERE tg_user_id = $1`, [tgUser.id]),
      pool.query(`SELECT reserve_pool_ton, current_phase FROM pool_stats WHERE id = 1`),
    ]);

    if (!user) return reply.code(404).send({ error: 'Пользователь не найден' });

    // ── 1. Hold для новых аккаунтов ──────────
    const ageHours = parseFloat(user.age_hours);
    if (ageHours < HOLD_HOURS_NEW_USER) {
      const remainHours = Math.ceil(HOLD_HOURS_NEW_USER - ageHours);
      return reply.code(403).send({
        error: `Hold-период для нового аккаунта. Вывод доступен через ${remainHours} ч.`,
      });
    }

    // ── 2. Проверка баланса ───────────────────
    if (parseFloat(user.ton_balance) < amountTon) {
      return reply.code(400).send({ error: 'Недостаточно TON' });
    }

    // ── 3. Лимит 1% пула в сутки (на всех пользователей суммарно) ─
    const { rows: [dailyWithdraw] } = await pool.query(`
      SELECT COALESCE(SUM(amount_ton), 0) AS total
      FROM transactions
      WHERE type = 'withdrawal' AND created_at > NOW() - INTERVAL '24 hours'
    `);
    const dailyMax      = parseFloat(poolRow.reserve_pool_ton) * 0.01;
    const alreadyOut    = parseFloat(dailyWithdraw.total);
    if (alreadyOut + amountTon > dailyMax) {
      return reply.code(429).send({
        error: `Суточный лимит вывода достигнут (${dailyMax.toFixed(2)} TON). Попробуйте позже.`,
      });
    }

    // ── 4. Комиссия по фазе ───────────────────
    const phase    = poolRow.current_phase as number;
    const feeRate  = phase === 1 ? WITHDRAW_FEE_PHASE1
                   : phase === 2 ? WITHDRAW_FEE_PHASE2
                   : WITHDRAW_FEE_DEFAULT;
    const feeAmt   = parseFloat((amountTon * feeRate).toFixed(8));
    const netAmt   = parseFloat((amountTon - feeAmt).toFixed(8));

    // ── 5. Создаём запрос на вывод ────────────
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Списываем с баланса
      await client.query(
        `UPDATE users SET ton_balance = ton_balance - $1 WHERE id = $2`,
        [amountTon, user.id],
      );

      // Комиссия возвращается в пул
      await client.query(
        `UPDATE pool_stats SET reserve_pool_ton = reserve_pool_ton + $1 WHERE id = 1`,
        [feeAmt],
      );

      // Запись в transactions
      await client.query(`
        INSERT INTO transactions (user_id, type, amount_ton, note)
        VALUES ($1, 'withdrawal', $2, $3)
      `, [user.id, amountTon, `wallet:${walletAddress}`]);

      // Запись в очередь выплат (backend отправит через смарт-контракт)
      await client.query(`
        INSERT INTO withdrawal_queue (user_id, amount_ton, net_amount_ton, fee_ton, wallet_address, status)
        VALUES ($1, $2, $3, $4, $5, 'pending')
      `, [user.id, amountTon, netAmt, feeAmt, walletAddress]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return reply.send({
      ok:           true,
      requested:    amountTon,
      fee:          feeAmt,
      net:          netAmt,
      feePercent:   Math.round(feeRate * 100),
      status:       'pending',
      message:      'Запрос принят. Обработка до 10 минут.',
    });
  });

  // ── GET /api/withdraw/history — история выводов ─
  app.get('/api/withdraw/history', {
    preHandler: telegramAuthHook,
  }, async (req, reply) => {
    const tgUser = (req as any).tgUser;
    const { rows: [user] } = await pool.query(
      `SELECT id FROM users WHERE tg_user_id = $1`, [tgUser.id],
    );
    if (!user) return reply.code(404).send({ error: 'Пользователь не найден' });

    const { rows } = await pool.query(`
      SELECT amount_ton, net_amount_ton, fee_ton, status, created_at, wallet_address
      FROM withdrawal_queue
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [user.id]);

    return reply.send({ ok: true, data: rows });
  });
}

// ─────────────────────────────────────────────
// routes/action.ts  →  POST /api/action
//
// Все игровые действия игрока в одном endpoint.
// Тип действия передаётся в поле `type`.
// ─────────────────────────────────────────────

import { FastifyInstance }   from 'fastify';
import { Pool }              from 'pg';
import { telegramAuthHook }  from '../auth/telegramAuth';
import { antiWhale }         from '../db/queries';
import { refurbishCost }     from '../epoch/wearEngine';
import { GPU_SPECS,
         TAP_MAX_RPS,
         REDIS_TAP_PREFIX,
         PHASE1_MAX_ASIC_PER_USER }  from '../epoch/constants';
import { redis }             from '../redis/client';
import { refurbish }         from '../db/queries';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Цены инфраструктуры (TON/IGC)
const INFRA_COSTS: Record<string, { ton: number; igc: number; maxSlots: number }> = {
  farm_level_2: { ton: 0,   igc: 300,  maxSlots: 10 }, // Кладовка
  farm_level_3: { ton: 12,  igc: 0,    maxSlots: 20 }, // Гараж
  farm_level_4: { ton: 50,  igc: 0,    maxSlots: 50 }, // Ангар (Фаза 2+)
  cooling_1:    { ton: 0,   igc: 100,  maxSlots: 0  },
  cooling_2:    { ton: 3,   igc: 0,    maxSlots: 0  },
  cooling_3:    { ton: 15,  igc: 0,    maxSlots: 0  },
  workbench_1:  { ton: 0,   igc: 500,  maxSlots: 0  },
  workbench_2:  { ton: 5,   igc: 0,    maxSlots: 0  },
  workbench_3:  { ton: 25,  igc: 0,    maxSlots: 0  },
};

export async function actionRoutes(app: FastifyInstance) {

  app.post('/api/action', {
    preHandler: telegramAuthHook,
  }, async (req, reply) => {

    const tgUser  = (req as any).tgUser;
    const body    = req.body as Record<string, any>;
    const { type } = body;

    // Загружаем пользователя и фазу один раз
    const [{ rows: [user] }, { rows: [poolStats] }] = await Promise.all([
      pool.query(`SELECT * FROM users WHERE tg_user_id = $1`, [tgUser.id]),
      pool.query(`SELECT current_phase FROM pool_stats WHERE id = 1`),
    ]);

    if (!user) return reply.code(404).send({ error: 'Пользователь не найден' });
    const currentPhase: number = poolStats?.current_phase ?? 1;

    // ── Роутер действий ──────────────────────
    switch (type) {

      // ── Покупка оборудования ───────────────
      case 'buy_gpu': {
        const { modelTier } = body as { modelTier: number };
        const spec = GPU_SPECS[modelTier];
        if (!spec) return reply.code(400).send({ error: 'Неизвестный тир оборудования' });

        // Проверка доступности по фазе
        if (currentPhase < spec.availablePhase) {
          return reply.code(403).send({
            error: `Недоступно в Фазе ${currentPhase}. Открывается в Фазе ${spec.availablePhase}.`,
          });
        }

        // Цена из магазина (динамическая, упрощённо — базовая)
        const BASE_PRICES: Record<number, number> = {
          0:0, 1:1, 2:2.5, 3:8, 4:25, 5:70, 6:200,
        };
        const price = BASE_PRICES[modelTier];

        // Анти-кит проверки (только Фаза 1)
        await antiWhale.checkAndRecordSpend(user.id, price, currentPhase);
        if (spec.isAsic) {
          await antiWhale.checkAsicLimit(user.id, currentPhase);
        }

        // Проверяем баланс TON
        if (parseFloat(user.ton_balance) < price) {
          return reply.code(400).send({ error: 'Недостаточно TON' });
        }

        // Проверяем свободный слот в ферме
        const { rows: [farm] } = await pool.query(
          `SELECT f.id, f.max_slots,
                  COUNT(g.id) AS gpu_count
           FROM farms f
           LEFT JOIN gpus g ON g.farm_id = f.id AND g.status != 'broken'
           WHERE f.user_id = $1
           GROUP BY f.id`, [user.id],
        );
        if (!farm) return reply.code(400).send({ error: 'Ферма не найдена' });
        if (parseInt(farm.gpu_count) >= farm.max_slots) {
          return reply.code(400).send({ error: 'Нет свободных слотов. Расширьте ферму.' });
        }

        // Списываем TON (90% в пул, 10% в admin)
        const toPool  = price * 0.90;
        const toAdmin = price * 0.10;

        await pool.query(`BEGIN`);
        try {
          await pool.query(
            `UPDATE users SET ton_balance = ton_balance - $1 WHERE id = $2`,
            [price, user.id],
          );
          await pool.query(
            `UPDATE pool_stats SET
               reserve_pool_ton = reserve_pool_ton + $1,
               admin_earned_ton = admin_earned_ton + $2
             WHERE id = 1`,
            [toPool, toAdmin],
          );
          await pool.query(
            `INSERT INTO gpus (farm_id, user_id, model_tier, health, status, purchase_price_ton)
             VALUES ($1, $2, $3, 100, 'active', $4)`,
            [farm.id, user.id, modelTier, price],
          );
          await pool.query(`COMMIT`);
        } catch (e) {
          await pool.query(`ROLLBACK`);
          throw e;
        }

        return reply.send({ ok: true, message: `GPU tier ${modelTier} куплен` });
      }

      // ── Разгон / выключение разгона ────────
      case 'toggle_overclock': {
        const { gpuId } = body as { gpuId: string };
        const { rows: [gpu] } = await pool.query(
          `SELECT id, overclocked, health FROM gpus WHERE id = $1 AND user_id = $2`,
          [gpuId, user.id],
        );
        if (!gpu) return reply.code(404).send({ error: 'GPU не найдена' });
        if (gpu.health < 30) {
          return reply.code(400).send({ error: 'Нельзя разгонять карту с health < 30%' });
        }
        await pool.query(
          `UPDATE gpus SET overclocked = NOT overclocked WHERE id = $1`,
          [gpuId],
        );
        return reply.send({ ok: true, overclocked: !gpu.overclocked });
      }

      // ── Ремонт карты (базовый) ─────────────
      case 'repair_gpu': {
        const { gpuId } = body as { gpuId: string };
        const { rows: [gpu] } = await pool.query(
          `SELECT g.*, f.workbench_level
           FROM gpus g JOIN farms f ON f.id = g.farm_id
           WHERE g.id = $1 AND g.user_id = $2`,
          [gpuId, user.id],
        );
        if (!gpu) return reply.code(404).send({ error: 'GPU не найдена' });

        const cost = refurbishCost(gpu);
        if (!refurbish.canRefurbish(gpu.workbench_level, gpu.model_tier)) {
          return reply.code(400).send({
            error: `Требуется верстак уровня ${gpu.model_tier <= 2 ? 1 : gpu.model_tier <= 4 ? 2 : 3}`,
          });
        }
        if (parseFloat(user.igc_balance) < cost) {
          return reply.code(400).send({ error: `Недостаточно IGC. Нужно ${cost}` });
        }

        // Проверяем скидку из system_events
        const { rows: [discountEvent] } = await pool.query(
          `SELECT payload FROM system_events
           WHERE type = 'refurbish_discount' AND active_until > NOW()`,
        );
        const discountMult = discountEvent?.payload?.multiplier ?? 1.0;
        const finalCost    = Math.ceil(cost * discountMult);

        await refurbish.restoreGpu(user.id, gpuId, finalCost);
        return reply.send({ ok: true, igcSpent: finalCost });
      }

      // ── Tap-to-Cool (буст хешрейта) ────────
      case 'tap_cool': {
        // Rate limit: не более TAP_MAX_RPS в секунду
        const rateLimitKey = `${REDIS_TAP_PREFIX}rate:${user.id}`;
        const taps = await redis.incr(rateLimitKey);
        if (taps === 1) await redis.expire(rateLimitKey, 1);
        if (taps > TAP_MAX_RPS) {
          return reply.code(429).send({ error: 'Слишком быстро!' });
        }

        // Устанавливаем буст на 30 секунд
        const boostKey = `${REDIS_TAP_PREFIX}boost:${user.id}`;
        await redis.set(boostKey, '1', 'EX', 30);

        return reply.send({ ok: true, boostActive: true, boostSeconds: 30 });
      }

      // ── Переключение Solo / Pool ───────────
      case 'set_mining_mode': {
        const { mode } = body as { mode: 'pool' | 'solo' };
        if (!['pool', 'solo'].includes(mode)) {
          return reply.code(400).send({ error: 'mode должен быть pool или solo' });
        }
        await pool.query(
          `UPDATE farms SET mining_mode = $1 WHERE user_id = $2`,
          [mode, user.id],
        );
        return reply.send({ ok: true, mode });
      }

      // ── Покупка инфраструктуры ─────────────
      case 'upgrade_infra': {
        const { upgradeType } = body as { upgradeType: string };
        const cost = INFRA_COSTS[upgradeType];
        if (!cost) return reply.code(400).send({ error: 'Неизвестный апгрейд' });

        // Ангар только в Фазе 2+
        if (upgradeType === 'farm_level_4' && currentPhase < 2) {
          return reply.code(403).send({ error: 'Ангар доступен с Фазы 2' });
        }

        if (cost.ton > 0 && parseFloat(user.ton_balance) < cost.ton) {
          return reply.code(400).send({ error: 'Недостаточно TON' });
        }
        if (cost.igc > 0 && parseFloat(user.igc_balance) < cost.igc) {
          return reply.code(400).send({ error: 'Недостаточно IGC' });
        }

        await pool.query(`BEGIN`);
        try {
          if (cost.ton > 0) {
            await pool.query(
              `UPDATE users SET ton_balance = ton_balance - $1 WHERE id = $2`,
              [cost.ton, user.id],
            );
            await pool.query(
              `UPDATE pool_stats SET
                 reserve_pool_ton = reserve_pool_ton + $1,
                 admin_earned_ton = admin_earned_ton + $2
               WHERE id = 1`,
              [cost.ton * 0.9, cost.ton * 0.1],
            );
          }
          if (cost.igc > 0) {
            await pool.query(
              `UPDATE users SET igc_balance = igc_balance - $1 WHERE id = $2`,
              [cost.igc, user.id],
            );
          }

          // Применяем апгрейд к ферме
          if (upgradeType.startsWith('farm_level_')) {
            const level = parseInt(upgradeType.split('_').pop()!);
            await pool.query(
              `UPDATE farms SET level = $1, max_slots = $2 WHERE user_id = $3`,
              [level, cost.maxSlots, user.id],
            );
          } else if (upgradeType.startsWith('cooling_')) {
            const lvl = parseInt(upgradeType.split('_').pop()!);
            await pool.query(
              `UPDATE farms SET cooling_level = $1 WHERE user_id = $2`,
              [lvl, user.id],
            );
          } else if (upgradeType.startsWith('workbench_')) {
            const lvl = parseInt(upgradeType.split('_').pop()!);
            await pool.query(
              `UPDATE farms SET workbench_level = $1 WHERE user_id = $2`,
              [lvl, user.id],
            );
          }

          await pool.query(`COMMIT`);
        } catch (e) {
          await pool.query(`ROLLBACK`);
          throw e;
        }

        return reply.send({ ok: true, upgraded: upgradeType });
      }

      default:
        return reply.code(400).send({ error: `Неизвестный тип действия: ${type}` });
    }
  });
}

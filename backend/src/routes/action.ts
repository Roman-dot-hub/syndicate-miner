// ─────────────────────────────────────────────
// routes/action.ts  →  POST /api/action
//
// Все игровые действия игрока в одном endpoint.
// Тип действия передаётся в поле `type`.
// ─────────────────────────────────────────────

import { FastifyInstance }   from 'fastify';
import { Pool }              from 'pg';
import { pgPoolConfig }      from '../db/client';
import { telegramAuthHook }  from '../auth/telegramAuth';
import { antiWhale }         from '../db/queries';
import { refurbishCost }     from '../epoch/wearEngine';
import { GPU_SPECS,
         TAP_MAX_RPS,
         REDIS_TAP_PREFIX,
         REDIS_AD_COUNT_PREFIX,
         REDIS_AD_COOLDOWN_PREFIX,
         PHASE1_MAX_ASIC_PER_USER,
         TAP_BOOST_PER_TAP_SEC,
         TAP_BOOST_MAX_SEC,
         TAP_SESSION_LIMIT,
         TAP_COOLDOWN_SEC,
         TAP_JITTER_MIN_MS,
         TAP_JITTER_SAMPLE,
         AD_BOOST_SEC,
         AD_VIEWS_PER_CYCLE,
         AD_COOLDOWN_SEC,
         SYNDICATE_CREATION_COST_IGC,
         SYNDICATE_LEVEL_XP_COSTS,
         SYNDICATE_LEVEL_MILESTONES,
         SYNDICATE_BASE_MAX_MEMBERS,
         SYNDICATE_BONUS_DEFS,
         SERVER_ROOM_LEVELS,
         UPS_LEVELS,
         PROVIDER_LEVELS,
         PASTE_LEVELS,
         FAN_LEVELS,
         LIQUID_COOLING_LEVELS,
         STAKE_MIN_TON,
         STAKE_UNSTAKE_DAILY_LIMIT_PCT } from '../epoch/constants';
import { redis }             from '../redis/client';
import { refurbish }         from '../db/queries';

const pool = new Pool(pgPoolConfig);

// ── IGC ratio для динамического ценообразования ──────────
// Возвращает сглаженный ratio из pool_stats, зажатый в [0.5, 2.0].
// Формула: finalIgcCost = Math.ceil(baseCost * ratio)
// ratio > 1 (профицит) → дороже → сжигаем больше IGC
// ratio < 1 (дефицит)  → дешевле → сохраняем IGC
async function getIgcRatio(): Promise<number> {
  try {
    const { rows: [ps] } = await pool.query(
      `SELECT igc_ratio_smoothed FROM pool_stats WHERE id = 1`,
    );
    const r = parseFloat(ps?.igc_ratio_smoothed ?? '1');
    return Math.max(0.5, Math.min(2.0, isNaN(r) ? 1 : r));
  } catch {
    return 1.0;
  }
}

// ── Трекинг потоков IGC для рыночного индекса ────────────
// Все IGC-операции вне epochRunner обновляют дневные счётчики атомарно.
// supply: IGC, входящий в обращение (buy_igc)
// demand: IGC, уходящий из обращения (ремонт, апгрейды, синдикаты, sell_igc)
// Вызывается best-effort (ошибка не ломает игровую транзакцию).
async function trackIgcMarket(supply: number, demand: number): Promise<void> {
  if (supply <= 0 && demand <= 0) return;
  await pool.query(`
    UPDATE pool_stats SET
      igc_daily_supply = CASE WHEN igc_daily_date = CURRENT_DATE THEN igc_daily_supply + $1 ELSE $1 END,
      igc_daily_demand = CASE WHEN igc_daily_date = CURRENT_DATE THEN igc_daily_demand + $2 ELSE $2 END,
      igc_daily_date   = CURRENT_DATE
    WHERE id = 1
  `, [supply, demand]);
}

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
        const modelTier: number = body.model_tier ?? body.modelTier;
        const spec = GPU_SPECS[modelTier];
        if (!spec) return reply.code(400).send({ error: 'Неизвестный тир оборудования' });

        // USB Nano выдаётся бесплатно при регистрации, купить нельзя
        if (modelTier === 0) {
          return reply.code(400).send({ error: 'USB Nano нельзя купить — он выдаётся бесплатно при первом входе' });
        }

        // Проверка доступности по фазе
        if (currentPhase < spec.availablePhase) {
          return reply.code(403).send({
            error: `Недоступно в Фазе ${currentPhase}. Открывается в Фазе ${spec.availablePhase}.`,
          });
        }

        // Цена из магазина (динамическая, упрощённо — базовая)
        const BASE_PRICES: Record<number, number> = {
          0: 0, 1: 1.5, 2: 2.5, 3: 8, 4: 25, 5: 55, 6: 140,
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
           LEFT JOIN gpus g ON g.farm_id = f.id AND g.status NOT IN ('broken', 'stored')
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
          await pool.query(
            `INSERT INTO transactions (user_id, type, amount_ton, amount_igc)
             VALUES ($1, 'buy_gpu', $2, 0)`,
            [user.id, price],
          );
          await pool.query(`COMMIT`);
        } catch (e) {
          await pool.query(`ROLLBACK`);
          throw e;
        }

        return reply.send({ ok: true, message: `GPU tier ${modelTier} куплен` });
      }

      // ── Перезапуск offline GPU ──────────────
      case 'restart_gpu': {
        const gpuId: string = body.gpuId ?? body.gpu_id;
        const { rows: [gpu] } = await pool.query(
          `SELECT g.id, g.status, g.model_tier, f.id AS farm_id, f.max_slots,
                  COUNT(g2.id) AS used_slots
           FROM gpus g
           JOIN farms f ON f.id = g.farm_id
           LEFT JOIN gpus g2 ON g2.farm_id = f.id AND g2.status NOT IN ('broken','stored','offline') AND g2.id != g.id
           WHERE g.id = $1 AND g.user_id = $2
           GROUP BY g.id, f.id`,
          [gpuId, user.id],
        );
        if (!gpu) return reply.code(404).send({ error: 'GPU не найдена' });
        if (gpu.status !== 'offline') return reply.code(400).send({ error: 'GPU не offline' });
        if (parseInt(gpu.used_slots) >= gpu.max_slots) {
          return reply.code(400).send({ error: 'Нет свободных слотов — освободи место' });
        }

        // Проверяем что IGC хватает хотя бы на 1 эпоху
        const spec = GPU_SPECS[gpu.model_tier];
        const igcPerEpoch = spec.igcMaintenancePerEpoch;
        if (parseFloat(user.igc_balance) < igcPerEpoch) {
          return reply.code(400).send({
            error: `Недостаточно IGC. Нужно минимум ${igcPerEpoch.toFixed(2)} IGC для запуска`,
          });
        }

        await pool.query(`UPDATE gpus SET status = 'active' WHERE id = $1`, [gpuId]);
        return reply.send({ ok: true, message: 'GPU перезапущена' });
      }

      // ── Перезапуск всей фермы (после перебоев в электроснабжении) ──────────
      case 'restart_farm': {
        const { rows: [farmRow] } = await pool.query(
          `SELECT id FROM farms WHERE user_id = $1`,
          [user.id],
        );
        if (!farmRow) return reply.code(404).send({ error: 'Ферма не найдена' });

        const result = await pool.query(
          `UPDATE gpus SET status = 'active' WHERE farm_id = $1 AND status = 'offline'`,
          [farmRow.id],
        );
        const restarted = result.rowCount ?? 0;
        if (restarted === 0) return reply.code(400).send({ error: 'Нет offline GPU для перезапуска' });
        console.log(`[Action] restart_farm: user ${user.id} перезапустил ${restarted} GPU`);
        return reply.send({ ok: true, restarted });
      }

      // ── Разгон / выключение разгона ────────
      case 'overclock':
      case 'toggle_overclock': {
        const gpuId: string = body.gpuId ?? body.gpu_id;
        const { rows: [gpu] } = await pool.query(
          `SELECT id, overclocked, undervolted, health, model_tier FROM gpus WHERE id = $1 AND user_id = $2`,
          [gpuId, user.id],
        );
        if (!gpu) return reply.code(404).send({ error: 'GPU не найдена' });
        if (gpu.model_tier === 0) {
          return reply.code(400).send({ error: 'USB Nano нельзя разгонять — базовый майнер без настроек' });
        }
        if (gpu.health < 30) {
          return reply.code(400).send({ error: 'Нельзя разгонять карту с health < 30%' });
        }
        const enableOC = !gpu.overclocked;
        // Enabling OC clears undervolting (they are mutually exclusive)
        await pool.query(
          `UPDATE gpus SET overclocked = $1, undervolted = CASE WHEN $1 THEN FALSE ELSE undervolted END WHERE id = $2`,
          [enableOC, gpuId],
        );
        return reply.send({ ok: true, overclocked: enableOC, undervolted: enableOC ? false : gpu.undervolted });
      }

      // ── Ремонт карты (базовый) ─────────────
      case 'refurbish':
      case 'repair_gpu': {
        const gpuId: string = body.gpuId ?? body.gpu_id;
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

        // Динамическая цена: ratio × baseCost × системная скидка
        const [igcRatioRefurbish, { rows: [discountEvent] }] = await Promise.all([
          getIgcRatio(),
          pool.query(
            `SELECT payload FROM system_events
             WHERE type = 'refurbish_discount' AND active_until > NOW()`,
          ),
        ]);
        const discountMult = discountEvent?.payload?.multiplier ?? 1.0;
        const finalCost    = Math.ceil(cost * igcRatioRefurbish * discountMult);

        if (parseFloat(user.igc_balance) < finalCost) {
          return reply.code(400).send({ error: `Недостаточно IGC. Нужно ${finalCost} IGC (×${igcRatioRefurbish.toFixed(2)} рынок)` });
        }

        await refurbish.restoreGpu(user.id, gpuId, finalCost);
        // Запись в историю транзакций
        if (finalCost > 0) {
          await pool.query(
            `INSERT INTO transactions (user_id, type, amount_ton, amount_igc)
             VALUES ($1, 'repair_gpu', 0, $2)`,
            [user.id, finalCost],
          );
        }
        // Трекинг рыночного индекса: ремонт = demand (IGC сожжён)
        trackIgcMarket(0, finalCost).catch(() => {});
        return reply.send({ ok: true, igcSpent: finalCost, igcRatio: igcRatioRefurbish });
      }

      // ── Снижение напряжения (андервольтинг) ───
      case 'toggle_undervolting': {
        const gpuId: string = body.gpuId ?? body.gpu_id;
        const { rows: [gpu] } = await pool.query(
          `SELECT id, overclocked, undervolted, model_tier FROM gpus WHERE id = $1 AND user_id = $2`,
          [gpuId, user.id],
        );
        if (!gpu) return reply.code(404).send({ error: 'GPU не найдена' });
        if (gpu.model_tier === 0) {
          return reply.code(400).send({ error: 'USB Nano нельзя андервольтить — базовый майнер без настроек' });
        }
        const enableUV = !gpu.undervolted;
        // Enabling UV clears overclocking (mutually exclusive)
        await pool.query(
          `UPDATE gpus SET undervolted = $1, overclocked = CASE WHEN $1 THEN FALSE ELSE overclocked END WHERE id = $2`,
          [enableUV, gpuId],
        );
        return reply.send({ ok: true, undervolted: enableUV, overclocked: enableUV ? false : gpu.overclocked });
      }

      // ── Снять GPU на склад ─────────────────
      case 'move_to_storage': {
        const gpuId: string = body.gpuId ?? body.gpu_id;
        const { rows: [gpu] } = await pool.query(
          `SELECT id, status FROM gpus WHERE id = $1 AND user_id = $2`,
          [gpuId, user.id],
        );
        if (!gpu) return reply.code(404).send({ error: 'GPU не найдена' });
        if (gpu.status === 'stored') return reply.code(400).send({ error: 'GPU уже на складе' });
        await pool.query(`UPDATE gpus SET status = 'stored' WHERE id = $1`, [gpuId]);
        return reply.send({ ok: true });
      }

      // ── Вернуть GPU из склада в слот ──────
      case 'move_from_storage': {
        const gpuId: string = body.gpuId ?? body.gpu_id;
        const { rows: [gpu] } = await pool.query(
          `SELECT id, status FROM gpus WHERE id = $1 AND user_id = $2`,
          [gpuId, user.id],
        );
        if (!gpu) return reply.code(404).send({ error: 'GPU не найдена' });
        if (gpu.status !== 'stored') return reply.code(400).send({ error: 'GPU не на складе' });

        // Проверяем слоты
        const { rows: [farm] } = await pool.query(
          `SELECT f.max_slots, COUNT(g.id) AS gpu_count
           FROM farms f
           LEFT JOIN gpus g ON g.farm_id = f.id AND g.status NOT IN ('broken', 'stored')
           WHERE f.user_id = $1
           GROUP BY f.max_slots`, [user.id],
        );
        if (!farm) return reply.code(400).send({ error: 'Ферма не найдена' });
        if (parseInt(farm.gpu_count) >= farm.max_slots) {
          return reply.code(400).send({ error: 'Нет свободных слотов. Расширьте ферму.' });
        }

        await pool.query(`UPDATE gpus SET status = 'active' WHERE id = $1`, [gpuId]);
        return reply.send({ ok: true });
      }

      // ── Ad Boost (+5 мин за просмотр, 10 просмотров = 50 мин, потом 4ч пауза) ────────
      case 'watch_ad_boost': {
        const endKey      = `${REDIS_TAP_PREFIX}end:${user.id}`;
        const countKey    = `${REDIS_AD_COUNT_PREFIX}${user.id}`;
        const cooldownKey = `${REDIS_AD_COOLDOWN_PREFIX}${user.id}`;

        try {
          const nowSec = Math.floor(Date.now() / 1000);

          // 1. Проверяем паузу после цикла
          const cooldownTtl = await redis.ttl(cooldownKey);
          if (cooldownTtl > 0) {
            const storedEnd  = parseInt(await redis.get(endKey) ?? '0', 10);
            const boostSeconds = Math.max(0, storedEnd - nowSec);
            return reply.code(429).send({
              error: 'cooldown',
              message: 'Пауза после цикла. Возвращайся позже!',
              cooldownSeconds: cooldownTtl,
              boostSeconds,
            });
          }

          // 2. Добавляем +5 мин к бусту
          const storedEnd = parseInt(await redis.get(endKey) ?? '0', 10);
          const baseEnd   = Math.max(storedEnd, nowSec);
          const newEnd    = baseEnd + AD_BOOST_SEC;
          await redis.set(endKey, String(newEnd), 'EX', AD_BOOST_SEC * AD_VIEWS_PER_CYCLE + 3600);

          // 3. Счётчик просмотров в цикле
          const viewCount = await redis.incr(countKey);
          // TTL счётчика: чуть больше паузы, чтобы не пропал раньше
          if (viewCount === 1) await redis.expire(countKey, AD_COOLDOWN_SEC + 600);

          // 4. После 10-го просмотра — ставим 4-часовую паузу и сбрасываем счётчик
          if (viewCount >= AD_VIEWS_PER_CYCLE) {
            await redis.set(cooldownKey, '1', 'EX', AD_COOLDOWN_SEC);
            await redis.del(countKey);
          }

          const boostSeconds = newEnd - nowSec;
          return reply.send({
            ok: true,
            boostSeconds,
            adViewsInCycle:  Math.min(viewCount, AD_VIEWS_PER_CYCLE),
            adViewsPerCycle: AD_VIEWS_PER_CYCLE,
          });

        } catch (err) {
          console.error('[watch_ad_boost] Redis error:', (err as Error)?.message ?? err);
          return reply.send({ ok: true, boostSeconds: AD_BOOST_SEC, adViewsInCycle: 1, adViewsPerCycle: AD_VIEWS_PER_CYCLE });
        }
      }

      // ── Tap-to-Cool (буст хешрейта) — legacy, оставлен для совместимости ────────
      case 'tap_cool': {
        // boost_end хранит unix-секунду окончания буста (не TTL, а конкретный момент)
        // Это решает проблему гонки: TTL-ключ истекает за время round-trip,
        // а timestamp накапливается правильно при любой задержке сети.
        const endKey      = `${REDIS_TAP_PREFIX}end:${user.id}`;
        const countKey    = `${REDIS_TAP_PREFIX}count:${user.id}`;
        const cooldownKey = `${REDIS_TAP_PREFIX}cooldown:${user.id}`;
        const timesKey    = `${REDIS_TAP_PREFIX}times:${user.id}`;
        const rateKey     = `${REDIS_TAP_PREFIX}rate:${user.id}`;

        try {
          const nowSec = Math.floor(Date.now() / 1000);

          // 1. Обязательная пауза после 3600 тапов
          const cooldownTtl = await redis.ttl(cooldownKey);
          if (cooldownTtl > 0) {
            const storedEnd   = parseInt(await redis.get(endKey) ?? '0', 10);
            const boostSeconds = Math.max(0, storedEnd - nowSec);
            return reply.code(429).send({
              error: 'cooldown',
              cooldownSeconds: cooldownTtl,
              boostSeconds,
              tapsUsed: 0,
            });
          }

          // 2. Лимит в секунду (анти-спам)
          const rps = await redis.incr(rateKey);
          if (rps === 1) await redis.expire(rateKey, 1);
          if (rps > TAP_MAX_RPS) {
            return reply.code(429).send({ error: 'Слишком быстро!' });
          }

          // 3. Проверка равномерности интервалов (анти-бот)
          const nowMs = Date.now();
          await redis.lpush(timesKey, nowMs);
          await redis.ltrim(timesKey, 0, TAP_JITTER_SAMPLE - 1);
          await redis.expire(timesKey, 10);

          const rawTimes = await redis.lrange(timesKey, 0, -1);
          if (rawTimes.length >= TAP_JITTER_SAMPLE) {
            const times = rawTimes.map(Number).sort((a, b) => b - a);
            const intervals: number[] = [];
            for (let i = 0; i < times.length - 1; i++) {
              intervals.push(times[i] - times[i + 1]);
            }
            if (Math.max(...intervals) - Math.min(...intervals) < TAP_JITTER_MIN_MS) {
              const storedEnd    = parseInt(await redis.get(endKey) ?? '0', 10);
              const boostSeconds = Math.max(0, storedEnd - nowSec);
              const tapCount     = parseInt(await redis.get(countKey) ?? '0', 10);
              return reply.send({ ok: true, boostSeconds, tapsUsed: tapCount, suspicious: true });
            }
          }

          // 4. Увеличиваем счётчик сессии
          const tapCount = await redis.incr(countKey);

          // 5. boost_end = max(текущий момент, сохранённый конец) + 1 сек
          //    Ограничиваем: конец не может быть дальше чем TAP_BOOST_MAX_SEC от сейчас
          const storedEnd  = parseInt(await redis.get(endKey) ?? '0', 10);
          const baseEnd    = Math.max(storedEnd, nowSec);
          const newEnd     = Math.min(baseEnd + TAP_BOOST_PER_TAP_SEC, nowSec + TAP_BOOST_MAX_SEC);
          const boostSeconds = newEnd - nowSec;
          // Храним с запасом TTL чтобы ключ не пропал раньше времени
          await redis.set(endKey, String(newEnd), 'EX', TAP_BOOST_MAX_SEC + 60);

          // 6. Обязательная пауза после лимита
          if (tapCount >= TAP_SESSION_LIMIT) {
            await redis.set(cooldownKey, '1', 'EX', TAP_COOLDOWN_SEC);
            await redis.del(countKey);
            await redis.del(endKey);
          }

          return reply.send({
            ok: true,
            boostSeconds,
            tapsUsed: tapCount,
            tapsRemaining: Math.max(0, TAP_SESSION_LIMIT - tapCount),
          });

        } catch (err) {
          console.error('[tap_cool] Redis error:', (err as Error)?.message ?? err);
          // Redis unavailable — give 1 sec boost per tap so the feature still works
          return reply.send({ ok: true, boostSeconds: 1, tapsUsed: 0, tapsRemaining: TAP_SESSION_LIMIT });
        }
      }

      // ── Переключение Solo / Pool ───────────
      case 'set_mode':
      case 'set_mining_mode': {
        const { mode } = body as { mode: 'pool' | 'solo' };
        if (!['pool', 'solo'].includes(mode)) {
          return reply.code(400).send({ error: 'mode должен быть pool или solo' });
        }
        // Pool-майнинг требует участия в синдикате
        if (mode === 'pool') {
          const { rows: [membership] } = await pool.query(
            `SELECT 1 FROM syndicate_members WHERE user_id = $1`, [user.id],
          );
          if (!membership) {
            return reply.code(403).send({ error: 'Pool-майнинг требует синдиката. Вступи или создай синдикат.' });
          }
        }
        await pool.query(
          `UPDATE users SET mining_mode = $1 WHERE id = $2`,
          [mode, user.id],
        );
        return reply.send({ ok: true, mode });
      }

      // ── Создать синдикат ──────────────────
      case 'create_syndicate': {
        const { name } = body as { name: string };
        if (!name || name.trim().length < 3 || name.trim().length > 30) {
          return reply.code(400).send({ error: 'Название: 3–30 символов' });
        }
        if (parseFloat(user.igc_balance) < SYNDICATE_CREATION_COST_IGC) {
          return reply.code(400).send({ error: `Нужно ${SYNDICATE_CREATION_COST_IGC} IGC` });
        }
        // Проверяем, не состоит ли уже в синдикате
        const { rows: [existingMember] } = await pool.query(
          `SELECT 1 FROM syndicate_members WHERE user_id = $1`, [user.id],
        );
        if (existingMember) {
          return reply.code(400).send({ error: 'Ты уже в синдикате. Выйди перед созданием нового.' });
        }
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(
            `UPDATE users SET igc_balance = igc_balance - $1 WHERE id = $2`,
            [SYNDICATE_CREATION_COST_IGC, user.id],
          );
          await client.query(`
            UPDATE pool_stats SET
              total_igc_burned = total_igc_burned + $1,
              igc_daily_demand = CASE WHEN igc_daily_date = CURRENT_DATE THEN igc_daily_demand + $1 ELSE $1 END,
              igc_daily_date   = CURRENT_DATE
            WHERE id = 1`,
            [SYNDICATE_CREATION_COST_IGC],
          );
          const { rows: [syn] } = await client.query(
            `INSERT INTO syndicates (name, leader_id) VALUES ($1, $2) RETURNING id`,
            [name.trim(), user.id],
          );
          await client.query(
            `INSERT INTO syndicate_members (syndicate_id, user_id, role) VALUES ($1, $2, 'leader')`,
            [syn.id, user.id],
          );
          await client.query(
            `UPDATE users SET mining_mode = 'pool' WHERE id = $1`,
            [user.id],
          );
          await client.query('COMMIT');
          return reply.send({ ok: true, syndicateId: syn.id });
        } catch (e) {
          await client.query('ROLLBACK');
          if ((e as any)?.code === '23505') {
            return reply.code(400).send({ error: 'Название уже занято' });
          }
          throw e;
        } finally { client.release(); }
      }

      // ── Вступить в синдикат ───────────────
      case 'join_syndicate': {
        const { syndicateId } = body as { syndicateId: string };
        const { rows: [existingMember] } = await pool.query(
          `SELECT 1 FROM syndicate_members WHERE user_id = $1`, [user.id],
        );
        if (existingMember) {
          return reply.code(400).send({ error: 'Ты уже в синдикате' });
        }
        const { rows: [syn] } = await pool.query(
          `SELECT s.id, s.level,
                  COUNT(sm.user_id) AS member_count
           FROM syndicates s
           LEFT JOIN syndicate_members sm ON sm.syndicate_id = s.id
           WHERE s.id = $1
           GROUP BY s.id`, [syndicateId],
        );
        if (!syn) return reply.code(404).send({ error: 'Синдикат не найден' });
        // Проверяем лимит участников по уровню
        const milestone = Object.entries(SYNDICATE_LEVEL_MILESTONES)
          .filter(([lvl]) => parseInt(lvl) <= syn.level)
          .sort(([a], [b]) => parseInt(b) - parseInt(a))[0];
        const maxMembers = milestone ? milestone[1].maxMembers : SYNDICATE_BASE_MAX_MEMBERS;
        if (parseInt(syn.member_count) >= maxMembers) {
          return reply.code(400).send({ error: `Синдикат заполнен (макс. ${maxMembers})` });
        }
        await pool.query(
          `INSERT INTO syndicate_members (syndicate_id, user_id, role) VALUES ($1, $2, 'member')`,
          [syndicateId, user.id],
        );
        await pool.query(`UPDATE users SET mining_mode = 'pool' WHERE id = $1`, [user.id]);
        return reply.send({ ok: true });
      }

      // ── Выйти из синдиката ───────────────
      case 'leave_syndicate': {
        const { rows: [membership] } = await pool.query(
          `SELECT sm.syndicate_id, sm.role
           FROM syndicate_members sm WHERE sm.user_id = $1`, [user.id],
        );
        if (!membership) return reply.code(400).send({ error: 'Ты не в синдикате' });
        if (membership.role === 'leader') {
          return reply.code(400).send({ error: 'Лидер не может покинуть синдикат. Передай роль или растворь синдикат.' });
        }
        await pool.query(`DELETE FROM syndicate_members WHERE user_id = $1`, [user.id]);
        await pool.query(`UPDATE users SET mining_mode = 'solo' WHERE id = $1`, [user.id]);
        return reply.send({ ok: true });
      }

      // ── Пополнить казну (взнос IGC) ──────
      case 'contribute_igc': {
        const amount = parseFloat(body.amount ?? '0');
        if (amount < 1) return reply.code(400).send({ error: 'Минимальный взнос: 1 IGC' });
        if (parseFloat(user.igc_balance) < amount) {
          return reply.code(400).send({ error: 'Недостаточно IGC' });
        }
        const { rows: [membership] } = await pool.query(
          `SELECT sm.syndicate_id FROM syndicate_members sm WHERE sm.user_id = $1`, [user.id],
        );
        if (!membership) return reply.code(400).send({ error: 'Ты не в синдикате' });

        const client2 = await pool.connect();
        try {
          await client2.query('BEGIN');
          await client2.query(
            `UPDATE users SET igc_balance = igc_balance - $1 WHERE id = $2`,
            [amount, user.id],
          );
          const { rows: [synRow] } = await client2.query(
            `UPDATE syndicates SET treasury_igc = treasury_igc + $1, xp = xp + $1
             WHERE id = $2 RETURNING xp, level`,
            [amount, membership.syndicate_id],
          );
          // Пересчитываем уровень по накопленному XP
          const newLevel = calcSyndicateLevel(parseFloat(synRow.xp));
          if (newLevel > parseInt(synRow.level)) {
            await client2.query(
              `UPDATE syndicates SET level = $1 WHERE id = $2`,
              [newLevel, membership.syndicate_id],
            );
          }
          await client2.query('COMMIT');
          return reply.send({ ok: true, newXp: parseFloat(synRow.xp), newLevel });
        } catch (e) {
          await client2.query('ROLLBACK'); throw e;
        } finally { client2.release(); }
      }

      // ── Купить бонус синдиката ────────────
      case 'buy_syndicate_bonus': {
        const { bonusType } = body as { bonusType: string };
        const def = SYNDICATE_BONUS_DEFS[bonusType];
        if (!def) return reply.code(400).send({ error: 'Неизвестный бонус' });

        const { rows: [membership] } = await pool.query(
          `SELECT sm.syndicate_id, sm.role FROM syndicate_members sm WHERE sm.user_id = $1`, [user.id],
        );
        if (!membership) return reply.code(400).send({ error: 'Ты не в синдикате' });
        if (membership.role !== 'leader') {
          return reply.code(403).send({ error: 'Только лидер может покупать бонусы' });
        }

        const { rows: [syn] } = await pool.query(
          `SELECT id, level, treasury_igc FROM syndicates WHERE id = $1`, [membership.syndicate_id],
        );
        if (syn.level < def.requiredLevel) {
          return reply.code(400).send({ error: `Требуется уровень синдиката ${def.requiredLevel}` });
        }

        // Динамическая цена бонуса: baseCost × igcRatio рынка
        const igcRatioBonus  = await getIgcRatio();
        const finalBonusCost = Math.ceil(def.igcCost * igcRatioBonus);

        if (parseFloat(syn.treasury_igc) < finalBonusCost) {
          return reply.code(400).send({
            error: `Нужно ${finalBonusCost} IGC в казне (×${igcRatioBonus.toFixed(2)} рынок)`,
          });
        }

        // Нельзя активировать бонус пока предыдущий такого же типа ещё действует
        const { rows: [existing] } = await pool.query(
          `SELECT id FROM syndicate_bonuses WHERE syndicate_id = $1 AND type = $2 AND expires_at > NOW()`,
          [syn.id, bonusType],
        );
        if (existing) {
          return reply.code(400).send({ error: 'Этот бонус уже активен — подожди пока он закончится' });
        }

        // Бусты хэшрейта взаимоисключающие: boost_x1 и boost_x2 не могут быть активны одновременно
        const HASHRATE_BOOST_TYPES = ['boost_x1', 'boost_x2'];
        if (HASHRATE_BOOST_TYPES.includes(bonusType)) {
          const { rows: [conflicting] } = await pool.query(
            `SELECT type FROM syndicate_bonuses
             WHERE syndicate_id = $1
               AND type = ANY($2::text[])
               AND type != $3
               AND expires_at > NOW()`,
            [syn.id, HASHRATE_BOOST_TYPES, bonusType],
          );
          if (conflicting) {
            return reply.code(400).send({
              error: `Буст хэшрейта "${conflicting.type}" уже активен — дождись окончания перед активацией другого`,
            });
          }
        }

        const client3 = await pool.connect();
        try {
          await client3.query('BEGIN');
          await client3.query(
            `UPDATE syndicates SET treasury_igc = treasury_igc - $1 WHERE id = $2`,
            [finalBonusCost, syn.id],
          );
          await client3.query(`
            UPDATE pool_stats SET
              total_igc_burned = total_igc_burned + $1,
              igc_daily_demand = CASE WHEN igc_daily_date = CURRENT_DATE THEN igc_daily_demand + $1 ELSE $1 END,
              igc_daily_date   = CURRENT_DATE
            WHERE id = 1`,
            [finalBonusCost],
          );
          const expiresAt = new Date(Date.now() + def.durationSec * 1000);
          await client3.query(
            `INSERT INTO syndicate_bonuses (syndicate_id, type, expires_at) VALUES ($1, $2, $3)`,
            [syn.id, bonusType, expiresAt],
          );
          await client3.query('COMMIT');
          return reply.send({ ok: true, expiresAt, igcSpent: finalBonusCost, igcRatio: igcRatioBonus });
        } catch (e) {
          await client3.query('ROLLBACK'); throw e;
        } finally { client3.release(); }
      }

      // ── Проголосовать за нового лидера ────
      case 'vote_leader': {
        const { candidateId } = body as { candidateId: string };
        const { rows: [voterMembership] } = await pool.query(
          `SELECT sm.syndicate_id FROM syndicate_members sm WHERE sm.user_id = $1`, [user.id],
        );
        if (!voterMembership) return reply.code(400).send({ error: 'Ты не в синдикате' });
        // Кандидат должен быть в том же синдикате
        const { rows: [candidateMembership] } = await pool.query(
          `SELECT 1 FROM syndicate_members WHERE user_id = $1 AND syndicate_id = $2`,
          [candidateId, voterMembership.syndicate_id],
        );
        if (!candidateMembership) return reply.code(400).send({ error: 'Кандидат не в синдикате' });

        // Upsert голос
        await pool.query(
          `INSERT INTO syndicate_votes (syndicate_id, candidate_id, voter_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (syndicate_id, voter_id) DO UPDATE SET candidate_id = $2, created_at = NOW()`,
          [voterMembership.syndicate_id, candidateId, user.id],
        );

        // Считаем голоса: если кандидат набрал >50% — становится лидером
        const { rows: [voteResult] } = await pool.query(
          `SELECT
             (SELECT COUNT(*) FROM syndicate_votes WHERE syndicate_id = $1 AND candidate_id = $2) AS votes_for,
             (SELECT COUNT(*) FROM syndicate_members WHERE syndicate_id = $1) AS total_members`,
          [voterMembership.syndicate_id, candidateId],
        );
        const votesFor     = parseInt(voteResult.votes_for);
        const totalMembers = parseInt(voteResult.total_members);
        let promoted = false;
        if (votesFor * 2 > totalMembers) {
          // Сменить лидера
          await pool.query(
            `UPDATE syndicates SET leader_id = $1 WHERE id = $2`,
            [candidateId, voterMembership.syndicate_id],
          );
          await pool.query(
            `UPDATE syndicate_members SET role = 'member' WHERE syndicate_id = $1 AND role = 'leader'`,
            [voterMembership.syndicate_id],
          );
          await pool.query(
            `UPDATE syndicate_members SET role = 'leader' WHERE syndicate_id = $1 AND user_id = $2`,
            [voterMembership.syndicate_id, candidateId],
          );
          await pool.query(
            `DELETE FROM syndicate_votes WHERE syndicate_id = $1`, [voterMembership.syndicate_id],
          );
          promoted = true;
        }
        return reply.send({ ok: true, votesFor, totalMembers, promoted });
      }

      // ── Кикнуть участника ─────────────────
      case 'kick_member': {
        const { targetUserId } = body as { targetUserId: string };
        const { rows: [leaderMembership] } = await pool.query(
          `SELECT sm.syndicate_id, sm.role FROM syndicate_members sm WHERE sm.user_id = $1`, [user.id],
        );
        if (!leaderMembership || leaderMembership.role !== 'leader') {
          return reply.code(403).send({ error: 'Только лидер может кикать участников' });
        }
        if (targetUserId === user.id) {
          return reply.code(400).send({ error: 'Нельзя кикнуть самого себя' });
        }
        const { rowCount } = await pool.query(
          `DELETE FROM syndicate_members WHERE user_id = $1 AND syndicate_id = $2 AND role = 'member'`,
          [targetUserId, leaderMembership.syndicate_id],
        );
        if (!rowCount) return reply.code(404).send({ error: 'Участник не найден' });
        await pool.query(`UPDATE users SET mining_mode = 'solo' WHERE id = $1`, [targetUserId]);
        return reply.send({ ok: true });
      }

      // ── Растворить синдикат ───────────────
      case 'dissolve_syndicate': {
        const { rows: [leaderMembership2] } = await pool.query(
          `SELECT sm.syndicate_id, sm.role FROM syndicate_members sm WHERE sm.user_id = $1`, [user.id],
        );
        if (!leaderMembership2 || leaderMembership2.role !== 'leader') {
          return reply.code(403).send({ error: 'Только лидер может растворить синдикат' });
        }
        const { rows: [synDiss] } = await pool.query(
          `SELECT treasury_igc FROM syndicates WHERE id = $1`, [leaderMembership2.syndicate_id],
        );
        const client4 = await pool.connect();
        try {
          await client4.query('BEGIN');
          // Сжигаем оставшуюся казну
          const treasuryIgc = parseFloat(synDiss?.treasury_igc ?? '0');
          if (treasuryIgc > 0) {
            await client4.query(`
              UPDATE pool_stats SET
                total_igc_burned = total_igc_burned + $1,
                igc_daily_demand = CASE WHEN igc_daily_date = CURRENT_DATE THEN igc_daily_demand + $1 ELSE $1 END,
                igc_daily_date   = CURRENT_DATE
              WHERE id = 1`,
              [treasuryIgc],
            );
          }
          // Все участники → solo
          const { rows: members } = await client4.query(
            `SELECT user_id FROM syndicate_members WHERE syndicate_id = $1`,
            [leaderMembership2.syndicate_id],
          );
          for (const m of members) {
            await client4.query(`UPDATE users SET mining_mode = 'solo' WHERE id = $1`, [m.user_id]);
          }
          // ON DELETE CASCADE удалит members, bonuses, votes
          await client4.query(`DELETE FROM syndicates WHERE id = $1`, [leaderMembership2.syndicate_id]);
          await client4.query('COMMIT');
          return reply.send({ ok: true });
        } catch (e) {
          await client4.query('ROLLBACK'); throw e;
        } finally { client4.release(); }
      }

      // ── Покупка инфраструктуры ─────────────
      case 'upgrade_infra': {
        const { upgradeType } = body as { upgradeType: string };
        const cost = INFRA_COSTS[upgradeType];
        if (!cost) return reply.code(400).send({ error: 'Неизвестный апгрейд' });

        // Гараж и Ангар только в Фазе 2+
        if ((upgradeType === 'farm_level_3' || upgradeType === 'farm_level_4') && currentPhase < 2) {
          const name = upgradeType === 'farm_level_3' ? 'Гараж' : 'Ангар';
          return reply.code(403).send({ error: `${name} доступен с Фазы 2` });
        }

        // Динамическая IGC-цена: применяем ratio только к IGC-апгрейдам
        const igcRatioInfra = cost.igc > 0 ? await getIgcRatio() : 1;
        const finalIgcInfra = cost.igc > 0 ? Math.ceil(cost.igc * igcRatioInfra) : 0;

        if (cost.ton > 0 && parseFloat(user.ton_balance) < cost.ton) {
          return reply.code(400).send({ error: 'Недостаточно TON' });
        }
        if (finalIgcInfra > 0 && parseFloat(user.igc_balance) < finalIgcInfra) {
          return reply.code(400).send({ error: `Недостаточно IGC. Нужно ${finalIgcInfra} IGC (×${igcRatioInfra.toFixed(2)} рынок)` });
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
          if (finalIgcInfra > 0) {
            await pool.query(
              `UPDATE users SET igc_balance = igc_balance - $1 WHERE id = $2`,
              [finalIgcInfra, user.id],
            );
            await pool.query(`
              UPDATE pool_stats SET
                total_igc_burned = total_igc_burned + $1,
                igc_daily_demand = CASE WHEN igc_daily_date = CURRENT_DATE THEN igc_daily_demand + $1 ELSE $1 END,
                igc_daily_date   = CURRENT_DATE
              WHERE id = 1`,
              [finalIgcInfra],
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

          await pool.query(
            `INSERT INTO transactions (user_id, type, amount_ton, amount_igc)
             VALUES ($1, $2, $3, $4)`,
            [user.id, `upgrade_infra:${upgradeType}`, cost.ton, finalIgcInfra],
          );
          await pool.query(`COMMIT`);
        } catch (e) {
          await pool.query(`ROLLBACK`);
          throw e;
        }

        return reply.send({ ok: true, upgraded: upgradeType });
      }

      // ── IGC → TON (продажа IGC) ────────────────
      case 'sell_igc': {
        const amountIgc: number = parseFloat(body.amount_igc ?? body.amountIgc ?? '0');
        if (amountIgc < 100) return reply.code(400).send({ error: 'Минимальная продажа: 100 IGC' });
        // Быстрая предварительная проверка до транзакции
        if (parseFloat(user.igc_balance) < amountIgc) {
          return reply.code(400).send({ error: 'Недостаточно IGC' });
        }

        const { rows: [ps] } = await pool.query(
          `SELECT total_igc_minted, reserve_pool_ton, igc_ratio_smoothed FROM pool_stats WHERE id = 1`,
        );
        const ratio        = parseFloat(ps?.igc_ratio_smoothed ?? '1');
        const pricePerIgc  = Math.max(0.00005, Math.min(0.0005, 0.0001 / Math.max(0.5, ratio)));
        const grossPayout  = parseFloat((amountIgc * pricePerIgc).toFixed(8));
        const commission   = parseFloat((grossPayout * 0.03).toFixed(8));
        const netPayout    = parseFloat((grossPayout - commission).toFixed(8));

        if (parseFloat(ps?.reserve_pool_ton ?? '0') < grossPayout) {
          return reply.code(400).send({ error: 'В пуле недостаточно TON для выкупа. Попробуй позже.' });
        }

        await pool.query('BEGIN');
        try {
          // SELECT FOR UPDATE — исключает гонку двух одновременных sell-запросов
          const { rows: [locked] } = await pool.query(
            `SELECT igc_balance FROM users WHERE id = $1 FOR UPDATE`,
            [user.id],
          );
          if (parseFloat(locked.igc_balance) < amountIgc) {
            await pool.query('ROLLBACK');
            return reply.code(400).send({ error: 'Недостаточно IGC' });
          }

          await pool.query(
            `UPDATE users SET igc_balance = igc_balance - $1, ton_balance = ton_balance + $2 WHERE id = $3`,
            [amountIgc, netPayout, user.id],
          );
          await pool.query(`
            UPDATE pool_stats SET
              reserve_pool_ton = reserve_pool_ton - $1,
              admin_earned_ton = admin_earned_ton + $2,
              total_igc_minted = total_igc_minted - $3,
              igc_daily_demand = CASE WHEN igc_daily_date = CURRENT_DATE THEN igc_daily_demand + $3 ELSE $3 END,
              igc_daily_date   = CURRENT_DATE
            WHERE id = 1`,
            [grossPayout, commission, amountIgc],
          );
          await pool.query(
            `INSERT INTO transactions (user_id, type, amount_ton, amount_igc)
             VALUES ($1, 'marketplace_sale', $2, $3)`,
            [user.id, netPayout, amountIgc],
          );
          await pool.query('COMMIT');
        } catch (e) { await pool.query('ROLLBACK'); throw e; }

        return reply.send({ ok: true, igcSold: amountIgc, tonReceived: netPayout, grossPayout, commission, pricePerIgc });
      }

      // ── TON → IGC (покупка IGC) ─────────────────
      case 'buy_igc': {
        const amountTon: number = parseFloat(body.amount_ton ?? body.amountTon ?? '0');
        if (amountTon < 0.001) return reply.code(400).send({ error: 'Минимальная покупка: 0.001 TON' });

        // Предварительная проверка (быстрый fail-fast до транзакции)
        if (parseFloat(user.ton_balance) < amountTon) {
          return reply.code(400).send({ error: 'Недостаточно TON' });
        }

        const { rows: [ps2] } = await pool.query(
          `SELECT total_igc_minted, reserve_pool_ton, igc_ratio_smoothed FROM pool_stats WHERE id = 1`,
        );
        const ratio2       = parseFloat(ps2?.igc_ratio_smoothed ?? '1');
        const pricePerIgc2 = Math.max(0.00005, Math.min(0.0005, 0.0001 / Math.max(0.5, ratio2)));
        const igcAvailable = 10_000_000_000 - parseFloat(ps2?.total_igc_minted ?? '0');
        const igcAmount    = Math.min(amountTon / pricePerIgc2, igcAvailable);

        if (igcAmount <= 0) {
          return reply.code(400).send({ error: 'IGC исчерпан — все 10 миллиардов добыты' });
        }
        const actualTonCost  = igcAmount * pricePerIgc2;
        const buyCommission  = parseFloat((actualTonCost * 0.03).toFixed(8));
        const buyToPool      = parseFloat((actualTonCost - buyCommission).toFixed(8));

        await pool.query('BEGIN');
        try {
          // SELECT FOR UPDATE — блокирует строку, исключает гонку двух одновременных запросов
          const { rows: [locked] } = await pool.query(
            `SELECT ton_balance FROM users WHERE id = $1 FOR UPDATE`,
            [user.id],
          );
          if (parseFloat(locked.ton_balance) < actualTonCost) {
            await pool.query('ROLLBACK');
            return reply.code(400).send({ error: 'Недостаточно TON' });
          }

          await pool.query(
            `UPDATE users SET ton_balance = ton_balance - $1, igc_balance = igc_balance + $2 WHERE id = $3`,
            [actualTonCost, igcAmount, user.id],
          );
          await pool.query(`
            UPDATE pool_stats SET
              reserve_pool_ton = reserve_pool_ton + $1,
              admin_earned_ton = admin_earned_ton + $2,
              total_igc_minted = total_igc_minted + $3,
              igc_daily_supply = CASE WHEN igc_daily_date = CURRENT_DATE THEN igc_daily_supply + $3 ELSE $3 END,
              igc_daily_date   = CURRENT_DATE
            WHERE id = 1`,
            [buyToPool, buyCommission, igcAmount],
          );
          await pool.query(
            `INSERT INTO transactions (user_id, type, amount_ton, amount_igc)
             VALUES ($1, 'buy_igc', $2, $3)`,
            [user.id, actualTonCost, igcAmount],
          );
          await pool.query('COMMIT');
        } catch (e) { await pool.query('ROLLBACK'); throw e; }

        return reply.send({ ok: true, igcReceived: igcAmount, tonSpent: actualTonCost, pricePerIgc: pricePerIgc2 });
      }

      // ── Апгрейды серверной (глобальные, за TON) ────────
      case 'upgrade_server_room':
      case 'upgrade_ups':
      case 'upgrade_provider': {
        const colMap: Record<string, { col: string; levels: typeof SERVER_ROOM_LEVELS }> = {
          upgrade_server_room: { col: 'server_room_level', levels: SERVER_ROOM_LEVELS as any },
          upgrade_ups:         { col: 'ups_level',         levels: UPS_LEVELS as any },
          upgrade_provider:    { col: 'provider_level',    levels: PROVIDER_LEVELS as any },
        };
        const { col, levels } = colMap[type];

        const { rows: [farm] } = await pool.query(
          `SELECT id, ${col} FROM farms WHERE user_id = $1`, [user.id],
        );
        if (!farm) return reply.code(404).send({ error: 'Ферма не найдена' });

        const currentLevel: number = farm[col] ?? 0;
        const nextDef = levels.find((l: any) => l.level === currentLevel + 1);
        if (!nextDef) return reply.code(400).send({ error: 'Максимальный уровень уже достигнут' });

        const costTon = nextDef.costTon;
        if (parseFloat(user.ton_balance) < costTon) {
          return reply.code(400).send({ error: `Недостаточно TON. Нужно ${costTon} TON` });
        }

        await pool.query('BEGIN');
        try {
          await pool.query(
            `UPDATE farms SET ${col} = $1 WHERE id = $2`, [currentLevel + 1, farm.id],
          );
          await pool.query(
            `UPDATE users SET ton_balance = ton_balance - $1 WHERE id = $2`,
            [costTon, user.id],
          );
          if (costTon > 0) {
            // 10% комиссия → admin_earned_ton (аналогично buy_gpu)
            await pool.query(
              `UPDATE pool_stats SET
                 reserve_pool_ton = reserve_pool_ton + $1,
                 admin_earned_ton = admin_earned_ton + $2
               WHERE id = 1`,
              [costTon * 0.9, costTon * 0.1],
            );
          }
          await pool.query(
            `INSERT INTO transactions (user_id, type, amount_ton, amount_igc)
             VALUES ($1, $2, $3, 0)`,
            [user.id, type, costTon],
          );
          await pool.query('COMMIT');
        } catch (e) { await pool.query('ROLLBACK'); throw e; }

        return reply.send({ ok: true, newLevel: currentLevel + 1 });
      }

      // ── Поузловые апгрейды GPU (за IGC) ────────────────
      case 'upgrade_paste':
      case 'upgrade_fan':
      case 'upgrade_liquid_cooling': {
        const gpuId = body.gpu_id;
        if (!gpuId) return reply.code(400).send({ error: 'gpu_id обязателен' });

        const gpuColMap: Record<string, { col: string; levels: typeof PASTE_LEVELS }> = {
          upgrade_paste:           { col: 'paste_level',    levels: PASTE_LEVELS          as any },
          upgrade_fan:             { col: 'fan_level',      levels: FAN_LEVELS            as any },
          upgrade_liquid_cooling:  { col: 'cooling_level',  levels: LIQUID_COOLING_LEVELS as any },
        };
        const { col: gpuCol, levels: gpuLevels } = gpuColMap[type];

        const { rows: [gpu] } = await pool.query(
          `SELECT g.id, g.${gpuCol}, f.id AS farm_id, u.igc_balance
           FROM gpus g
           JOIN farms f ON f.id = g.farm_id
           JOIN users u ON u.id = f.user_id
           WHERE g.id = $1 AND f.user_id = $2`,
          [gpuId, user.id],
        );
        if (!gpu) return reply.code(404).send({ error: 'GPU не найдена или не принадлежит вам' });

        const currentGpuLevel: number = gpu[gpuCol] ?? 0;
        const nextGpuDef = gpuLevels.find((l: any) => l.level === currentGpuLevel + 1);
        if (!nextGpuDef) return reply.code(400).send({ error: 'Максимальный уровень уже достигнут' });

        // Динамическая цена IGC × ratio рынка
        const baseIgcCost = nextGpuDef.costIgc ?? 0;
        const igcRatioUpgrade = baseIgcCost > 0 ? await getIgcRatio() : 1;
        const finalIgcUpgrade = baseIgcCost > 0 ? Math.ceil(baseIgcCost * igcRatioUpgrade) : 0;

        if (finalIgcUpgrade > 0 && parseFloat(gpu.igc_balance) < finalIgcUpgrade) {
          return reply.code(400).send({ error: `Недостаточно IGC. Нужно ${finalIgcUpgrade} IGC (×${igcRatioUpgrade.toFixed(2)} рынок)` });
        }

        await pool.query('BEGIN');
        try {
          await pool.query(
            `UPDATE gpus SET ${gpuCol} = $1 WHERE id = $2`, [currentGpuLevel + 1, gpuId],
          );
          if (finalIgcUpgrade > 0) {
            await pool.query(
              `UPDATE users SET igc_balance = igc_balance - $1 WHERE id = $2`,
              [finalIgcUpgrade, user.id],
            );
            await pool.query(`
              UPDATE pool_stats SET
                total_igc_burned = total_igc_burned + $1,
                igc_daily_demand = CASE WHEN igc_daily_date = CURRENT_DATE THEN igc_daily_demand + $1 ELSE $1 END,
                igc_daily_date   = CURRENT_DATE
              WHERE id = 1`,
              [finalIgcUpgrade],
            );
          }
          if (finalIgcUpgrade > 0) {
            await pool.query(
              `INSERT INTO transactions (user_id, type, amount_ton, amount_igc)
               VALUES ($1, $2, 0, $3)`,
              [user.id, type, finalIgcUpgrade],
            );
          }
          await pool.query('COMMIT');
        } catch (e) { await pool.query('ROLLBACK'); throw e; }

        return reply.send({ ok: true, newLevel: currentGpuLevel + 1, igcRatio: igcRatioUpgrade });
      }

      // ── Стейкинг TON ───────────────────────────────────────
      case 'stake_ton': {
        const amount = parseFloat(body.amount_ton);
        if (isNaN(amount) || amount < STAKE_MIN_TON)
          return reply.code(400).send({ error: `Минимум ${STAKE_MIN_TON} TON для стейкинга` });
        if (parseFloat(user.ton_balance) < amount)
          return reply.code(400).send({ error: 'Недостаточно TON на балансе' });

        await pool.query('BEGIN');
        try {
          // TON уходит из баланса игрока в пул и фиксируется в staked_ton
          await pool.query(
            `UPDATE users SET ton_balance = ton_balance - $1, staked_ton = staked_ton + $1 WHERE id = $2`,
            [amount, user.id],
          );
          await pool.query(
            `UPDATE pool_stats SET reserve_pool_ton = reserve_pool_ton + $1 WHERE id = 1`,
            [amount],
          );
          await pool.query(
            `INSERT INTO transactions (user_id, type, amount_ton, amount_igc)
             VALUES ($1, 'stake_ton', $2, 0)`,
            [user.id, amount],
          );
          await pool.query('COMMIT');
        } catch (e) { await pool.query('ROLLBACK'); throw e; }

        return reply.send({ ok: true, stakedTon: amount });
      }

      case 'unstake_ton': {
        const amount = parseFloat(body.amount_ton);
        if (isNaN(amount) || amount < STAKE_MIN_TON)
          return reply.code(400).send({ error: `Минимум ${STAKE_MIN_TON} TON для вывода` });

        const stakedRaw = parseFloat(user.staked_ton ?? '0');
        if (stakedRaw < amount)
          return reply.code(400).send({ error: `Застейкано только ${stakedRaw.toFixed(3)} TON` });

        // Проверяем суточный лимит вывода (1% пула)
        const { rows: [ps] } = await pool.query(
          `SELECT reserve_pool_ton, staking_daily_unstaked, staking_daily_unstake_date FROM pool_stats WHERE id = 1`,
        );
        const poolSize    = parseFloat(ps.reserve_pool_ton);
        const dailyLimit  = poolSize * STAKE_UNSTAKE_DAILY_LIMIT_PCT;
        const isToday     = ps.staking_daily_unstake_date
          ? new Date(ps.staking_daily_unstake_date).toDateString() === new Date().toDateString()
          : false;
        const alreadyOut  = isToday ? parseFloat(ps.staking_daily_unstaked ?? '0') : 0;
        const remaining   = Math.max(0, dailyLimit - alreadyOut);

        if (amount > remaining) {
          return reply.code(400).send({
            error: `Лимит вывода исчерпан. Осталось: ${remaining.toFixed(3)} TON сегодня (лимит ${dailyLimit.toFixed(3)} TON = 1% пула)`,
          });
        }

        await pool.query('BEGIN');
        try {
          await pool.query(
            `UPDATE users SET ton_balance = ton_balance + $1, staked_ton = staked_ton - $1 WHERE id = $2`,
            [amount, user.id],
          );
          await pool.query(`
            UPDATE pool_stats SET
              reserve_pool_ton = reserve_pool_ton - $1,
              staking_daily_unstaked = CASE
                WHEN staking_daily_unstake_date = CURRENT_DATE THEN staking_daily_unstaked + $1
                ELSE $1 END,
              staking_daily_unstake_date = CURRENT_DATE
            WHERE id = 1`, [amount],
          );
          await pool.query(
            `INSERT INTO transactions (user_id, type, amount_ton, amount_igc)
             VALUES ($1, 'unstake_ton', $2, 0)`,
            [user.id, amount],
          );
          await pool.query('COMMIT');
        } catch (e) { await pool.query('ROLLBACK'); throw e; }

        return reply.send({ ok: true, unstakedTon: amount });
      }

      // ── Сбор бонуса Удача майнера ────────────────────────
      case 'claim_lucky_miner': {
        const { rows: [ev] } = await pool.query(
          `SELECT id, active_until FROM system_events WHERE type = 'lucky_miner' AND active_until > NOW() LIMIT 1`,
        );
        if (!ev) return reply.code(400).send({ error: 'Нет активного события Удача майнера' });
        const alreadyActive = await redis.exists(`lucky_active:${user.id}`);
        if (alreadyActive) return reply.code(400).send({ error: 'Бонус уже активен' });
        await redis.set(`lucky_active:${user.id}`, '1', 'EX', 3600);
        console.log(`[Lucky] ⚡ ${user.id} забрал бонус (+50% IGC на 1ч)`);
        return reply.send({ ok: true, bonusSeconds: 3600 });
      }

      // ── Покупка инфраструктуры (прямой вызов) ─
      default: {
        // Фронтенд может слать тип апгрейда напрямую: 'farm_level_2', 'cooling_1' и т.д.
        if (INFRA_COSTS[type]) {
          body.upgradeType = type;
          body.type = 'upgrade_infra';
          // fall through to upgrade_infra via recursive re-dispatch would be complex,
          // so we inline the logic here:
          const cost = INFRA_COSTS[type];
          const upgradeType = type;

          if ((upgradeType === 'farm_level_3' || upgradeType === 'farm_level_4') && currentPhase < 2) {
            const name = upgradeType === 'farm_level_3' ? 'Гараж' : 'Ангар';
            return reply.code(403).send({ error: `${name} доступен с Фазы 2` });
          }

          // Динамическая IGC-цена
          const igcRatioDefault = cost.igc > 0 ? await getIgcRatio() : 1;
          const finalIgcDefault = cost.igc > 0 ? Math.ceil(cost.igc * igcRatioDefault) : 0;

          if (cost.ton > 0 && parseFloat(user.ton_balance) < cost.ton) {
            return reply.code(400).send({ error: 'Недостаточно TON' });
          }
          if (finalIgcDefault > 0 && parseFloat(user.igc_balance) < finalIgcDefault) {
            return reply.code(400).send({ error: `Недостаточно IGC. Нужно ${finalIgcDefault} IGC (×${igcRatioDefault.toFixed(2)} рынок)` });
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
            if (finalIgcDefault > 0) {
              await pool.query(
                `UPDATE users SET igc_balance = igc_balance - $1 WHERE id = $2`,
                [finalIgcDefault, user.id],
              );
              await pool.query(`
                UPDATE pool_stats SET
                  total_igc_burned = total_igc_burned + $1,
                  igc_daily_demand = CASE WHEN igc_daily_date = CURRENT_DATE THEN igc_daily_demand + $1 ELSE $1 END,
                  igc_daily_date   = CURRENT_DATE
                WHERE id = 1`,
                [finalIgcDefault],
              );
            }
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
            await pool.query(
              `INSERT INTO transactions (user_id, type, amount_ton, amount_igc)
               VALUES ($1, $2, $3, $4)`,
              [user.id, `upgrade_infra:${upgradeType}`, cost.ton, finalIgcDefault],
            );
            await pool.query(`COMMIT`);
          } catch (e) {
            await pool.query(`ROLLBACK`);
            throw e;
          }
          return reply.send({ ok: true, upgraded: upgradeType });
        }

        return reply.code(400).send({ error: `Неизвестный тип действия: ${type}` });
      }
    }
  });
}

// Вычисляет уровень синдиката из накопленного XP
function calcSyndicateLevel(xp: number): number {
  let level = 1;
  let remaining = xp;
  for (let i = 0; i < SYNDICATE_LEVEL_XP_COSTS.length; i++) {
    if (remaining >= SYNDICATE_LEVEL_XP_COSTS[i]) {
      remaining -= SYNDICATE_LEVEL_XP_COSTS[i];
      level++;
    } else break;
    if (level >= 50) break;
  }
  return Math.min(level, 50);
}

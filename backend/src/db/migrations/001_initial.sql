-- ═══════════════════════════════════════════════════════════
-- 001_initial.sql
-- GameFi TON Mining Simulator — начальная схема БД
-- PostgreSQL 15+
-- Утверждена в Фазе 0. Не редактировать напрямую в prod.
-- Все изменения — через новые миграции (002_, 003_, ...)
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- ── Расширения ───────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- ════════════════════════════════════════════════════════
-- 1. USERS
-- ════════════════════════════════════════════════════════
CREATE TABLE users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_user_id      BIGINT      NOT NULL UNIQUE,       -- Telegram user.id
  tg_username     TEXT,                              -- @username (может меняться)
  ton_balance     NUMERIC(18,8) NOT NULL DEFAULT 0,  -- баланс TON
  igc_balance     NUMERIC(18,4) NOT NULL DEFAULT 0,  -- баланс IGC
  inviter_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
  whitelist_asic  BOOLEAN     NOT NULL DEFAULT FALSE, -- доступ к покупке ASIC в Фазе 1
  mining_mode     TEXT        NOT NULL DEFAULT 'pool'
                  CHECK (mining_mode IN ('pool', 'solo')),
  -- Анти-кит: счётчик трат в сутки (Фаза 1, лимит 30 TON)
  daily_spend_ton NUMERIC(18,8) NOT NULL DEFAULT 0,
  last_spend_reset TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_tg_user_id ON users(tg_user_id);
CREATE INDEX idx_users_inviter_id ON users(inviter_id);

COMMENT ON COLUMN users.whitelist_asic IS
  'TRUE = разрешено покупать ASIC в Фазе 1 (max 2 шт). В Фазе 2+ не нужен.';
COMMENT ON COLUMN users.daily_spend_ton IS
  'Сбрасывается в 00:00 UTC. Лимит 30 TON активен только в Фазе 1.';

-- ════════════════════════════════════════════════════════
-- 2. REFERRALS (двухуровневая сеть «Управляющей компании»)
-- ════════════════════════════════════════════════════════
CREATE TABLE referrals (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level       SMALLINT    NOT NULL CHECK (level IN (1, 2)),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (inviter_id, invitee_id) -- один реферал — одна связь
);

CREATE INDEX idx_referrals_inviter ON referrals(inviter_id, level);
CREATE INDEX idx_referrals_invitee ON referrals(invitee_id);

-- ════════════════════════════════════════════════════════
-- 3. FARMS (помещения / уровни инфраструктуры)
-- ════════════════════════════════════════════════════════
CREATE TABLE farms (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  level           SMALLINT    NOT NULL DEFAULT 1    -- 0=Стол, 1=Балкон, 2=Кладовка, 3=Гараж, 4=Ангар
                  CHECK (level BETWEEN 0 AND 4),
  cooling_level   SMALLINT    NOT NULL DEFAULT 0    -- 0=нет, 1=вентилятор, 2=кондей, 3=пром.вытяжка
                  CHECK (cooling_level BETWEEN 0 AND 3),
  workbench_level SMALLINT    NOT NULL DEFAULT 0    -- 0=нет верстака, 1=базовый, 2=паяльная, 3=сервисный
                  CHECK (workbench_level BETWEEN 0 AND 3),
  mining_mode     TEXT        NOT NULL DEFAULT 'pool'
                  CHECK (mining_mode IN ('pool', 'solo')),
  -- Слоты: макс. устройств для текущего level (проверяется на backend)
  max_slots       SMALLINT    NOT NULL DEFAULT 5,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_farms_user_id ON farms(user_id);

COMMENT ON COLUMN farms.level IS
  '0=Стол(1), 1=Балкон(5), 2=Кладовка(10), 3=Гараж(20), 4=Ангар(50 слотов)';
COMMENT ON COLUMN farms.workbench_level IS
  '0=нет ремонта; 1=T1-T2; 2=T3-T4; 3=T5-T6 (ASIC)';

-- ════════════════════════════════════════════════════════
-- 4. GPUS (оборудование в слотах фермы)
-- ════════════════════════════════════════════════════════
CREATE TABLE gpus (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id         UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_tier      SMALLINT    NOT NULL CHECK (model_tier BETWEEN 0 AND 6),
  health          NUMERIC(5,2) NOT NULL DEFAULT 100
                  CHECK (health BETWEEN 0 AND 100),
  status          TEXT        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'broken', 'offline')),
  overclocked     BOOLEAN     NOT NULL DEFAULT FALSE,
  is_refurbished  BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Покупка за TON (нужна для маркетплейса и истории)
  purchase_price_ton NUMERIC(18,8) NOT NULL DEFAULT 0,
  purchased_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gpus_farm_id   ON gpus(farm_id);
CREATE INDEX idx_gpus_user_id   ON gpus(user_id);
CREATE INDEX idx_gpus_status    ON gpus(status);
CREATE INDEX idx_gpus_model_tier ON gpus(model_tier);

COMMENT ON COLUMN gpus.model_tier IS
  '0=USB Nano, 1=RX580, 2=GTX1660S, 3=RTX3070, 4=RTX4090, 5=Antminer S19, 6=X1 (Фаза2+)';
COMMENT ON COLUMN gpus.is_refurbished IS
  'TRUE = куплен/продан после Refurbish. Износ ×1.1 быстрее нового.';

-- ════════════════════════════════════════════════════════
-- 5. POOL_STATS (глобальное состояние экономики)
-- ════════════════════════════════════════════════════════
CREATE TABLE pool_stats (
  id                SMALLINT    PRIMARY KEY DEFAULT 1     -- всегда одна строка
                    CHECK (id = 1),
  reserve_pool_ton  NUMERIC(18,8) NOT NULL DEFAULT 100,  -- стартовый пул
  drip_rate         NUMERIC(6,4) NOT NULL DEFAULT 0.04,  -- текущая ставка (Фаза 1 = 4%)
  current_phase     SMALLINT    NOT NULL DEFAULT 1
                    CHECK (current_phase BETWEEN 1 AND 4),
  total_paid_out    NUMERIC(18,8) NOT NULL DEFAULT 0,    -- суммарно выплачено (для халвинга)
  admin_earned_ton  NUMERIC(18,8) NOT NULL DEFAULT 0,    -- прибыль разработчика
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Единственная строка состояния
INSERT INTO pool_stats (id, reserve_pool_ton, drip_rate, current_phase, total_paid_out, admin_earned_ton)
VALUES (1, 100.0, 0.04, 1, 0.0, 0.0);

COMMENT ON TABLE pool_stats IS
  'Singleton-таблица. Обновляется транзакционно в конце каждой эпохи.';
COMMENT ON COLUMN pool_stats.drip_rate IS
  'Фаза1=0.04 (2k TON), Фаза2=0.02 (8k), Фаза3=0.01 (30k), Фаза4=0.005 (∞)';

-- ════════════════════════════════════════════════════════
-- 6. EPOCH_LOG (история всех эпох для аналитики)
-- ════════════════════════════════════════════════════════
CREATE TABLE epoch_log (
  id                  BIGSERIAL   PRIMARY KEY,
  epoch_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  global_hashrate     NUMERIC(18,4) NOT NULL DEFAULT 0,
  reward_distributed  NUMERIC(18,8) NOT NULL DEFAULT 0,
  pool_after          NUMERIC(18,8) NOT NULL DEFAULT 0,
  phase               SMALLINT    NOT NULL,
  active_miner_count  INTEGER     NOT NULL DEFAULT 0,
  solo_winner_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
  halving_triggered   BOOLEAN     NOT NULL DEFAULT FALSE,
  errors              TEXT[]      NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_epoch_log_at    ON epoch_log(epoch_at DESC);
CREATE INDEX idx_epoch_log_phase ON epoch_log(phase);

-- ════════════════════════════════════════════════════════
-- 7. TRANSACTIONS (все финансовые операции)
-- ════════════════════════════════════════════════════════
CREATE TABLE transactions (
  id            BIGSERIAL   PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT        NOT NULL CHECK (type IN (
                  'epoch_reward',     -- начисление за эпоху (pool)
                  'solo_reward',      -- начисление соло-победителю
                  'referral_igc',     -- реферальный IGC-бонус
                  'electricity',      -- списание за свет (IGC)
                  'purchase',         -- покупка оборудования (TON)
                  'infrastructure',   -- покупка помещения/верстака (TON/IGC)
                  'marketplace_sale', -- продажа на барахолке (TON)
                  'marketplace_buy',  -- покупка на барахолке (TON)
                  'marketplace_fee',  -- комиссия платформы (TON)
                  'refurbish',        -- восстановление карты (IGC)
                  'withdrawal',       -- вывод TON на внешний кошелёк
                  'deposit'           -- пополнение TON (смарт-контракт)
                )),
  amount_ton    NUMERIC(18,8) NOT NULL DEFAULT 0,
  amount_igc    NUMERIC(18,4) NOT NULL DEFAULT 0,
  ref_id        UUID,          -- связанный GPU/лот/эпоха (опционально)
  epoch_log_id  BIGINT        REFERENCES epoch_log(id) ON DELETE SET NULL,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_user_id    ON transactions(user_id, created_at DESC);
CREATE INDEX idx_transactions_type       ON transactions(type);
CREATE INDEX idx_transactions_epoch      ON transactions(epoch_log_id);

-- ════════════════════════════════════════════════════════
-- 8. MARKETPLACE (P2P барахолка)
-- ════════════════════════════════════════════════════════
CREATE TABLE marketplace (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gpu_id          UUID        NOT NULL REFERENCES gpus(id) ON DELETE CASCADE,
  -- Снапшот характеристик на момент листинга (GPU может быть обновлён после)
  model_tier      SMALLINT    NOT NULL,
  health_snapshot NUMERIC(5,2) NOT NULL,
  is_refurbished  BOOLEAN     NOT NULL DEFAULT FALSE,
  price_ton       NUMERIC(18,8) NOT NULL CHECK (price_ton > 0),
  -- Ценовой коридор ±20% (заполняется backend при создании лота)
  price_min_ton   NUMERIC(18,8) NOT NULL,
  price_max_ton   NUMERIC(18,8) NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'sold', 'cancelled', 'expired')),
  buyer_id        UUID        REFERENCES users(id) ON DELETE SET NULL,
  sold_at         TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplace_status     ON marketplace(status, created_at DESC);
CREATE INDEX idx_marketplace_model_tier ON marketplace(model_tier, status);
CREATE INDEX idx_marketplace_seller     ON marketplace(seller_id);
CREATE INDEX idx_marketplace_expires    ON marketplace(expires_at) WHERE status = 'open';

COMMENT ON COLUMN marketplace.price_min_ton IS
  'Минимальная допустимая цена (−20% от рыночной). Проверяется на backend.';
COMMENT ON COLUMN marketplace.price_max_ton IS
  'Максимальная допустимая цена (+20% от рыночной). Защита от отмывания.';
COMMENT ON COLUMN marketplace.expires_at IS
  '72 часа — если никто не купил, лот истекает и GPU возвращается продавцу.';

-- ════════════════════════════════════════════════════════
-- Тригеры: auto-updated_at
-- ════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_farms_updated_at
  BEFORE UPDATE ON farms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_gpus_updated_at
  BEFORE UPDATE ON gpus
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════
-- Начальные данные: pool_stats уже вставлены выше (100 TON)
-- ════════════════════════════════════════════════════════

COMMIT;

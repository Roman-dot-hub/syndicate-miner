-- ═══════════════════════════════════════════════════════════
-- 002_monitoring.sql
-- Таблицы для IGC-мониторинга, системных событий и buyback
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Лог IGC-баланса (каждая эпоха) ────────────────────
CREATE TABLE igc_monitor_log (
  id                BIGSERIAL    PRIMARY KEY,
  logged_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  epoch_supply      NUMERIC(18,4) NOT NULL DEFAULT 0,   -- IGC добыто за эпоху
  epoch_demand      NUMERIC(18,4) NOT NULL DEFAULT 0,   -- IGC потреблено за эпоху
  daily_ratio       NUMERIC(8,4) NOT NULL DEFAULT 1,    -- supply/demand за сутки
  status            TEXT         NOT NULL DEFAULT 'healthy'
                    CHECK (status IN (
                      'healthy', 'mild_surplus', 'mild_deficit',
                      'critical_surplus', 'critical_deficit'
                    )),
  action_taken      TEXT,                               -- описание принятой меры
  admin_buyback_ton NUMERIC(18,8) NOT NULL DEFAULT 0    -- TON потрачено на buyback
);

CREATE INDEX idx_igc_monitor_at     ON igc_monitor_log(logged_at DESC);
CREATE INDEX idx_igc_monitor_status ON igc_monitor_log(status, logged_at DESC);

-- ── 2. Системные события (скидки, буст, burn) ────────────
-- Singleton-строки по type: только одно активное событие каждого типа
CREATE TABLE system_events (
  type          TEXT         PRIMARY KEY,   -- 'emergency_burn', 'refurbish_discount', etc.
  payload       JSONB        NOT NULL DEFAULT '{}',
  active_until  TIMESTAMPTZ  NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO system_events (type, payload, active_until) VALUES
  ('seasonal_cycle', '{"cycle_day": 1, "season": "spring"}', NOW() + INTERVAL '100 years')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE system_events IS
  'Активные глобальные модификаторы. Backend читает их при каждой эпохе.
   Устаревшие строки (active_until < NOW()) игнорируются.';

-- ── 3. IGC Buyback-ордера ─────────────────────────────────
CREATE TABLE igc_buyback_orders (
  id              BIGSERIAL    PRIMARY KEY,
  ton_allocated   NUMERIC(18,8) NOT NULL,    -- TON зарезервировано
  igc_target      NUMERIC(18,4) NOT NULL,    -- сколько IGC планируем купить
  igc_bought      NUMERIC(18,4) NOT NULL DEFAULT 0,
  price_per_igc   NUMERIC(18,8) NOT NULL,    -- IGC_FLOOR_TON = 0.0001
  status          TEXT         NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'filled', 'cancelled')),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ
);

CREATE INDEX idx_buyback_status ON igc_buyback_orders(status, created_at DESC);

-- ── 4. Сезонный цикл: хранение дня цикла ─────────────────
-- Обновляется кроном раз в сутки в 00:00 UTC
ALTER TABLE pool_stats
  ADD COLUMN IF NOT EXISTS cycle_day     SMALLINT NOT NULL DEFAULT 1
                                         CHECK (cycle_day BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS season        TEXT     NOT NULL DEFAULT 'spring'
                                         CHECK (season IN ('spring','summer','autumn','winter'));

COMMENT ON COLUMN pool_stats.cycle_day IS
  'День 28-дневного сезонного цикла. 1-7=весна, 8-14=лето, 15-21=осень, 22-28=зима.';

COMMIT;

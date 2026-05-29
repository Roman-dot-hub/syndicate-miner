-- ─────────────────────────────────────────────
-- 012_igc_daily_accumulators.sql
--
-- Добавляет в pool_stats атомарные дневные накопители
-- IGC supply/demand для расчёта рыночного индекса (EMA).
--
-- Заменяет Redis-ключи igc:daily:supply / igc:daily:demand,
-- которые Railway сбрасывает при рестарте сервиса.
--
-- igc_daily_date — дата текущего дня накопления.
-- При смене даты epochRunner сбрасывает supply/demand через
-- CASE WHEN igc_daily_date = CURRENT_DATE THEN ... ELSE $1 END.
-- ─────────────────────────────────────────────

ALTER TABLE pool_stats
  ADD COLUMN IF NOT EXISTS igc_daily_supply NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igc_daily_demand NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igc_daily_date   DATE    NOT NULL DEFAULT CURRENT_DATE;

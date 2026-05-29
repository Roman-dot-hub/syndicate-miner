-- 007_backfill_igc_supply.sql
--
-- 1. Добавляет сглаженный ratio (EMA) в pool_stats для плавного отображения индекса рынка.
-- 2. Заполняет total_igc_minted реальными данными из базы:
--    все IGC что сейчас на балансах пользователей — уже добытые, но ранее не учтённые.

-- Шаг 1: добавляем колонку для EMA-значения ratio
ALTER TABLE pool_stats
  ADD COLUMN IF NOT EXISTS igc_ratio_smoothed NUMERIC NOT NULL DEFAULT 1.0;

-- Шаг 2: backfill — берём всё IGC что сейчас держат пользователи
-- (total_igc_burned пока = 0, поэтому minted = sum(balances))
UPDATE pool_stats
SET total_igc_minted = (
  SELECT COALESCE(SUM(igc_balance), 0) FROM users
)
WHERE id = 1;

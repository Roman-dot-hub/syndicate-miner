-- ─────────────────────────────────────────────
-- 010_liquid_cooling.sql
-- Жидкостное охлаждение: 3 уровня, per-GPU, за IGC
-- cooling_level на GPU теперь = жидкостное охлаждение (1–3)
-- ─────────────────────────────────────────────

-- Нормализуем 0 → 1 (старые GPU до введения уровней)
UPDATE gpus SET cooling_level = 1 WHERE cooling_level = 0 OR cooling_level IS NULL;

-- Убеждаемся что колонка есть и дефолт правильный
ALTER TABLE gpus ALTER COLUMN cooling_level SET DEFAULT 1;

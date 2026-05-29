-- ─────────────────────────────────────────────
-- 009_server_upgrades.sql
-- Спринт 2: апгрейды серверной + поузловые апгрейды GPU
-- ─────────────────────────────────────────────

-- Инфраструктура фермы (глобальные апгрейды — влияют на все GPU)
ALTER TABLE farms
  ADD COLUMN IF NOT EXISTS server_room_level INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ups_level         INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS provider_level    INT NOT NULL DEFAULT 1;

-- Поузловые апгрейды GPU (влияют на конкретный GPU)
ALTER TABLE gpus
  ADD COLUMN IF NOT EXISTS paste_level INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fan_level   INT NOT NULL DEFAULT 1;

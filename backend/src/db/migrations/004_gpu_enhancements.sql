-- 004: GPU enhancements — undervolting flag + stored status support
ALTER TABLE gpus ADD COLUMN IF NOT EXISTS undervolted BOOLEAN NOT NULL DEFAULT FALSE;

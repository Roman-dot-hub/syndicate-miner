-- ─────────────────────────────────────────────
-- 011_user_daily_earnings.sql
--
-- Таблица для хранения дневного заработка пользователей.
-- Источник правды для истории заработка на экране Стата.
-- Пишется в той же транзакции что и creditUser в epochRunner.
-- Не зависит от Redis (который Railway сбрасывает при рестарте).
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_daily_earnings (
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       DATE        NOT NULL DEFAULT CURRENT_DATE,
  ton_earned NUMERIC(20,8) NOT NULL DEFAULT 0,
  igc_earned NUMERIC(20,4) NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ude_user_date ON user_daily_earnings(user_id, date DESC);

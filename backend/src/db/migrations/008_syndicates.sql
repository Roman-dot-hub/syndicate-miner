-- ─────────────────────────────────────────────
-- 008_syndicates.sql
-- Система синдикатов: таблицы + дефолт solo-режима
-- ─────────────────────────────────────────────

-- Новые игроки стартуют в Solo, Pool требует синдиката
ALTER TABLE users ALTER COLUMN mining_mode SET DEFAULT 'solo';

-- Основная таблица синдикатов
CREATE TABLE syndicates (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL UNIQUE,
  leader_id     UUID        NOT NULL REFERENCES users(id),
  level         INT         NOT NULL DEFAULT 1,
  xp            NUMERIC     NOT NULL DEFAULT 0,
  treasury_igc  NUMERIC     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Участники (каждый пользователь — в одном синдикате максимум)
CREATE TABLE syndicate_members (
  syndicate_id  UUID NOT NULL REFERENCES syndicates(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'member')),
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (syndicate_id, user_id)
);
-- Один пользователь — один синдикат
CREATE UNIQUE INDEX syndicate_members_user_unique ON syndicate_members(user_id);

-- Активные купленные бонусы (временные)
CREATE TABLE syndicate_bonuses (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  syndicate_id  UUID        NOT NULL REFERENCES syndicates(id) ON DELETE CASCADE,
  type          TEXT        NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Голосование за смену лидера (один голос на пользователя)
CREATE TABLE syndicate_votes (
  syndicate_id  UUID        NOT NULL REFERENCES syndicates(id) ON DELETE CASCADE,
  candidate_id  UUID        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  voter_id      UUID        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (syndicate_id, voter_id)
);

CREATE INDEX idx_syndicate_members_sid ON syndicate_members(syndicate_id);
CREATE INDEX idx_syndicate_bonuses_sid ON syndicate_bonuses(syndicate_id, expires_at);
CREATE INDEX idx_syndicate_votes_sid   ON syndicate_votes(syndicate_id, candidate_id);

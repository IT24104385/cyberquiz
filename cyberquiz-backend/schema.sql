-- CyberQuiz schema (PostgreSQL).
-- All queries in the app layer are parameterised ($1, $2, …); no string
-- interpolation ever touches these tables.

CREATE TABLE IF NOT EXISTS users (
  id               SERIAL PRIMARY KEY,
  provider         TEXT    NOT NULL,            -- 'google' | 'facebook' | 'dev'
  provider_id      TEXT    NOT NULL,            -- stable id from the provider
  email            TEXT,
  display_name     TEXT    NOT NULL,
  username         TEXT,                         -- chosen at onboarding (NULL until then)
  username_lower   TEXT,                         -- lowercased, for uniqueness
  avatar_color     INTEGER NOT NULL DEFAULT 0,
  avatar_url       TEXT,                         -- a data: URL (base64) when a photo is set
  created_at       BIGINT  NOT NULL,
  last_name_change BIGINT,                        -- ms epoch of last display-name change
  UNIQUE (provider, provider_id),
  UNIQUE (username_lower)
);

CREATE TABLE IF NOT EXISTS quizzes (
  id           SERIAL PRIMARY KEY,
  title        TEXT    NOT NULL,
  description  TEXT    NOT NULL DEFAULT '',
  category     TEXT    NOT NULL DEFAULT 'General',
  time_limit   INTEGER NOT NULL,                 -- seconds
  creator_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  creator_name TEXT    NOT NULL,                 -- denormalised @handle for display
  questions    JSONB   NOT NULL,                 -- array incl. correct indices (server-only)
  created_at   BIGINT  NOT NULL
);

CREATE TABLE IF NOT EXISTS scores (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_id     INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  correct     INTEGER NOT NULL,
  total       INTEGER NOT NULL,
  points      INTEGER NOT NULL,
  percentage  INTEGER NOT NULL,
  time_taken  INTEGER NOT NULL,
  timed_out   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  BIGINT  NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scores_user ON scores(user_id);
CREATE INDEX IF NOT EXISTS idx_scores_quiz ON scores(quiz_id);

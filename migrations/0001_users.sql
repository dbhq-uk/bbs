-- Users, their credentials, and their place in the security model.
--
-- handle_lower and email_lower exist so uniqueness is case-insensitive
-- without relying on a collation. Nobody should be able to register as
-- "Dan" while "dan" exists, and nobody should hold two accounts that
-- differ only in the case of an email address.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  handle        TEXT NOT NULL,
  handle_lower  TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL,
  email_lower   TEXT NOT NULL UNIQUE,
  pw_hash       TEXT NOT NULL,
  sl            INTEGER NOT NULL DEFAULT 10,
  flags         TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  last_on       INTEGER,
  calls         INTEGER NOT NULL DEFAULT 0
);

-- Confirmation and reset tokens.
--
-- The token itself is NEVER stored, only its SHA-256, so a leak of this
-- table hands over nothing usable.
CREATE TABLE IF NOT EXISTS tokens (
  hash       TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  kind       TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);
CREATE INDEX IF NOT EXISTS tokens_user ON tokens(user_id, kind);

-- The curated list a guest may reach through the gateway. This is the
-- allowlist spec 1 rejected for members, returning where it belongs.
CREATE TABLE IF NOT EXISTS sites (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  url  TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

INSERT INTO sites (name, url, sort) VALUES
  ('Wikipedia',            'https://en.wikipedia.org/',          10),
  ('BBC News',             'https://www.bbc.co.uk/news',         20),
  ('Hacker News',          'https://news.ycombinator.com/',      30),
  ('GOV.UK',               'https://www.gov.uk/',                40),
  ('textfiles.com',        'http://www.textfiles.com/',          50),
  ('The ANSI Art Archive', 'http://artscene.textfiles.com/ansi/', 60),
  ('DBHQ',                 'https://dbhq.uk/',                   70);

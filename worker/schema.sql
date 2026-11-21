-- PS Plus Catalogue Sorter: everything the server keeps.
-- uid        SHA-256 of the username (with a fixed prefix), computed in the browser
-- auth_hash  SHA-256 of a login token the browser derives from the password
-- ct, iv     the account's data, encrypted in the browser with AES-GCM
-- No names, emails or IP addresses are stored.
CREATE TABLE IF NOT EXISTS users (
  uid        TEXT PRIMARY KEY,
  auth_hash  TEXT NOT NULL,
  ct         TEXT,
  iv         TEXT,
  ver        INTEGER NOT NULL DEFAULT 0,
  created    INTEGER,
  updated    INTEGER,
  fails      INTEGER NOT NULL DEFAULT 0,
  lock_until INTEGER NOT NULL DEFAULT 0
);

-- A daily count of new accounts, used only to cap sign-ups. Rows older than a week are deleted.
CREATE TABLE IF NOT EXISTS signups (
  day TEXT PRIMARY KEY,
  n   INTEGER NOT NULL
);

-- Community scores, only for people who opt in. One row per game they've marked or rated.
-- vid is SHA-256 of a fixed prefix and the account id, so this table holds no account ids.
-- Published only as totals per game, and only for games with at least 3 voters.
CREATE TABLE IF NOT EXISTS votes (
  vid     TEXT NOT NULL,
  game    TEXT NOT NULL,
  mark    TEXT,
  stars   INTEGER,
  updated INTEGER,
  PRIMARY KEY (vid, game)
);
CREATE INDEX IF NOT EXISTS votes_game ON votes (game);

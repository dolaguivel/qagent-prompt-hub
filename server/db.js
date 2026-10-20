'use strict';
/*
 * SQLite storage using Node's built-in driver (node:sqlite, Node 22.13+).
 * Schema changes are applied in order through PRAGMA user_version.
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const MIGRATIONS = [
  // 1: initial schema
  `
  CREATE TABLE users (
    id             INTEGER PRIMARY KEY,
    email          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    name           TEXT    NOT NULL,
    role           TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
    team           TEXT,
    area           TEXT,
    system         TEXT,
    password_hash  TEXT    NOT NULL,
    must_change    INTEGER NOT NULL DEFAULT 1,
    active         INTEGER NOT NULL DEFAULT 1,
    created_at     INTEGER NOT NULL,
    created_day    TEXT    NOT NULL,
    last_login_at  INTEGER,
    last_seen_at   INTEGER
  );

  CREATE TABLE auth_sessions (
    token_hash    TEXT PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at    INTEGER NOT NULL,
    expires_at    INTEGER NOT NULL,
    last_used_at  INTEGER NOT NULL
  );
  CREATE INDEX auth_sessions_user ON auth_sessions(user_id);

  CREATE TABLE favorites (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prompt_id  TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, prompt_id)
  );

  CREATE TABLE ratings (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prompt_id  TEXT    NOT NULL,
    stars      INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
    comment    TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_day TEXT   NOT NULL,
    PRIMARY KEY (user_id, prompt_id)
  );
  CREATE INDEX ratings_prompt ON ratings(prompt_id);

  CREATE TABLE custom_prompts (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX custom_prompts_user ON custom_prompts(user_id);

  -- One row per tracked action. Team, area and platform are copied at the
  -- time of the event so reports stay correct if a person changes team.
  CREATE TABLE events (
    id        INTEGER PRIMARY KEY,
    ts        INTEGER NOT NULL,
    day       TEXT    NOT NULL,
    hour      INTEGER NOT NULL,
    dow       INTEGER NOT NULL,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type      TEXT    NOT NULL,
    prompt_id TEXT,
    category  TEXT,
    stage     TEXT,
    platform  TEXT,
    team      TEXT,
    area      TEXT,
    meta      TEXT
  );
  CREATE INDEX events_day    ON events(day);
  CREATE INDEX events_user   ON events(user_id, day);
  CREATE INDEX events_prompt ON events(prompt_id, type);

  -- One row per browser tab visit; active_seconds grows while the tab is visible.
  CREATE TABLE visits (
    id             TEXT PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day            TEXT    NOT NULL,
    started_at     INTEGER NOT NULL,
    last_seen_at   INTEGER NOT NULL,
    active_seconds INTEGER NOT NULL DEFAULT 0,
    team           TEXT,
    area           TEXT,
    system         TEXT
  );
  CREATE INDEX visits_day ON visits(day);
  `
];

function open(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  // WAL is fastest on a local disk. On network storage (Azure App Service /home,
  // file shares) set SQLITE_JOURNAL_MODE=DELETE, because WAL needs shared memory.
  const journal = String(process.env.SQLITE_JOURNAL_MODE || 'WAL').toUpperCase();
  if (!['WAL', 'DELETE', 'TRUNCATE'].includes(journal)) throw new Error('SQLITE_JOURNAL_MODE must be WAL, DELETE or TRUNCATE');
  db.exec(`PRAGMA journal_mode = ${journal}; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;`);

  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return db;
}

function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { open, transaction };

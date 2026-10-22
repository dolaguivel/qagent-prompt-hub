'use strict';
/*
 * Database layer with two interchangeable engines:
 *
 *   SQLite      a single file; for a company server or a PC. Uses Node's
 *               built-in driver (node:sqlite), nothing to install.
 *   PostgreSQL  for Vercel and other serverless or multi-instance hosts
 *               (Neon, Supabase, Azure Database for PostgreSQL...). Selected
 *               automatically when DATABASE_URL (or POSTGRES_URL) is set.
 *
 * Every query in the app is written once, with "?" placeholders and SQL that
 * both engines understand; the adapter converts placeholders for Postgres.
 * All methods return promises: get(sql, params), all(sql, params),
 * run(sql, params) -> { changes }, exec(sql).
 */
const fs = require('node:fs');
const path = require('node:path');

/* Schema, written for SQLite. toPostgres() adapts the few differences. */
const MIGRATIONS = [
  // 1: accounts, favorites, ratings, personal prompts, activity
  `
  CREATE TABLE users (
    id             INTEGER PRIMARY KEY,
    email          TEXT    NOT NULL UNIQUE,
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
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prompt_id   TEXT    NOT NULL,
    stars       INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
    comment     TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    updated_day TEXT    NOT NULL,
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
  -- One row per browser tab visit; active_seconds grows while the tab is in use.
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
  `,
  // 2: people for ticket comments, and per-user preferences
  `
  -- owner_id NULL = team directory (managed by the admin); otherwise personal.
  CREATE TABLE contacts (
    id         INTEGER PRIMARY KEY,
    owner_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    email      TEXT,
    role       TEXT,
    created_by INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX contacts_owner ON contacts(owner_id);
  CREATE TABLE user_prefs (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pref_key   TEXT    NOT NULL,
    data       TEXT    NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, pref_key)
  );
  CREATE INDEX events_type_day ON events(type, day);
  `
];

function toPostgres(sql) {
  return sql
    .replace(/INTEGER PRIMARY KEY/g, 'BIGSERIAL PRIMARY KEY')
    .replace(/\bINTEGER\b/g, 'BIGINT');
}

/* Splits a migration into statements (no semicolons inside our DDL strings). */
function statements(sql) {
  return sql.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* SQLite                                                              */
/* ------------------------------------------------------------------ */
function openSqliteSync(dbPath, journalMode) {
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  // WAL is fastest on a local disk. On network storage (Azure App Service /home,
  // file shares) set SQLITE_JOURNAL_MODE=DELETE, because WAL needs shared memory.
  const journal = String(journalMode || 'WAL').toUpperCase();
  if (!['WAL', 'DELETE', 'TRUNCATE'].includes(journal)) throw new Error('SQLITE_JOURNAL_MODE must be WAL, DELETE or TRUNCATE');
  db.exec(`PRAGMA journal_mode = ${journal}; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;`);

  // Version tracking. Databases created by version 2.0 used PRAGMA user_version.
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
  let current = db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations').get().v;
  const legacy = db.prepare('PRAGMA user_version').get().user_version;
  if (!current && legacy) {
    for (let v = 1; v <= legacy; v++) db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(v, Date.now());
    current = legacy;
  }
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      for (const stmt of statements(MIGRATIONS[v])) db.exec(stmt);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(v + 1, Date.now());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return db;
}

function sqliteAdapter(dbPath, journalMode) {
  const db = openSqliteSync(dbPath, journalMode);
  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = db.prepare(sql); cache.set(sql, s); }
    return s;
  };
  const norm = (params) => (params || []).map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v));
  return {
    dialect: 'sqlite',
    describe: `SQLite (${dbPath})`,
    async get(sql, params) { return stmt(sql).get(...norm(params)); },
    async all(sql, params) { return stmt(sql).all(...norm(params)); },
    async run(sql, params) { const r = stmt(sql).run(...norm(params)); return { changes: Number(r.changes) }; },
    async exec(sql) { db.exec(sql); },
    async close() { db.close(); },
    raw: db
  };
}

/* ------------------------------------------------------------------ */
/* PostgreSQL                                                          */
/* ------------------------------------------------------------------ */
function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function postgresAdapter(url, opts) {
  let pg;
  try { pg = require('pg'); } catch (e) {
    throw new Error('DATABASE_URL is set but the "pg" package is missing. Run "npm install".');
  }
  // Return BIGINT and NUMERIC as JavaScript numbers (timestamps fit safely).
  pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
  pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
  const pool = new pg.Pool({ connectionString: url, max: opts.poolMax || 5, idleTimeoutMillis: 10000 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(726354)'); // one migrator at a time
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version BIGINT PRIMARY KEY, applied_at BIGINT NOT NULL)');
    const current = Number((await client.query('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations')).rows[0].v);
    for (let v = current; v < MIGRATIONS.length; v++) {
      for (const s of statements(toPostgres(MIGRATIONS[v]))) await client.query(s);
      await client.query('INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)', [v + 1, Date.now()]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const q = async (sql, params) => pool.query(convertPlaceholders(sql), (params || []).map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v)));
  let host = 'PostgreSQL';
  try { host = `PostgreSQL (${new URL(url).hostname})`; } catch (e) { /* keep generic */ }
  return {
    dialect: 'postgres',
    describe: host,
    async get(sql, params) { return (await q(sql, params)).rows[0]; },
    async all(sql, params) { return (await q(sql, params)).rows; },
    async run(sql, params) { const r = await q(sql, params); return { changes: r.rowCount }; },
    async exec(sql) { for (const s of statements(sql)) await pool.query(s); },
    async close() { await pool.end(); }
  };
}

async function open(config) {
  if (config.databaseUrl) return postgresAdapter(config.databaseUrl, { poolMax: config.dbPoolMax });
  return sqliteAdapter(config.dbPath, config.sqliteJournalMode);
}

module.exports = { open, openSqliteSync, MIGRATIONS };

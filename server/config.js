'use strict';
/*
 * Runtime configuration. Every value can be set with an environment variable
 * or in a .env file at the project root (see .env.example).
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// Minimal .env loader (KEY=value lines; existing environment variables win).
(function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
})();

const env = process.env;
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
const onVercel = !!env.VERCEL;

// The PostgreSQL connection string. DATABASE_URL is the usual name; the Neon
// integration in the Vercel Marketplace also creates POSTGRES_URL, and adds a
// prefix when one was chosen while connecting the database (STORAGE_DATABASE_URL,
// NEON_DATABASE_URL...). Pooled URLs are preferred over the "unpooled" ones.
function findDatabaseUrl() {
  const isPg = (v) => /^postgres(ql)?:\/\//i.test(String(v || '').trim());
  for (const name of ['DATABASE_URL', 'POSTGRES_URL']) {
    if (isPg(env[name])) return { url: env[name].trim(), source: name };
  }
  const names = Object.keys(env).filter((k) => /(DATABASE_URL|POSTGRES_URL)$/i.test(k)).sort();
  const pooledFirst = names.filter((k) => !/UNPOOLED|NON_POOLING/i.test(k)).concat(names.filter((k) => /UNPOOLED|NON_POOLING/i.test(k)));
  for (const name of pooledFirst) {
    if (isPg(env[name])) return { url: env[name].trim(), source: name };
  }
  return { url: '', source: '' };
}
const database = findDatabaseUrl();

module.exports = {
  ROOT,
  PUBLIC_DIR: path.join(ROOT, 'public'),
  CATALOG_PATH: path.join(ROOT, 'catalog', 'prompts.js'),

  port: Number(env.PORT) || 3000,
  host: env.HOST || '0.0.0.0',
  onVercel,

  // Database: PostgreSQL when a connection string is present, otherwise SQLite.
  databaseUrl: database.url,
  databaseUrlSource: database.source,
  // Postgres driver: "neon" (HTTP, made for serverless; chosen automatically for
  // *.neon.tech hosts), "pg" (classic TCP driver for any other PostgreSQL) or "auto".
  dbDriver: (env.DB_DRIVER || 'auto').toLowerCase(),
  dbPoolMax: Number(env.DB_POOL_MAX) || (onVercel ? 3 : 10),
  dbPath: path.resolve(ROOT, env.DB_PATH || 'storage/hub.db'),
  sqliteJournalMode: env.SQLITE_JOURNAL_MODE || 'WAL',

  // Accounts
  allowedDomain: (env.ALLOWED_DOMAIN || 'qualifacts.com').toLowerCase().replace(/^@/, ''),
  defaultPassword: env.DEFAULT_PASSWORD || '123456',
  adminUsername: (env.ADMIN_USERNAME || 'admin').toLowerCase(),
  adminPassword: env.ADMIN_PASSWORD || '654321',
  requirePasswordChange: bool(env.REQUIRE_PASSWORD_CHANGE, false),
  sessionDays: Number(env.SESSION_DAYS) || 30,

  // Cookies: "auto" marks the cookie Secure when the request arrived over HTTPS.
  cookieSecure: (env.COOKIE_SECURE || 'auto').toLowerCase(),
  trustProxy: bool(env.TRUST_PROXY, onVercel),

  // Reports group activity by day and hour in this time zone.
  reportTimezone: env.REPORT_TIMEZONE || 'America/Chicago',

  // Shows a "Demo data" label in the interface (set by `npm run demo`).
  demo: bool(env.DEMO_MODE, false)
};

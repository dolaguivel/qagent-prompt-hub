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

module.exports = {
  ROOT,
  PUBLIC_DIR: path.join(ROOT, 'public'),
  CATALOG_PATH: path.join(ROOT, 'public', 'data', 'prompts.js'),

  port: Number(env.PORT) || 3000,
  host: env.HOST || '0.0.0.0',
  dbPath: path.resolve(ROOT, env.DB_PATH || 'storage/hub.db'),

  // Accounts
  allowedDomain: (env.ALLOWED_DOMAIN || 'qualifacts.com').toLowerCase().replace(/^@/, ''),
  defaultPassword: env.DEFAULT_PASSWORD || '123456',
  adminUsername: (env.ADMIN_USERNAME || 'admin').toLowerCase(),
  adminPassword: env.ADMIN_PASSWORD || '654321',
  requirePasswordChange: bool(env.REQUIRE_PASSWORD_CHANGE, false),
  sessionDays: Number(env.SESSION_DAYS) || 30,

  // Cookies: "auto" marks the cookie Secure when the request arrived over HTTPS.
  cookieSecure: (env.COOKIE_SECURE || 'auto').toLowerCase(),
  trustProxy: bool(env.TRUST_PROXY, false),

  // Reports group activity by day and hour in this time zone.
  reportTimezone: env.REPORT_TIMEZONE || 'America/Chicago',

  // Shows a "Demo data" label in the interface (set by `npm run demo`).
  demo: bool(env.DEMO_MODE, false)
};

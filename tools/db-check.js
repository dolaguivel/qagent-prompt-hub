'use strict';
/*
 * npm run db:check
 *
 * Connects to the database configured in .env or in the environment, creates
 * or updates the tables, makes sure the admin account exists and prints a
 * summary. Use it from your PC to test a Neon connection string before (or
 * after) deploying to Vercel:
 *
 *   Windows (cmd):   set DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require
 *                    npm run db:check
 *   macOS / Linux:   DATABASE_URL="postgresql://..." npm run db:check
 *
 * Or put DATABASE_URL in a .env file next to package.json.
 */
const config = require('../server/config');

(async () => {
  console.log(config.databaseUrl
    ? `Connection string found in ${config.databaseUrlSource}.`
    : `No DATABASE_URL found, so the hub would use the local SQLite file ${config.dbPath}.`);
  const started = Date.now();
  const app = require('../server/app');
  await app.ready;
  if (app.getInitError()) throw app.getInitError();
  const db = app.getDb();
  console.log(`Connected to ${db.describe} with the "${db.driver}" driver in ${Date.now() - started} ms. Tables are up to date.`);
  for (const table of ['users', 'events', 'visits', 'ratings', 'favorites', 'custom_prompts', 'contacts', 'user_prefs', 'auth_sessions']) {
    const row = await db.get(`SELECT COUNT(*) AS n FROM ${table}`);
    console.log(`  ${table.padEnd(15)} ${row.n} rows`);
  }
  const admin = await db.get("SELECT email FROM users WHERE role = 'admin'");
  console.log(`Admin account: ${admin ? admin.email : 'missing'}`);
  await db.close();
})().catch((err) => {
  console.error(`Database check failed: ${err.message}`);
  if (/password authentication failed/i.test(err.message)) console.error('Copy the connection string again from Neon (Connect > Connection string); the password may have been reset.');
  if (/ENOTFOUND|getaddrinfo|Cannot reach|fetch failed/i.test(err.message)) console.error('The database host could not be reached. Check that the connection string was copied completely and that your network or proxy allows connections to it.');
  process.exit(1);
});

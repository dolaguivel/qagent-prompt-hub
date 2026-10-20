'use strict';
/*
 * Builds storage/demo.db with fictional people and 90 days of activity so the
 * dashboards can be explored before real data exists. It never touches the
 * real database. Run with `npm run demo` (seeds, then starts the server).
 *
 * Every demo account uses the initial password; the admin is admin / 654321.
 */
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const { open, transaction } = require('./db');
const U = require('./util');

const DB_PATH = path.resolve(config.ROOT, process.env.DEMO_DB_PATH || 'storage/demo.db');
const TZ = config.reportTimezone;
const DAYS = 90;

// Deterministic random numbers so every run produces the same demo.
let seed = 20261014;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
function weighted(items, weightOf) {
  const total = items.reduce((s, x) => s + weightOf(x), 0);
  let r = rand() * total;
  for (const x of items) { r -= weightOf(x); if (r <= 0) return x; }
  return items[items.length - 1];
}

const TEAMS = [
  { name: 'Credible Sustainment', system: 'Credible', size: 9, areas: ['Development', 'Development', 'Quality assurance', 'Business analysis'] },
  { name: 'Credible Core', system: 'Credible', size: 6, areas: ['Development', 'Development', 'Quality assurance'] },
  { name: 'CareLogic Sustainment', system: 'CareLogic', size: 7, areas: ['Development', 'Quality assurance', 'Business analysis'] },
  { name: 'CareLogic Product', system: 'CareLogic', size: 4, areas: ['Product management', 'Business analysis'] },
  { name: 'InSync Engineering', system: 'InSync', size: 5, areas: ['Development', 'Quality assurance'] },
  { name: 'InSync Support', system: 'InSync', size: 5, areas: ['Support', 'Support', 'Implementation'] },
  { name: 'Platform QA', system: 'Credible', size: 4, areas: ['Quality assurance'] },
  { name: 'Implementation', system: 'CareLogic', size: 3, areas: ['Implementation', 'Support'] }
];
const FIRST = ['Ana', 'Luis', 'María', 'Carlos', 'Sofía', 'Diego', 'Valeria', 'Jorge', 'Lucía', 'Andrés', 'Camila', 'Miguel', 'Paula', 'Ricardo', 'Elena', 'Tomás', 'Natalia', 'Gabriel', 'Isabel', 'Daniel', 'Emily', 'James', 'Olivia', 'Ryan', 'Megan', 'Kevin', 'Hannah', 'Brandon', 'Rachel', 'Tyler', 'Lauren', 'Jason', 'Ashley', 'Eric', 'Nicole', 'Adam', 'Grace', 'Marcus', 'Chloe', 'Nathan', 'Priya', 'Arjun', 'Mei', 'Omar'];
const LAST = ['Quispe', 'Torres', 'Ramírez', 'Flores', 'Vargas', 'Mendoza', 'Castro', 'Rojas', 'Huamán', 'Salazar', 'Carter', 'Brooks', 'Nguyen', 'Patel', 'Reed', 'Foster', 'Hughes', 'Price', 'Bennett', 'Wood', 'Coleman', 'Hayes', 'Sullivan', 'Russell', 'Morales'];

const SEARCHES = [
  ['missing option', 1], ['error message', 1], ['config', 1], ['permissions', 1], ['test cases', 1], ['root cause', 1], ['sql', 1],
  ['clearinghouse', 1], ['customer update', 1], ['release notes', 1], ['slow page', 1], ['billing', 1], ['role', 1], ['report', 1],
  ['hl7 mapping', 0], ['eligibility check', 0], ['superbill', 0], ['treatment plan signature', 0], ['erx renewal', 0], ['telehealth', 0], ['state reporting export', 0]
];
const COMMENTS = {
  high: ['Saved me an hour on a missing-link ticket.', 'The configuration path at the end is exactly what Support needed.', 'QAgent found the right code-behind on the first try.', 'Great for first-pass reviews.', 'Love the read-only queries.', 'The verdict table makes it easy to answer the customer.'],
  mid: ['Useful, but the answer is long. I use the concise option.', 'Works better for Credible than for InSync for now.', 'Good start; I had to ask a follow-up for the queries.'],
  low: ['Too generic for our module.', 'QAgent could not find the code without the file path.', 'It should ask for the customer first.']
};

function seedDemo() {
  for (const ext of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB_PATH + ext); } catch (e) { /* not there */ } }
  const db = open(DB_PATH);
  const catalog = U.loadCatalog(config.CATALOG_PATH);
  const prompts = catalog.prompts;
  const now = Date.now();
  const today = U.dayParts(now, TZ).day;
  const dayStart = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  const daysBack = (n) => new Date(dayStart(today) - n * 86400000).toISOString().slice(0, 10);

  // Prompt popularity: featured and code-reading prompts get used more; a few are rarely touched.
  const popularity = new Map(prompts.map((p, i) => {
    let w = 1 + rand() * 2;
    if (p.featured) w += 6;
    if (/CODE_EVIDENCE/.test(p.template)) w += 2.5;
    if (['postmortem', 'deploy-checklist', 'security-review', 'duplicate-records', 'scheduled-job'].includes(p.id)) w = 0.25;
    return [p.id, w * (1 + (i % 5 === 0 ? 1 : 0))];
  }));
  const lowRated = new Set(['hypothesis-matrix', 'uat-script', 'dates-times']);

  return (async () => {
    const userHash = await U.hashPassword(config.defaultPassword);
    const adminHash = await U.hashPassword(config.adminPassword);
    const insUser = db.prepare(`INSERT INTO users (email, name, role, team, area, system, password_hash, must_change, created_at, created_day, last_login_at, last_seen_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insEvent = db.prepare(`INSERT INTO events (ts, day, hour, dow, user_id, type, prompt_id, category, stage, platform, team, area, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insVisit = db.prepare('INSERT INTO visits (id, user_id, day, started_at, last_seen_at, active_seconds, team, area, system) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insFav = db.prepare('INSERT OR IGNORE INTO favorites (user_id, prompt_id, created_at) VALUES (?, ?, ?)');
    const insRating = db.prepare(`INSERT OR REPLACE INTO ratings (user_id, prompt_id, stars, comment, created_at, updated_at, updated_day) VALUES (?, ?, ?, ?, ?, ?, ?)`);

    let users = [];
    let events = 0;
    transaction(db, () => {
      insUser.run(config.adminUsername, 'Administrator', 'admin', null, null, null, adminHash, 1, now - DAYS * 86400000, daysBack(DAYS), now, now);
      const used = new Set();
      for (const team of TEAMS) {
        for (let i = 0; i < team.size; i++) {
          let first, last, email;
          do { first = pick(FIRST); last = pick(LAST); email = `${U.slugify(first)}.${U.slugify(last)}.demo@${config.allowedDomain}`; } while (used.has(email));
          used.add(email);
          const joinDay = daysBack((DAYS - 1) - Math.floor(Math.pow(rand(), 1.6) * (DAYS - 2))); // more people joined early
          const createdAt = dayStart(joinDay) + between(13, 22) * 3600000;
          const system = rand() < 0.85 ? team.system : pick(['Credible', 'CareLogic', 'InSync']);
          const engagement = rand() < 0.12 ? 0 : 0.15 + rand() * 0.75; // a few people never come back
          const info = insUser.run(email, `${first} ${last}`, 'user', team.name, pick(team.areas), system, userHash, rand() < 0.4 ? 1 : 0, createdAt, U.dayParts(createdAt, TZ).day, createdAt, createdAt);
          users.push({ id: Number(info.lastInsertRowid), team: team.name, area: null, system, joinDay, createdAt, engagement, copies: new Map() });
        }
      }
      for (const u of users) Object.assign(u, db.prepare('SELECT area FROM users WHERE id = ?').get(u.id));

      for (let back = DAYS - 1; back >= 0; back--) {
        const day = daysBack(back);
        const dow = new Date(dayStart(day)).getUTCDay();
        const weekend = dow === 0 || dow === 6;
        const growth = 0.55 + 0.45 * ((DAYS - back) / DAYS); // adoption grows over the quarter
        for (const u of users) {
          if (day < u.joinDay) continue;
          const pActive = u.engagement * growth * (weekend ? 0.08 : 1);
          if (rand() > pActive) continue;
          const sessions = rand() < 0.3 ? 2 : 1;
          for (let s = 0; s < sessions; s++) {
            const localHour = weighted([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], (h) => ({ 8: 2, 9: 5, 10: 8, 11: 7, 12: 3, 13: 4, 14: 7, 15: 8, 16: 6, 17: 3, 18: 1 }[h]));
            let ts = dayStart(day) + (localHour + 5) * 3600000 + between(0, 59) * 60000;
            if (ts > now) continue;
            const visitId = `demo-${u.id}-${back}-${s}`;
            const minutes = between(3, 12) + Math.floor(rand() * rand() * 35);
            insVisit.run(visitId, u.id, U.dayParts(ts, TZ).day, ts, ts + minutes * 60000, minutes * 60, u.team, u.area, u.system);
            const add = (type, promptId, platform, meta) => {
              ts += between(20, 240) * 1000;
              const p = promptId ? prompts.find((x) => x.id === promptId) : null;
              const parts = U.dayParts(ts, TZ);
              insEvent.run(ts, parts.day, parts.hour, parts.dow, u.id, type, promptId, p ? p.category : null, p ? p.stage : null, platform, u.team, u.area, meta ? JSON.stringify(meta) : null);
              events++;
            };
            if (s === 0 && rand() < 0.5) add('login', null, u.system, null);
            if (rand() < 0.35) { const [q, hit] = pick(SEARCHES); add('search', null, u.system, { q, results: hit ? between(1, 8) : 0 }); }
            const n = between(1, 4);
            for (let k = 0; k < n; k++) {
              const p = weighted(prompts, (x) => popularity.get(x.id) * (u.copies.has(x.id) ? 2.2 : 1));
              const platform = rand() < 0.9 ? u.system : pick(['Credible', 'CareLogic', 'InSync']);
              add('view', p.id, platform, null);
              if (rand() < 0.72) {
                add('copy', p.id, platform, { length: rand() < 0.2 ? 'concise' : 'standard', guardrail: true, product: false, missing: rand() < 0.15 ? 1 : 0 });
                u.copies.set(p.id, (u.copies.get(p.id) || 0) + 1);
              }
            }
            db.prepare('UPDATE users SET last_seen_at = MAX(COALESCE(last_seen_at, 0), ?) WHERE id = ?').run(ts, u.id);
          }
        }
      }

      // Favorites and ratings from what each person copied.
      for (const u of users) {
        const mine = [...u.copies.entries()].sort((a, b) => b[1] - a[1]);
        mine.slice(0, between(1, 6)).forEach(([pid], i) => insFav.run(u.id, pid, now - between(1, 60) * 86400000 - i));
        for (const [pid] of mine) {
          if (rand() > 0.45) continue;
          let stars = weighted([5, 4, 3, 2, 1], (s) => ({ 5: 46, 4: 34, 3: 12, 2: 5, 1: 3 }[s]));
          if (lowRated.has(pid)) stars = weighted([4, 3, 2, 1], (s) => ({ 4: 2, 3: 4, 2: 3, 1: 1 }[s]));
          const comment = rand() < 0.28 ? pick(stars >= 4 ? COMMENTS.high : stars === 3 ? COMMENTS.mid : COMMENTS.low) : null;
          const at = now - between(0, 75) * 86400000 - between(0, 8) * 3600000;
          insRating.run(u.id, pid, stars, comment, at, at, U.dayParts(at, TZ).day);
        }
      }
    });
    db.close();
    console.log(`Demo database ready: ${DB_PATH}`);
    console.log(`${users.length} people, ${events.toLocaleString('en-US')} events over ${DAYS} days.`);
    console.log(`Sign in as admin / ${config.adminPassword}, or as any demo person with the password ${config.defaultPassword}.`);
  })();
}

module.exports = { seedDemo, DB_PATH };
if (require.main === module) seedDemo().catch((err) => { console.error(err); process.exit(1); });

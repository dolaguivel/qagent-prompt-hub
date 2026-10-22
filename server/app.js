'use strict';
/*
 * QAgent Prompt Hub API. Used by two entry points:
 *   server/server.js  a normal Node server (company server, VM, Docker, PC)
 *   api/index.js      a Vercel serverless function
 * No framework; requires Node.js 22.13 or later.
 */
const config = require('./config');
const { open } = require('./db');
const U = require('./util');
const metrics = require('./metrics');

const TZ = config.reportTimezone;
const COOKIE = 'qph_session';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const PREF_KEYS = new Set(['comment']);
const catalog = () => U.loadCatalog(config.CATALOG_PATH);

let db = null;
let initError = null;
const ready = (async () => {
  try {
    catalog(); // fail fast if the catalog has a syntax error
    if (config.onVercel && !config.databaseUrl) {
      throw new Error('This deployment has no database. Add a Postgres database (for example Neon from the Vercel Marketplace) so DATABASE_URL is set, then redeploy.');
    }
    db = await open(config);
    await ensureAdmin();
  } catch (err) {
    initError = err;
    console.error('Startup failed:', err.message);
  }
})();

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */
class HttpError extends Error {
  constructor(status, code, message, extra) { super(message); this.status = status; this.code = code; this.extra = extra; }
}
const fail = (status, code, message, extra) => { throw new HttpError(status, code, message, extra); };

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ')
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, Object.assign({}, SECURITY_HEADERS, headers));
  res.end(body);
}
function json(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers));
}

function readBody(req, limit = 512 * 1024) {
  // Vercel may have parsed the body already.
  let pre;
  try { pre = req.body; } catch (e) { return Promise.reject(new HttpError(400, 'bad_json', 'Request body is not valid JSON.')); }
  if (pre !== undefined && pre !== null) {
    if (Buffer.isBuffer(pre) || typeof pre === 'string') {
      try { return Promise.resolve(JSON.parse(String(pre) || '{}')); } catch (e) { return Promise.reject(new HttpError(400, 'bad_json', 'Request body is not valid JSON.')); }
    }
    return Promise.resolve(pre);
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'too_large', 'Request is too large.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(new HttpError(400, 'bad_json', 'Request body is not valid JSON.')); }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
const isHttps = (req) => (req.socket && req.socket.encrypted) || (config.trustProxy && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
const clientIp = (req) => (config.trustProxy && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : (req.socket && req.socket.remoteAddress)) || 'unknown';

function sessionCookie(req, token, maxAgeSeconds) {
  const secure = config.cookieSecure === 'true' || (config.cookieSecure === 'auto' && isHttps(req));
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}

/* ------------------------------------------------------------------ */
/* Accounts and sessions                                               */
/* ------------------------------------------------------------------ */
const nowParts = () => { const ts = Date.now(); return Object.assign({ ts }, U.dayParts(ts, TZ)); };

function publicUser(u) {
  return {
    id: u.id, email: u.email, name: u.name, role: u.role, team: u.team, area: u.area, system: u.system,
    mustChange: !!u.must_change, createdAt: u.created_at
  };
}

async function ensureAdmin() {
  if (await db.get('SELECT id FROM users WHERE email = ?', [config.adminUsername])) return;
  const { ts, day } = nowParts();
  const r = await db.run(`INSERT INTO users (email, name, role, password_hash, must_change, created_at, created_day)
              VALUES (?, 'Administrator', 'admin', ?, 1, ?, ?) ON CONFLICT (email) DO NOTHING`,
  [config.adminUsername, await U.hashPassword(config.adminPassword), ts, day]);
  if (r.changes) console.log(`Created the admin account "${config.adminUsername}".`);
}

async function createSession(userId) {
  const token = U.randomToken();
  const now = Date.now();
  await db.run('INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?)',
    [U.sha256(token), userId, now, now + config.sessionDays * 86400000, now]);
  return token;
}

async function sessionUser(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const hash = U.sha256(token);
  const row = await db.get('SELECT s.expires_at, s.last_used_at, u.* FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?', [hash]);
  if (!row) return null;
  if (row.expires_at < Date.now() || !row.active) {
    await db.run('DELETE FROM auth_sessions WHERE token_hash = ?', [hash]);
    return null;
  }
  if (Date.now() - row.last_used_at > 5 * 60000) await db.run('UPDATE auth_sessions SET last_used_at = ? WHERE token_hash = ?', [Date.now(), hash]);
  row._tokenHash = hash;
  return row;
}

/* Login throttling: 8 failures per account or 30 per address in 15 minutes.
   On Vercel each instance keeps its own counters. */
const failures = new Map();
function tooManyFailures(ip, login) {
  const now = Date.now();
  for (const [k, v] of failures) if (now - v.first > 15 * 60000) failures.delete(k);
  const a = failures.get('login:' + login);
  const b = failures.get('ip:' + ip);
  return (a && a.n >= 8) || (b && b.n >= 30);
}
function recordFailure(ip, login) {
  for (const k of ['login:' + login, 'ip:' + ip]) {
    const v = failures.get(k) || { n: 0, first: Date.now() };
    v.n++;
    failures.set(k, v);
  }
}
const domainError = () => new HttpError(400, 'domain', `Only corporate @${config.allowedDomain} email addresses can sign in or create an account.`);

/* ------------------------------------------------------------------ */
/* Catalog helpers and tracking                                        */
/* ------------------------------------------------------------------ */
function catalogLists() {
  const c = catalog();
  return {
    areas: c.areas || [],
    systems: (c.platforms || []).map((p) => p.name),
    categories: new Set(c.categories.map((x) => x.id)),
    stages: new Set(c.stages.map((x) => x.id))
  };
}

async function resolvePrompt(id) {
  if (!id || !ID_RE.test(id)) return null;
  const p = catalog()._byId.get(id);
  if (p) return { category: p.category, stage: p.stage };
  const row = await db.get('SELECT data FROM custom_prompts WHERE id = ?', [id]);
  if (!row) return null;
  try { const d = JSON.parse(row.data); return { category: d.category, stage: d.stage }; } catch (e) { return null; }
}

async function eventRow(user, type, { promptId = null, platform = null, meta = null } = {}) {
  const { ts, day, hour, dow } = nowParts();
  const p = promptId ? await resolvePrompt(promptId) : null;
  const systems = catalogLists().systems;
  const plat = platform && systems.includes(platform) ? platform : (user.system || null);
  return [ts, day, hour, dow, user.id, type, p ? promptId : null, p ? p.category : null, p ? p.stage : null, plat, user.team || null, user.area || null,
    meta ? JSON.stringify(meta).slice(0, 2000) : null];
}
async function insertEvents(rows) {
  if (!rows.length) return;
  const one = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  await db.run(`INSERT INTO events (ts, day, hour, dow, user_id, type, prompt_id, category, stage, platform, team, area, meta) VALUES ${rows.map(() => one).join(', ')}`,
    rows.flat());
}
async function track(user, type, opts) {
  if (!user || user.role === 'admin') return; // the admin's own browsing is not counted
  await insertEvents([await eventRow(user, type, opts)]);
}

/* Per-prompt community numbers, cached briefly per instance. */
let statsCache = { at: 0, data: null };
async function promptStats() {
  if (statsCache.data && Date.now() - statsCache.at < 30000) return statsCache.data;
  const out = {};
  const get = (id) => (out[id] = out[id] || { avg: null, ratings: 0, copies: 0, users: 0, favorites: 0 });
  for (const r of await db.all('SELECT prompt_id AS id, AVG(stars) AS avg, COUNT(*) AS n FROM ratings GROUP BY prompt_id')) Object.assign(get(r.id), { avg: Math.round(r.avg * 10) / 10, ratings: r.n });
  for (const r of await db.all("SELECT prompt_id AS id, COUNT(*) AS n, COUNT(DISTINCT user_id) AS u FROM events WHERE type = 'copy' AND prompt_id IS NOT NULL GROUP BY prompt_id")) Object.assign(get(r.id), { copies: r.n, users: r.u });
  for (const r of await db.all('SELECT prompt_id AS id, COUNT(*) AS n FROM favorites GROUP BY prompt_id')) get(r.id).favorites = r.n;
  statsCache = { at: Date.now(), data: out };
  return out;
}
const invalidateStats = () => { statsCache.at = 0; };

function validateProfile(body, { partial = false } = {}) {
  const lists = catalogLists();
  const out = {};
  if (!partial || body.name !== undefined) {
    out.name = U.clean(body.name, 80);
    if (out.name.length < 2) fail(400, 'name', 'Enter your full name.');
  }
  if (!partial || body.team !== undefined) {
    out.team = U.clean(body.team, 60);
    if (out.team.length < 2) fail(400, 'team', 'Enter your team.');
  }
  if (!partial || body.area !== undefined) {
    out.area = U.clean(body.area, 60);
    if (!lists.areas.includes(out.area)) fail(400, 'area', 'Choose an area from the list.');
  }
  if (!partial || body.system !== undefined) {
    out.system = U.clean(body.system, 40);
    if (!lists.systems.includes(out.system)) fail(400, 'system', 'Choose a system from the list.');
  }
  return out;
}

function validateCustomPrompt(body) {
  const lists = catalogLists();
  const d = {
    title: U.clean(body.title, 120),
    description: U.clean(body.description, 300),
    category: String(body.category || ''),
    stage: String(body.stage || ''),
    tags: Array.isArray(body.tags) ? body.tags.map((t) => U.clean(t, 30)).filter(Boolean).slice(0, 10) : [],
    ticket: ['required', 'optional', 'none'].includes(body.ticket) ? body.ticket : 'optional',
    template: String(body.template || '').replace(/\r\n/g, '\n').slice(0, 20000).trim()
  };
  if (d.title.length < 3) fail(400, 'title', 'Add a title.');
  if (!d.template) fail(400, 'template', 'Write the prompt text.');
  if (!lists.categories.has(d.category)) fail(400, 'category', 'Choose a category.');
  if (!lists.stages.has(d.stage)) fail(400, 'stage', 'Choose a PDLC stage.');
  return d;
}

function validateContact(body) {
  const c = {
    name: U.clean(String(body.name || '').replace(/^@+/, ''), 80),
    email: U.clean(body.email, 160).toLowerCase() || null,
    role: U.clean(body.role, 80) || null
  };
  if (c.name.length < 2) fail(400, 'name', 'Enter the person’s full name.');
  if (c.email && !EMAIL_RE.test(c.email)) fail(400, 'email', 'Enter a valid email address or leave it empty.');
  return c;
}

const customRow = (r) => Object.assign(JSON.parse(r.data), { id: r.id, updated: r.updated_at });
async function promptExists(id) {
  if (!ID_RE.test(String(id || ''))) return false;
  return catalog()._byId.has(id) || !!(await db.get('SELECT 1 AS x FROM custom_prompts WHERE id = ?', [id]));
}
const contactRow = (r) => ({ id: r.id, name: r.name, email: r.email || '', role: r.role || '' });

/* ------------------------------------------------------------------ */
/* API routes                                                          */
/* ------------------------------------------------------------------ */
const routes = [];
const route = (method, pattern, auth, handler) => routes.push({ method, pattern, auth, handler });

route('GET', /^\/api\/config$/, null, async () => {
  const lists = catalogLists();
  const c = catalog();
  const teams = (await db.all("SELECT DISTINCT team AS v FROM users WHERE role = 'user' AND team IS NOT NULL")).map((r) => r.v);
  return {
    allowedDomain: config.allowedDomain, demo: config.demo, requirePasswordChange: config.requirePasswordChange,
    areas: lists.areas, systems: lists.systems, teams: [...new Set([...(c.teams || []), ...teams])].sort(),
    promptCount: c.prompts.length, appName: (c.meta && c.meta.appName) || 'QAgent Prompt Hub',
    version: c.meta && c.meta.version, updated: c.meta && c.meta.updated
  };
});

// The catalog holds internal details (repository names, tables), so it is only served to signed-in people.
route('GET', /^\/api\/catalog\.js$/, 'user', async ({ res }) => {
  const fs = require('node:fs');
  send(res, 200, fs.readFileSync(config.CATALOG_PATH, 'utf8'), { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'private, no-cache' });
});

route('POST', /^\/api\/auth\/register$/, null, async ({ req, res, body }) => {
  const email = U.clean(body.email, 160).toLowerCase();
  if (!EMAIL_RE.test(email)) fail(400, 'email', 'Enter a valid email address.');
  if (email.split('@')[1] !== config.allowedDomain) throw domainError();
  const profile = validateProfile(body);
  if (await db.get('SELECT 1 AS x FROM users WHERE email = ?', [email])) fail(409, 'exists', 'An account with this email already exists. Sign in instead.');
  const { ts, day } = nowParts();
  const hash = await U.hashPassword(config.defaultPassword);
  const created = await db.get(`INSERT INTO users (email, name, team, area, system, password_hash, must_change, created_at, created_day, last_login_at, last_seen_at)
                           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?) RETURNING id`, [email, profile.name, profile.team, profile.area, profile.system, hash, ts, day, ts, ts]);
  const user = await db.get('SELECT * FROM users WHERE id = ?', [created.id]);
  await track(user, 'register');
  const token = await createSession(user.id);
  res.setHeader('Set-Cookie', sessionCookie(req, token, config.sessionDays * 86400));
  return { user: publicUser(user), initialPassword: config.defaultPassword };
});

route('POST', /^\/api\/auth\/login$/, null, async ({ req, res, body }) => {
  const login = U.clean(body.login, 160).toLowerCase();
  const password = String(body.password || '');
  const ip = clientIp(req);
  if (!login || !password) fail(400, 'missing', 'Enter your email and password.');
  if (login !== config.adminUsername) {
    if (!EMAIL_RE.test(login)) fail(400, 'email', 'Enter your corporate email address.');
    if (login.split('@')[1] !== config.allowedDomain) throw domainError();
  }
  if (tooManyFailures(ip, login)) fail(429, 'throttled', 'Too many failed attempts. Wait 15 minutes and try again, or ask the admin to reset your password.');
  const user = await db.get('SELECT * FROM users WHERE email = ?', [login]);
  const ok = user ? await U.verifyPassword(password, user.password_hash) : (await U.hashPassword(password), false);
  if (!user || !ok) {
    recordFailure(ip, login);
    fail(401, 'credentials', user || login === config.adminUsername
      ? 'That email and password do not match.'
      : 'There is no account for this email yet. Create one first.');
  }
  if (!user.active) fail(403, 'inactive', 'This account is deactivated. Ask the admin to reactivate it.');
  await db.run('UPDATE users SET last_login_at = ?, last_seen_at = ? WHERE id = ?', [Date.now(), Date.now(), user.id]);
  await track(user, 'login');
  const token = await createSession(user.id);
  res.setHeader('Set-Cookie', sessionCookie(req, token, config.sessionDays * 86400));
  return { user: publicUser(user) };
});

route('POST', /^\/api\/auth\/logout$/, null, async ({ req, res }) => {
  const token = parseCookies(req)[COOKIE];
  if (token) await db.run('DELETE FROM auth_sessions WHERE token_hash = ?', [U.sha256(token)]);
  res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
  return { ok: true };
});

route('GET', /^\/api\/me$/, 'user', async ({ user }) => {
  const favorites = (await db.all('SELECT prompt_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC', [user.id])).map((r) => r.prompt_id);
  const ratings = {};
  for (const r of await db.all('SELECT prompt_id, stars, comment FROM ratings WHERE user_id = ?', [user.id])) ratings[r.prompt_id] = { stars: r.stars, comment: r.comment || '' };
  const usage = {};
  for (const r of await db.all("SELECT prompt_id, COUNT(*) AS n, MAX(ts) AS last FROM events WHERE user_id = ? AND type = 'copy' AND prompt_id IS NOT NULL GROUP BY prompt_id", [user.id])) usage[r.prompt_id] = { count: r.n, last: r.last };
  const custom = (await db.all('SELECT * FROM custom_prompts WHERE user_id = ? ORDER BY updated_at DESC', [user.id])).map(customRow);
  return { user: publicUser(user), favorites, ratings, usage, custom, stats: await promptStats() };
});

route('PATCH', /^\/api\/me$/, 'user', async ({ user, body }) => {
  const p = validateProfile(body, { partial: true });
  const fields = Object.keys(p);
  if (!fields.length) return { user: publicUser(user) };
  await db.run(`UPDATE users SET ${fields.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...fields.map((k) => p[k]), user.id]);
  return { user: publicUser(await db.get('SELECT * FROM users WHERE id = ?', [user.id])) };
});

route('POST', /^\/api\/me\/password$/, 'user', async ({ user, body }) => {
  const current = String(body.current || '');
  const next = String(body.next || '');
  if (!(await U.verifyPassword(current, user.password_hash))) fail(400, 'current', 'Your current password is not correct.');
  if (next.length < 8) fail(400, 'next', 'Use at least 8 characters.');
  if (next === config.defaultPassword || next === config.adminPassword || next === current) fail(400, 'next', 'Choose a password different from the initial one.');
  await db.run('UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?', [await U.hashPassword(next), user.id]);
  await db.run('DELETE FROM auth_sessions WHERE user_id = ? AND token_hash <> ?', [user.id, user._tokenHash]);
  await track(user, 'password_change');
  return { ok: true };
});

route('GET', /^\/api\/me\/prefs\/([a-z]+)$/, 'user', async ({ user, m }) => {
  if (!PREF_KEYS.has(m[1])) fail(404, 'pref', 'Unknown preference.');
  const row = await db.get('SELECT data FROM user_prefs WHERE user_id = ? AND pref_key = ?', [user.id, m[1]]);
  let data = {};
  try { data = row ? JSON.parse(row.data) : {}; } catch (e) { data = {}; }
  return { data };
});

route('PUT', /^\/api\/me\/prefs\/([a-z]+)$/, 'user', async ({ user, m, body }) => {
  if (!PREF_KEYS.has(m[1])) fail(404, 'pref', 'Unknown preference.');
  const text = JSON.stringify(body && typeof body.data === 'object' && body.data ? body.data : {});
  if (text.length > 64 * 1024) fail(413, 'too_large', 'These preferences are too large.');
  await db.run(`INSERT INTO user_prefs (user_id, pref_key, data, updated_at) VALUES (?, ?, ?, ?)
                ON CONFLICT (user_id, pref_key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`, [user.id, m[1], text, Date.now()]);
  return { ok: true };
});

route('GET', /^\/api\/contacts$/, 'user', async ({ user }) => {
  const team = (await db.all('SELECT id, name, email, role FROM contacts WHERE owner_id IS NULL ORDER BY name')).map(contactRow);
  const mine = (await db.all('SELECT id, name, email, role FROM contacts WHERE owner_id = ? ORDER BY name', [user.id])).map(contactRow);
  return { team, mine, canEditTeam: user.role === 'admin' };
});

route('POST', /^\/api\/contacts$/, 'user', async ({ user, body }) => {
  const c = validateContact(body);
  const teamScope = body.scope === 'team';
  if (teamScope && user.role !== 'admin') fail(403, 'forbidden', 'Only the admin can add people to the team list.');
  const owner = teamScope ? null : user.id;
  const existing = await db.all(teamScope ? 'SELECT name FROM contacts WHERE owner_id IS NULL' : 'SELECT name FROM contacts WHERE owner_id = ?', teamScope ? [] : [user.id]);
  if (existing.some((r) => r.name.toLowerCase() === c.name.toLowerCase())) fail(409, 'exists', `${c.name} is already in ${teamScope ? 'the team list' : 'your list'}.`);
  if (existing.length >= (teamScope ? 1000 : 300)) fail(400, 'limit', 'This list is full. Remove someone first.');
  const row = await db.get('INSERT INTO contacts (owner_id, name, email, role, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, name, email, role',
    [owner, c.name, c.email, c.role, user.id, Date.now()]);
  return { contact: contactRow(row), scope: teamScope ? 'team' : 'mine' };
});

route('DELETE', /^\/api\/contacts\/(\d+)$/, 'user', async ({ user, m }) => {
  const row = await db.get('SELECT id, owner_id FROM contacts WHERE id = ?', [Number(m[1])]);
  if (!row) fail(404, 'contact', 'That person is not in the list.');
  if (row.owner_id == null ? user.role !== 'admin' : row.owner_id !== user.id) fail(403, 'forbidden', 'You can only remove people you added.');
  await db.run('DELETE FROM contacts WHERE id = ?', [row.id]);
  return { ok: true };
});

route('GET', /^\/api\/stats$/, 'user', async () => promptStats());

route('PUT', /^\/api\/favorites\/([a-z0-9-]+)$/, 'user', async ({ user, m }) => {
  if (!(await promptExists(m[1]))) fail(404, 'prompt', 'That prompt does not exist.');
  const r = await db.run('INSERT INTO favorites (user_id, prompt_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', [user.id, m[1], Date.now()]);
  if (r.changes) { await track(user, 'favorite', { promptId: m[1] }); invalidateStats(); }
  return { ok: true };
});

route('DELETE', /^\/api\/favorites\/([a-z0-9-]+)$/, 'user', async ({ user, m }) => {
  const r = await db.run('DELETE FROM favorites WHERE user_id = ? AND prompt_id = ?', [user.id, m[1]]);
  if (r.changes) { await track(user, 'unfavorite', { promptId: m[1] }); invalidateStats(); }
  return { ok: true };
});

route('PUT', /^\/api\/ratings\/([a-z0-9-]+)$/, 'user', async ({ user, m, body }) => {
  if (!(await promptExists(m[1]))) fail(404, 'prompt', 'That prompt does not exist.');
  const stars = Number(body.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) fail(400, 'stars', 'Choose from 1 to 5 stars.');
  const comment = String(body.comment || '').replace(/\r\n/g, '\n').trim().slice(0, 1000) || null;
  const { ts, day } = nowParts();
  await db.run(`INSERT INTO ratings (user_id, prompt_id, stars, comment, created_at, updated_at, updated_day) VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (user_id, prompt_id) DO UPDATE SET stars = excluded.stars, comment = excluded.comment, updated_at = excluded.updated_at, updated_day = excluded.updated_day`,
  [user.id, m[1], stars, comment, ts, ts, day]);
  await track(user, 'rate', { promptId: m[1], meta: { stars } });
  invalidateStats();
  return { ok: true, stats: (await promptStats())[m[1]] };
});

route('DELETE', /^\/api\/ratings\/([a-z0-9-]+)$/, 'user', async ({ user, m }) => {
  await db.run('DELETE FROM ratings WHERE user_id = ? AND prompt_id = ?', [user.id, m[1]]);
  invalidateStats();
  return { ok: true, stats: (await promptStats())[m[1]] || null };
});

const CLIENT_EVENTS = new Set(['view', 'copy', 'search', 'share', 'download', 'comment']);
// Ticket comments are counted by type only; the comment text never reaches the server.
const COMMENT_DECISIONS = new Set(['defect', 'duplicate', 'info', 'config', 'design', 'cannot']);
function commentMeta(m) {
  const pick = (v, allowed, d) => (allowed.has(String(v)) ? String(v) : d);
  return {
    decision: pick(m.decision, COMMENT_DECISIONS, 'unknown'),
    model: [1, 2, 3, 4, 5].includes(Number(m.model)) ? Number(m.model) : null,
    language: pick(m.language, new Set(['en', 'es']), 'en'),
    technical: !!m.technical,
    via: pick(m.via, new Set(['rich', 'plain', 'support', 'qagent']), 'rich'),
    agent: agentValue(m.agent),
    file: pick(m.file, FILE_KINDS, '')
  };
}
// Prompt copies record the options used to send them: length, guardrail, QAgent agent and file.
const FILE_KINDS = new Set(['docx', 'xlsx']);
const agentValue = (v) => (/^\/[a-z0-9][a-z0-9_-]{0,39}$/i.test(String(v || '')) ? String(v).toLowerCase() : '');
function copyMeta(m) {
  return {
    length: ['standard', 'concise', 'detailed'].includes(m.length) ? m.length : 'standard',
    guardrail: m.guardrail !== false,
    agent: agentValue(m.agent),
    file: FILE_KINDS.has(String(m.file)) ? String(m.file) : '',
    missing: Math.max(0, Math.min(50, Number(m.missing) || 0))
  };
}
route('POST', /^\/api\/events$/, 'user', async ({ user, body }) => {
  if (user.role === 'admin') return { ok: true };
  const list = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  const rows = [];
  for (const ev of list) {
    if (!ev || !CLIENT_EVENTS.has(ev.type)) continue;
    let meta = ev.meta && typeof ev.meta === 'object' ? ev.meta : null;
    if (meta && meta.q) meta.q = U.clean(meta.q, 100);
    if (ev.type === 'comment') meta = commentMeta(meta || {});
    if (ev.type === 'copy') meta = copyMeta(meta || {});
    rows.push(await eventRow(user, ev.type, { promptId: ev.promptId || null, platform: ev.platform || null, meta }));
  }
  await insertEvents(rows);
  if (list.some((e) => e && e.type === 'copy')) invalidateStats();
  return { ok: true };
});

route('POST', /^\/api\/heartbeat$/, 'user', async ({ user, body }) => {
  if (user.role === 'admin') return { ok: true };
  const id = String(body.visitId || '');
  if (!/^[a-z0-9-]{8,40}$/i.test(id)) fail(400, 'visit', 'Invalid visit id.');
  const seconds = Math.max(0, Math.min(120, Math.round(Number(body.seconds) || 0)));
  const { ts, day } = nowParts();
  await db.run(`INSERT INTO visits (id, user_id, day, started_at, last_seen_at, active_seconds, team, area, system) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET active_seconds = visits.active_seconds + excluded.active_seconds, last_seen_at = excluded.last_seen_at
              WHERE visits.user_id = excluded.user_id`, [id, user.id, day, ts, ts, seconds, user.team, user.area, user.system]);
  await db.run('UPDATE users SET last_seen_at = ? WHERE id = ?', [ts, user.id]);
  return { ok: true };
});

route('POST', /^\/api\/my-prompts$/, 'user', async ({ user, body }) => {
  const d = validateCustomPrompt(body);
  if ((await db.get('SELECT COUNT(*) AS n FROM custom_prompts WHERE user_id = ?', [user.id])).n >= 200) fail(400, 'limit', 'You can keep up to 200 prompts.');
  const id = `my-${U.slugify(d.title).slice(0, 40)}-${U.randomToken().replace(/[^a-z0-9]/gi, '').slice(0, 6).toLowerCase()}`;
  const now = Date.now();
  await db.run('INSERT INTO custom_prompts (id, user_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [id, user.id, JSON.stringify(d), now, now]);
  await track(user, 'prompt_create', { promptId: id });
  return { prompt: customRow(await db.get('SELECT * FROM custom_prompts WHERE id = ?', [id])) };
});

route('PUT', /^\/api\/my-prompts\/([a-z0-9-]+)$/, 'user', async ({ user, m, body }) => {
  const row = await db.get('SELECT * FROM custom_prompts WHERE id = ? AND user_id = ?', [m[1], user.id]);
  if (!row) fail(404, 'prompt', 'Only your own prompts can be edited.');
  const d = validateCustomPrompt(body);
  await db.run('UPDATE custom_prompts SET data = ?, updated_at = ? WHERE id = ?', [JSON.stringify(d), Date.now(), m[1]]);
  return { prompt: customRow(await db.get('SELECT * FROM custom_prompts WHERE id = ?', [m[1]])) };
});

route('DELETE', /^\/api\/my-prompts\/([a-z0-9-]+)$/, 'user', async ({ user, m }) => {
  const r = await db.run('DELETE FROM custom_prompts WHERE id = ? AND user_id = ?', [m[1], user.id]);
  if (!r.changes) fail(404, 'prompt', 'Only your own prompts can be deleted.');
  await db.run('DELETE FROM favorites WHERE prompt_id = ?', [m[1]]);
  return { ok: true };
});

/* Admin */
route('GET', /^\/api\/admin\/metrics$/, 'admin', async ({ query }) => metrics.compute(db, catalog(), query, TZ));

route('GET', /^\/api\/admin\/export\.csv$/, 'admin', async ({ res, query }) => {
  const out = await metrics.exportEvents(db, catalog(), query, TZ);
  send(res, 200, out.body, {
    'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="${out.filename}"`
  });
});

route('GET', /^\/api\/admin\/users$/, 'admin', async () => {
  const rows = await db.all(`SELECT u.id, u.email, u.name, u.team, u.area, u.system, u.active, u.must_change, u.created_at, u.last_login_at, u.last_seen_at,
      (SELECT COUNT(*) FROM events e WHERE e.user_id = u.id AND e.type = 'copy') AS copies,
      (SELECT COUNT(*) FROM events e WHERE e.user_id = u.id AND e.type = 'comment') AS comments,
      (SELECT COALESCE(SUM(active_seconds), 0) FROM visits v WHERE v.user_id = u.id) AS seconds
      FROM users u WHERE u.role = 'user' ORDER BY u.name`);
  return { users: rows.map((r) => Object.assign(r, { active: !!r.active, mustChange: !!r.must_change, minutes: Math.round(r.seconds / 60) })) };
});

route('PATCH', /^\/api\/admin\/users\/(\d+)$/, 'admin', async ({ m, body }) => {
  const id = Number(m[1]);
  const target = await db.get("SELECT * FROM users WHERE id = ? AND role = 'user'", [id]);
  if (!target) fail(404, 'user', 'User not found.');
  const p = validateProfile(body, { partial: true });
  if (body.active !== undefined) p.active = body.active ? 1 : 0;
  const fields = Object.keys(p);
  if (fields.length) await db.run(`UPDATE users SET ${fields.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...fields.map((k) => p[k]), id]);
  if (p.active === 0) await db.run('DELETE FROM auth_sessions WHERE user_id = ?', [id]);
  return { ok: true };
});

route('POST', /^\/api\/admin\/users\/(\d+)\/reset-password$/, 'admin', async ({ m }) => {
  const id = Number(m[1]);
  if (!(await db.get("SELECT 1 AS x FROM users WHERE id = ? AND role = 'user'", [id]))) fail(404, 'user', 'User not found.');
  await db.run('UPDATE users SET password_hash = ?, must_change = 1 WHERE id = ?', [await U.hashPassword(config.defaultPassword), id]);
  await db.run('DELETE FROM auth_sessions WHERE user_id = ?', [id]);
  return { ok: true, initialPassword: config.defaultPassword };
});

route('GET', /^\/(api\/)?healthz$/, null, async () => ({ ok: true, database: db ? db.dialect : null }));

/* ------------------------------------------------------------------ */
/* Request handling                                                    */
/* ------------------------------------------------------------------ */
async function handle(req, res) {
  await ready;
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  try {
    if (initError) fail(503, 'setup', initError.message);
    const r = routes.find((x) => x.method === req.method && x.pattern.test(pathname));
    if (!r) fail(404, 'not_found', 'Unknown API endpoint.');
    const m = pathname.match(r.pattern);

    // Cross-site request protection: browsers cannot add this header cross-origin without a CORS preflight, which this server never allows.
    if (req.method !== 'GET' && req.headers['x-qph'] !== '1') fail(403, 'csrf', 'Missing request header.');

    let user = null;
    if (r.auth) {
      user = await sessionUser(req);
      if (!user) fail(401, 'auth', 'Sign in to continue.');
      if (r.auth === 'admin' && user.role !== 'admin') fail(403, 'forbidden', 'Only the admin can see this.');
      const passwordRoutes = /^\/api\/(me|me\/password|auth\/logout)$/;
      if (config.requirePasswordChange && user.must_change && !passwordRoutes.test(pathname)) {
        fail(403, 'password_change_required', 'Change your initial password to continue.');
      }
    }

    const body = req.method === 'GET' ? {} : await readBody(req);
    const query = Object.fromEntries(url.searchParams);
    const out = await r.handler({ req, res, body, query, user, m });
    if (out !== undefined && !res.headersSent) json(res, 200, out);
  } catch (err) {
    if (res.headersSent) return;
    if (err instanceof HttpError) return json(res, err.status, Object.assign({ error: err.code, message: err.message }, err.extra || {}));
    console.error(err);
    json(res, 500, { error: 'server', message: 'Something went wrong on the server. Try again.' });
  }
}

module.exports = { handle, ready, send, SECURITY_HEADERS, getDb: () => db, getInitError: () => initError };

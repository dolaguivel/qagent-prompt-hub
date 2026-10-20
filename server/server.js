'use strict';
/*
 * QAgent Prompt Hub server: static files + JSON API.
 * No third-party dependencies; requires Node.js 22.13 or later.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const { open, transaction } = require('./db');
const U = require('./util');
const metrics = require('./metrics');

const db = open(config.dbPath);
const TZ = config.reportTimezone;
const catalog = () => U.loadCatalog(config.CATALOG_PATH);
const COOKIE = 'qph_session';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

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
const isHttps = (req) => req.socket.encrypted || (config.trustProxy && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
const clientIp = (req) => (config.trustProxy && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';

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
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(config.adminUsername)) return;
  const { ts, day } = nowParts();
  db.prepare(`INSERT INTO users (email, name, role, password_hash, must_change, created_at, created_day)
              VALUES (?, 'Administrator', 'admin', ?, 1, ?, ?)`).run(config.adminUsername, await U.hashPassword(config.adminPassword), ts, day);
  console.log(`Created the admin account "${config.adminUsername}".`);
}

function createSession(userId) {
  const token = U.randomToken();
  const now = Date.now();
  db.prepare('INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?)')
    .run(U.sha256(token), userId, now, now + config.sessionDays * 86400000, now);
  return token;
}

function sessionUser(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const hash = U.sha256(token);
  const row = db.prepare(`SELECT s.expires_at, s.last_used_at, u.* FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(hash);
  if (!row) return null;
  if (row.expires_at < Date.now() || !row.active) {
    db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(hash);
    return null;
  }
  if (Date.now() - row.last_used_at > 5 * 60000) db.prepare('UPDATE auth_sessions SET last_used_at = ? WHERE token_hash = ?').run(Date.now(), hash);
  row._tokenHash = hash;
  return row;
}

/* Login throttling: 8 failures per account or 30 per address in 15 minutes. */
const failures = new Map();
function throttleKey(kind, key) { return `${kind}:${key}`; }
function tooManyFailures(ip, login) {
  const now = Date.now();
  for (const [k, v] of failures) if (now - v.first > 15 * 60000) failures.delete(k);
  const a = failures.get(throttleKey('login', login));
  const b = failures.get(throttleKey('ip', ip));
  return (a && a.n >= 8) || (b && b.n >= 30);
}
function recordFailure(ip, login) {
  for (const k of [throttleKey('login', login), throttleKey('ip', ip)]) {
    const v = failures.get(k) || { n: 0, first: Date.now() };
    v.n++;
    failures.set(k, v);
  }
}

function domainError() {
  return new HttpError(400, 'domain', `Only corporate @${config.allowedDomain} email addresses can sign in or create an account.`);
}

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

function resolvePrompt(id) {
  if (!id || !ID_RE.test(id)) return null;
  const p = catalog()._byId.get(id);
  if (p) return { category: p.category, stage: p.stage };
  const row = db.prepare('SELECT data FROM custom_prompts WHERE id = ?').get(id);
  if (!row) return null;
  try { const d = JSON.parse(row.data); return { category: d.category, stage: d.stage }; } catch (e) { return null; }
}

function track(user, type, { promptId = null, platform = null, meta = null } = {}) {
  if (!user || user.role === 'admin') return; // the admin's own browsing is not counted
  const { ts, day, hour, dow } = nowParts();
  const p = promptId ? resolvePrompt(promptId) : null;
  const systems = catalogLists().systems;
  const plat = platform && systems.includes(platform) ? platform : (user.system || null);
  db.prepare(`INSERT INTO events (ts, day, hour, dow, user_id, type, prompt_id, category, stage, platform, team, area, meta)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(ts, day, hour, dow, user.id, type, p ? promptId : null, p ? p.category : null, p ? p.stage : null, plat, user.team || null, user.area || null,
      meta ? JSON.stringify(meta).slice(0, 2000) : null);
}

/* Per-prompt community numbers, cached briefly. */
let statsCache = { at: 0, data: null };
function promptStats() {
  if (statsCache.data && Date.now() - statsCache.at < 30000) return statsCache.data;
  const out = {};
  const get = (id) => (out[id] = out[id] || { avg: null, ratings: 0, copies: 0, users: 0, favorites: 0 });
  for (const r of db.prepare('SELECT prompt_id AS id, AVG(stars) AS avg, COUNT(*) AS n FROM ratings GROUP BY prompt_id').all()) Object.assign(get(r.id), { avg: Math.round(r.avg * 10) / 10, ratings: r.n });
  for (const r of db.prepare("SELECT prompt_id AS id, COUNT(*) AS n, COUNT(DISTINCT user_id) AS u FROM events WHERE type = 'copy' AND prompt_id IS NOT NULL GROUP BY prompt_id").all()) Object.assign(get(r.id), { copies: r.n, users: r.u });
  for (const r of db.prepare('SELECT prompt_id AS id, COUNT(*) AS n FROM favorites GROUP BY prompt_id').all()) get(r.id).favorites = r.n;
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

const customRow = (r) => Object.assign(JSON.parse(r.data), { id: r.id, updated: r.updated_at });
const promptExists = (id) => ID_RE.test(String(id || '')) && (catalog()._byId.has(id) || !!db.prepare('SELECT 1 FROM custom_prompts WHERE id = ?').get(id));

/* ------------------------------------------------------------------ */
/* API routes                                                          */
/* ------------------------------------------------------------------ */
const routes = [];
const route = (method, pattern, auth, handler) => routes.push({ method, pattern, auth, handler });

route('GET', /^\/api\/config$/, null, async () => {
  const lists = catalogLists();
  const teams = db.prepare("SELECT DISTINCT team AS v FROM users WHERE role = 'user' AND team IS NOT NULL ORDER BY team").all().map((r) => r.v);
  const suggested = catalog().teams || [];
  return {
    allowedDomain: config.allowedDomain, demo: config.demo, requirePasswordChange: config.requirePasswordChange,
    areas: lists.areas, systems: lists.systems, teams: [...new Set([...suggested, ...teams])].sort()
  };
});

route('POST', /^\/api\/auth\/register$/, null, async ({ req, res, body }) => {
  const email = U.clean(body.email, 160).toLowerCase();
  if (!EMAIL_RE.test(email)) fail(400, 'email', 'Enter a valid email address.');
  if (email.split('@')[1] !== config.allowedDomain) throw domainError();
  const profile = validateProfile(body);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) fail(409, 'exists', 'An account with this email already exists. Sign in instead.');
  const { ts, day } = nowParts();
  const hash = await U.hashPassword(config.defaultPassword);
  const info = db.prepare(`INSERT INTO users (email, name, team, area, system, password_hash, must_change, created_at, created_day, last_login_at, last_seen_at)
                           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`).run(email, profile.name, profile.team, profile.area, profile.system, hash, ts, day, ts, ts);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid));
  track(user, 'register');
  const token = createSession(user.id);
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
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(login);
  const ok = user ? await U.verifyPassword(password, user.password_hash) : (await U.hashPassword(password), false);
  if (!user || !ok) {
    recordFailure(ip, login);
    fail(401, 'credentials', user || login === config.adminUsername
      ? 'That email and password do not match.'
      : 'There is no account for this email yet. Create one first.');
  }
  if (!user.active) fail(403, 'inactive', 'This account is deactivated. Ask the admin to reactivate it.');
  db.prepare('UPDATE users SET last_login_at = ?, last_seen_at = ? WHERE id = ?').run(Date.now(), Date.now(), user.id);
  track(user, 'login');
  const token = createSession(user.id);
  res.setHeader('Set-Cookie', sessionCookie(req, token, config.sessionDays * 86400));
  return { user: publicUser(user) };
});

route('POST', /^\/api\/auth\/logout$/, null, async ({ req, res }) => {
  const token = parseCookies(req)[COOKIE];
  if (token) db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(U.sha256(token));
  res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
  return { ok: true };
});

route('GET', /^\/api\/me$/, 'user', async ({ user }) => {
  const favorites = db.prepare('SELECT prompt_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC').all(user.id).map((r) => r.prompt_id);
  const ratings = {};
  for (const r of db.prepare('SELECT prompt_id, stars, comment FROM ratings WHERE user_id = ?').all(user.id)) ratings[r.prompt_id] = { stars: r.stars, comment: r.comment || '' };
  const usage = {};
  for (const r of db.prepare("SELECT prompt_id, COUNT(*) AS n, MAX(ts) AS last FROM events WHERE user_id = ? AND type = 'copy' AND prompt_id IS NOT NULL GROUP BY prompt_id").all(user.id)) usage[r.prompt_id] = { count: r.n, last: r.last };
  const custom = db.prepare('SELECT * FROM custom_prompts WHERE user_id = ? ORDER BY updated_at DESC').all(user.id).map(customRow);
  return { user: publicUser(user), favorites, ratings, usage, custom, stats: promptStats() };
});

route('PATCH', /^\/api\/me$/, 'user', async ({ user, body }) => {
  const p = validateProfile(body, { partial: true });
  const fields = Object.keys(p);
  if (!fields.length) return { user: publicUser(user) };
  db.prepare(`UPDATE users SET ${fields.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...fields.map((k) => p[k]), user.id);
  return { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) };
});

route('POST', /^\/api\/me\/password$/, 'user', async ({ user, body }) => {
  const current = String(body.current || '');
  const next = String(body.next || '');
  if (!(await U.verifyPassword(current, user.password_hash))) fail(400, 'current', 'Your current password is not correct.');
  if (next.length < 8) fail(400, 'next', 'Use at least 8 characters.');
  if (next === config.defaultPassword || next === config.adminPassword || next === current) fail(400, 'next', 'Choose a password different from the initial one.');
  db.prepare('UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?').run(await U.hashPassword(next), user.id);
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ? AND token_hash <> ?').run(user.id, user._tokenHash);
  track(user, 'password_change');
  return { ok: true };
});

route('GET', /^\/api\/stats$/, 'user', async () => promptStats());

route('PUT', /^\/api\/favorites\/([a-z0-9-]+)$/, 'user', async ({ user, m }) => {
  if (!promptExists(m[1])) fail(404, 'prompt', 'That prompt does not exist.');
  const r = db.prepare('INSERT OR IGNORE INTO favorites (user_id, prompt_id, created_at) VALUES (?, ?, ?)').run(user.id, m[1], Date.now());
  if (r.changes) { track(user, 'favorite', { promptId: m[1] }); invalidateStats(); }
  return { ok: true };
});

route('DELETE', /^\/api\/favorites\/([a-z0-9-]+)$/, 'user', async ({ user, m }) => {
  const r = db.prepare('DELETE FROM favorites WHERE user_id = ? AND prompt_id = ?').run(user.id, m[1]);
  if (r.changes) { track(user, 'unfavorite', { promptId: m[1] }); invalidateStats(); }
  return { ok: true };
});

route('PUT', /^\/api\/ratings\/([a-z0-9-]+)$/, 'user', async ({ user, m, body }) => {
  if (!promptExists(m[1])) fail(404, 'prompt', 'That prompt does not exist.');
  const stars = Number(body.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) fail(400, 'stars', 'Choose from 1 to 5 stars.');
  const comment = String(body.comment || '').replace(/\r\n/g, '\n').trim().slice(0, 1000) || null;
  const { ts, day } = nowParts();
  db.prepare(`INSERT INTO ratings (user_id, prompt_id, stars, comment, created_at, updated_at, updated_day) VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (user_id, prompt_id) DO UPDATE SET stars = excluded.stars, comment = excluded.comment, updated_at = excluded.updated_at, updated_day = excluded.updated_day`)
    .run(user.id, m[1], stars, comment, ts, ts, day);
  track(user, 'rate', { promptId: m[1], meta: { stars } });
  invalidateStats();
  return { ok: true, stats: promptStats()[m[1]] };
});

route('DELETE', /^\/api\/ratings\/([a-z0-9-]+)$/, 'user', async ({ user, m }) => {
  db.prepare('DELETE FROM ratings WHERE user_id = ? AND prompt_id = ?').run(user.id, m[1]);
  invalidateStats();
  return { ok: true, stats: promptStats()[m[1]] || null };
});

const CLIENT_EVENTS = new Set(['view', 'copy', 'search', 'share', 'download']);
route('POST', /^\/api\/events$/, 'user', async ({ user, body }) => {
  const list = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  transaction(db, () => {
    for (const ev of list) {
      if (!ev || !CLIENT_EVENTS.has(ev.type)) continue;
      const meta = ev.meta && typeof ev.meta === 'object' ? ev.meta : null;
      if (meta && meta.q) meta.q = U.clean(meta.q, 100);
      track(user, ev.type, { promptId: ev.promptId || null, platform: ev.platform || null, meta });
    }
  });
  if (list.some((e) => e && e.type === 'copy')) invalidateStats();
  return { ok: true };
});

route('POST', /^\/api\/heartbeat$/, 'user', async ({ user, body }) => {
  if (user.role === 'admin') return { ok: true };
  const id = String(body.visitId || '');
  if (!/^[a-z0-9-]{8,40}$/i.test(id)) fail(400, 'visit', 'Invalid visit id.');
  const seconds = Math.max(0, Math.min(120, Math.round(Number(body.seconds) || 0)));
  const { ts, day } = nowParts();
  db.prepare(`INSERT INTO visits (id, user_id, day, started_at, last_seen_at, active_seconds, team, area, system) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET active_seconds = active_seconds + excluded.active_seconds, last_seen_at = excluded.last_seen_at
              WHERE visits.user_id = excluded.user_id`)
    .run(id, user.id, day, ts, ts, seconds, user.team, user.area, user.system);
  db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(ts, user.id);
  return { ok: true };
});

route('POST', /^\/api\/my-prompts$/, 'user', async ({ user, body }) => {
  const d = validateCustomPrompt(body);
  if (db.prepare('SELECT COUNT(*) AS n FROM custom_prompts WHERE user_id = ?').get(user.id).n >= 200) fail(400, 'limit', 'You can keep up to 200 prompts.');
  const id = `my-${U.slugify(d.title).slice(0, 40)}-${U.randomToken().replace(/[^a-z0-9]/gi, '').slice(0, 6).toLowerCase()}`;
  const now = Date.now();
  db.prepare('INSERT INTO custom_prompts (id, user_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, user.id, JSON.stringify(d), now, now);
  track(user, 'prompt_create', { promptId: id });
  return { prompt: customRow(db.prepare('SELECT * FROM custom_prompts WHERE id = ?').get(id)) };
});

route('PUT', /^\/api\/my-prompts\/([a-z0-9-]+)$/, 'user', async ({ user, m, body }) => {
  const row = db.prepare('SELECT * FROM custom_prompts WHERE id = ? AND user_id = ?').get(m[1], user.id);
  if (!row) fail(404, 'prompt', 'Only your own prompts can be edited.');
  const d = validateCustomPrompt(body);
  db.prepare('UPDATE custom_prompts SET data = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(d), Date.now(), m[1]);
  return { prompt: customRow(db.prepare('SELECT * FROM custom_prompts WHERE id = ?').get(m[1])) };
});

route('DELETE', /^\/api\/my-prompts\/([a-z0-9-]+)$/, 'user', async ({ user, m }) => {
  const r = db.prepare('DELETE FROM custom_prompts WHERE id = ? AND user_id = ?').run(m[1], user.id);
  if (!r.changes) fail(404, 'prompt', 'Only your own prompts can be deleted.');
  db.prepare('DELETE FROM favorites WHERE prompt_id = ?').run(m[1]);
  return { ok: true };
});

/* Admin */
route('GET', /^\/api\/admin\/metrics$/, 'admin', async ({ query }) => metrics.compute(db, catalog(), query, TZ));

route('GET', /^\/api\/admin\/export\.csv$/, 'admin', async ({ res, query }) => {
  const out = metrics.exportEvents(db, catalog(), query, TZ);
  send(res, 200, out.body, {
    'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="${out.filename}"`
  });
  return undefined;
});

route('GET', /^\/api\/admin\/users$/, 'admin', async () => {
  const rows = db.prepare(`SELECT u.id, u.email, u.name, u.team, u.area, u.system, u.active, u.must_change, u.created_at, u.last_login_at, u.last_seen_at,
      (SELECT COUNT(*) FROM events e WHERE e.user_id = u.id AND e.type = 'copy') AS copies,
      (SELECT COALESCE(SUM(active_seconds), 0) FROM visits v WHERE v.user_id = u.id) AS seconds
      FROM users u WHERE u.role = 'user' ORDER BY u.name`).all();
  return { users: rows.map((r) => Object.assign(r, { active: !!r.active, mustChange: !!r.must_change, minutes: Math.round(r.seconds / 60) })) };
});

route('PATCH', /^\/api\/admin\/users\/(\d+)$/, 'admin', async ({ m, body }) => {
  const id = Number(m[1]);
  const target = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'user'").get(id);
  if (!target) fail(404, 'user', 'User not found.');
  const p = validateProfile(body, { partial: true });
  if (body.active !== undefined) p.active = body.active ? 1 : 0;
  const fields = Object.keys(p);
  if (fields.length) db.prepare(`UPDATE users SET ${fields.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...fields.map((k) => p[k]), id);
  if (p.active === 0) db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(id);
  return { ok: true };
});

route('POST', /^\/api\/admin\/users\/(\d+)\/reset-password$/, 'admin', async ({ m }) => {
  const id = Number(m[1]);
  if (!db.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'user'").get(id)) fail(404, 'user', 'User not found.');
  db.prepare('UPDATE users SET password_hash = ?, must_change = 1 WHERE id = ?').run(await U.hashPassword(config.defaultPassword), id);
  db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(id);
  return { ok: true, initialPassword: config.defaultPassword };
});

route('GET', /^\/healthz$/, null, async () => ({ ok: true }));

/* ------------------------------------------------------------------ */
/* Static files                                                        */
/* ------------------------------------------------------------------ */
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(config.PUBLIC_DIR, rel));
  if (!file.startsWith(config.PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain' });
  let stat;
  try { stat = fs.statSync(file); } catch (e) { stat = null; }
  if (!stat || !stat.isFile()) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
  const ext = path.extname(file).toLowerCase();
  const lastModified = stat.mtime.toUTCString();
  const headers = {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Last-Modified': lastModified,
    'Cache-Control': ext === '.png' ? 'public, max-age=86400' : 'no-cache'
  };
  if (req.headers['if-modified-since'] === lastModified) return send(res, 304, '', headers);
  res.writeHead(200, Object.assign({}, SECURITY_HEADERS, headers, { 'Content-Length': stat.size }));
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

/* ------------------------------------------------------------------ */
/* Request handling                                                    */
/* ------------------------------------------------------------------ */
async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (!pathname.startsWith('/api/') && pathname !== '/healthz') {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return serveStatic(req, res, pathname);
  }

  try {
    const r = routes.find((x) => x.method === req.method && x.pattern.test(pathname));
    if (!r) fail(404, 'not_found', 'Unknown API endpoint.');
    const m = pathname.match(r.pattern);

    // Cross-site request protection: browsers cannot add this header cross-origin without a CORS preflight, which this server never allows.
    if (req.method !== 'GET' && req.headers['x-qph'] !== '1') fail(403, 'csrf', 'Missing request header.');

    let user = null;
    if (r.auth) {
      user = sessionUser(req);
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
    if (err instanceof HttpError) return json(res, err.status, Object.assign({ error: err.code, message: err.message }, err.extra || {}));
    console.error(err);
    json(res, 500, { error: 'server', message: 'Something went wrong on the server. Try again.' });
  }
}

async function start() {
  catalog(); // fail fast if the catalog has a syntax error
  await ensureAdmin();
  const server = http.createServer((req, res) => { handle(req, res); });
  server.listen(config.port, config.host, () => {
    console.log(`QAgent Prompt Hub running at http://localhost:${config.port}`);
    console.log(`Database: ${config.dbPath}${config.demo ? ' (demo data)' : ''}`);
  });
  const shutdown = () => { server.close(() => { db.close(); process.exit(0); }); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) start();

module.exports = { db, start };

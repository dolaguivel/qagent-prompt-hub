'use strict';
/*
 * Admin reporting. Every query honours the same filters:
 *   from, to (YYYY-MM-DD, reporting time zone), team, area, system,
 *   category, stage, user.
 * Category and stage only apply to prompt activity; time in app is not
 * tied to a prompt, so it ignores them.
 */
const { dayParts } = require('./util');

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const toUTC = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (d, n) => fromUTC(toUTC(d) + n * 86400000);
const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000) + 1;

function parseFilters(q, tz) {
  const today = dayParts(Date.now(), tz).day;
  let to = DAY_RE.test(q.to || '') ? q.to : today;
  let from = DAY_RE.test(q.from || '') ? q.from : addDays(to, -29);
  if (from > to) [from, to] = [to, from];
  if (daysBetween(from, to) > 731) from = addDays(to, -730);
  const s = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null);
  const user = /^\d+$/.test(q.user || '') ? Number(q.user) : null;
  return { from, to, team: s(q.team), area: s(q.area), system: s(q.system), category: s(q.category), stage: s(q.stage), user };
}

/* WHERE builders */
function eventsWhere(f, { prompt = true, range = [f.from, f.to] } = {}) {
  const w = ['e.day BETWEEN ? AND ?'];
  const p = [range[0], range[1]];
  if (f.team) { w.push('e.team = ?'); p.push(f.team); }
  if (f.area) { w.push('e.area = ?'); p.push(f.area); }
  if (f.system) { w.push('e.platform = ?'); p.push(f.system); }
  if (f.user) { w.push('e.user_id = ?'); p.push(f.user); }
  if (prompt && f.category) { w.push('e.category = ?'); p.push(f.category); }
  if (prompt && f.stage) { w.push('e.stage = ?'); p.push(f.stage); }
  return { sql: 'WHERE ' + w.join(' AND '), params: p };
}
function visitsWhere(f, range = [f.from, f.to]) {
  const w = ['v.day BETWEEN ? AND ?'];
  const p = [range[0], range[1]];
  if (f.team) { w.push('v.team = ?'); p.push(f.team); }
  if (f.area) { w.push('v.area = ?'); p.push(f.area); }
  if (f.system) { w.push('v.system = ?'); p.push(f.system); }
  if (f.user) { w.push('v.user_id = ?'); p.push(f.user); }
  return { sql: 'WHERE ' + w.join(' AND '), params: p };
}
function usersWhere(f, alias = 'u') {
  const w = [`${alias}.role = 'user'`];
  const p = [];
  if (f.team) { w.push(`${alias}.team = ?`); p.push(f.team); }
  if (f.area) { w.push(`${alias}.area = ?`); p.push(f.area); }
  if (f.system) { w.push(`${alias}.system = ?`); p.push(f.system); }
  if (f.user) { w.push(`${alias}.id = ?`); p.push(f.user); }
  return { sql: w.join(' AND '), params: p };
}

function promptInfo(db, catalog) {
  const map = new Map();
  for (const p of catalog.prompts) map.set(p.id, { title: p.title, category: p.category, stage: p.stage, custom: false });
  for (const row of db.prepare('SELECT c.id, c.data, u.name FROM custom_prompts c JOIN users u ON u.id = c.user_id').all()) {
    try {
      const d = JSON.parse(row.data);
      map.set(row.id, { title: d.title, category: d.category, stage: d.stage, custom: true, author: row.name });
    } catch (e) { /* skip corrupt rows */ }
  }
  return map;
}

function kpiBlock(db, f, range) {
  const ew = eventsWhere(f, { range });
  const vw = visitsWhere(f, range);
  const e = db.prepare(`SELECT COUNT(DISTINCT e.user_id) AS active,
      COALESCE(SUM(e.type = 'copy'), 0) AS copies,
      COALESCE(SUM(e.type = 'view'), 0) AS views
    FROM events e ${ew.sql}`).get(...ew.params);
  const v = db.prepare(`SELECT COALESCE(SUM(v.active_seconds), 0) AS seconds, COUNT(*) AS visits, COUNT(DISTINCT v.user_id) AS users
    FROM visits v ${vw.sql}`).get(...vw.params);
  return { active: e.active, copies: e.copies, views: e.views, seconds: v.seconds, visits: v.visits, visitUsers: v.users };
}

function compute(db, catalog, query, tz) {
  const f = parseFilters(query, tz);
  const info = promptInfo(db, catalog);
  const n = daysBetween(f.from, f.to);
  const prev = [addDays(f.from, -n), addDays(f.from, -1)];
  const ew = eventsWhere(f);
  const vw = visitsWhere(f);
  const uw = usersWhere(f);

  const promptMatches = (id) => {
    if (!f.category && !f.stage) return true;
    const pi = info.get(id);
    if (!pi) return false;
    return (!f.category || pi.category === f.category) && (!f.stage || pi.stage === f.stage);
  };

  /* KPIs with previous-period comparison */
  const cur = kpiBlock(db, f, [f.from, f.to]);
  const before = kpiBlock(db, f, prev);

  const ratingsInRange = db.prepare(`SELECT r.prompt_id, r.stars, r.comment, r.updated_at, u.id AS user_id, u.name, u.team
      FROM ratings r JOIN users u ON u.id = r.user_id
      WHERE r.updated_day BETWEEN ? AND ? AND ${uw.sql}
      ORDER BY r.updated_at DESC`).all(f.from, f.to, ...uw.params).filter((r) => promptMatches(r.prompt_id));
  const avgRating = ratingsInRange.length ? ratingsInRange.reduce((s, r) => s + r.stars, 0) / ratingsInRange.length : null;

  const newUsers = db.prepare(`SELECT COUNT(*) AS n FROM users u WHERE u.created_day BETWEEN ? AND ? AND ${uw.sql}`)
    .get(f.from, f.to, ...uw.params).n;
  const registered = db.prepare(`SELECT COUNT(*) AS n FROM users u WHERE u.active = 1 AND ${uw.sql}`).get(...uw.params).n;

  /* Daily trend */
  const evDays = new Map(db.prepare(`SELECT e.day, COALESCE(SUM(e.type = 'copy'), 0) AS copies, COALESCE(SUM(e.type = 'view'), 0) AS views,
      COUNT(DISTINCT e.user_id) AS users FROM events e ${ew.sql} GROUP BY e.day`).all(...ew.params).map((r) => [r.day, r]));
  const viDays = new Map(db.prepare(`SELECT v.day, SUM(v.active_seconds) AS seconds FROM visits v ${vw.sql} GROUP BY v.day`)
    .all(...vw.params).map((r) => [r.day, r.seconds]));
  const trend = [];
  for (let d = f.from; d <= f.to; d = addDays(d, 1)) {
    const r = evDays.get(d) || {};
    trend.push({ day: d, copies: r.copies || 0, views: r.views || 0, users: r.users || 0, minutes: Math.round((viDays.get(d) || 0) / 60) });
  }

  /* Prompts */
  const usage = new Map(db.prepare(`SELECT e.prompt_id AS id, COALESCE(SUM(e.type = 'view'), 0) AS views, COALESCE(SUM(e.type = 'copy'), 0) AS copies,
      COUNT(DISTINCT CASE WHEN e.type = 'copy' THEN e.user_id END) AS users, MAX(CASE WHEN e.type = 'copy' THEN e.ts END) AS last
      FROM events e ${ew.sql} AND e.prompt_id IS NOT NULL GROUP BY e.prompt_id`).all(...ew.params).map((r) => [r.id, r]));
  const allRatings = new Map(db.prepare('SELECT prompt_id AS id, AVG(stars) AS avg, COUNT(*) AS n FROM ratings GROUP BY prompt_id').all().map((r) => [r.id, r]));
  const favCounts = new Map(db.prepare('SELECT prompt_id AS id, COUNT(*) AS n FROM favorites GROUP BY prompt_id').all().map((r) => [r.id, r.n]));
  const promptIds = new Set([...catalog.prompts.map((p) => p.id), ...usage.keys()]);
  const prompts = [];
  for (const id of promptIds) {
    const pi = info.get(id) || { title: id, category: null, stage: null, custom: true };
    if (!promptMatches(id) && !usage.has(id)) continue;
    if (pi.custom && !usage.has(id)) continue;
    const u = usage.get(id) || {};
    const r = allRatings.get(id);
    prompts.push({
      id, title: pi.title, category: pi.category, stage: pi.stage, custom: pi.custom, author: pi.author || null,
      views: u.views || 0, copies: u.copies || 0, users: u.users || 0, last: u.last || null,
      rating: r ? Math.round(r.avg * 10) / 10 : null, ratings: r ? r.n : 0, favorites: favCounts.get(id) || 0
    });
  }
  prompts.sort((a, b) => b.copies - a.copies || b.views - a.views || a.title.localeCompare(b.title));

  /* Breakdowns */
  const breakdown = (col, visitCol, userCol) => {
    const ev = db.prepare(`SELECT ${col} AS key, COUNT(DISTINCT e.user_id) AS active, COALESCE(SUM(e.type = 'copy'), 0) AS copies,
        COALESCE(SUM(e.type = 'view'), 0) AS views FROM events e ${ew.sql} GROUP BY ${col}`).all(...ew.params);
    const vi = visitCol ? new Map(db.prepare(`SELECT ${visitCol} AS key, SUM(v.active_seconds) AS seconds FROM visits v ${vw.sql} GROUP BY ${visitCol}`)
      .all(...vw.params).map((r) => [r.key, r.seconds])) : new Map();
    const us = userCol ? new Map(db.prepare(`SELECT ${userCol} AS key, COUNT(*) AS n FROM users u WHERE u.active = 1 AND ${uw.sql} GROUP BY ${userCol}`)
      .all(...uw.params).map((r) => [r.key, r.n])) : new Map();
    const keys = new Set([...ev.map((r) => r.key), ...vi.keys(), ...us.keys()]);
    const evMap = new Map(ev.map((r) => [r.key, r]));
    return [...keys].filter((k) => k != null && k !== '').map((k) => {
      const r = evMap.get(k) || {};
      const seconds = vi.get(k) || 0;
      return { key: k, registered: us.get(k) || 0, active: r.active || 0, copies: r.copies || 0, views: r.views || 0, minutes: Math.round(seconds / 60), avgMinutes: r.active ? Math.round(seconds / 60 / r.active) : 0 };
    }).sort((a, b) => b.copies - a.copies || b.minutes - a.minutes || String(a.key).localeCompare(String(b.key)));
  };
  const byTeam = breakdown('e.team', 'v.team', 'u.team');
  const byArea = breakdown('e.area', 'v.area', 'u.area');
  const bySystem = breakdown('e.platform', 'v.system', 'u.system');
  const byCategory = breakdown('e.category', null, null);
  const byStage = breakdown('e.stage', null, null);

  /* People */
  const evUser = new Map(db.prepare(`SELECT e.user_id AS id, COALESCE(SUM(e.type = 'copy'), 0) AS copies, COALESCE(SUM(e.type = 'view'), 0) AS views,
      COUNT(DISTINCT e.prompt_id) AS prompts, MAX(e.ts) AS last FROM events e ${ew.sql} GROUP BY e.user_id`).all(...ew.params).map((r) => [r.id, r]));
  const viUser = new Map(db.prepare(`SELECT v.user_id AS id, SUM(v.active_seconds) AS seconds, COUNT(*) AS visits FROM visits v ${vw.sql} GROUP BY v.user_id`)
    .all(...vw.params).map((r) => [r.id, r]));
  const favUser = new Map(db.prepare('SELECT user_id AS id, COUNT(*) AS n FROM favorites GROUP BY user_id').all().map((r) => [r.id, r.n]));
  const ratUser = new Map(db.prepare('SELECT user_id AS id, COUNT(*) AS n FROM ratings GROUP BY user_id').all().map((r) => [r.id, r.n]));
  const people = db.prepare(`SELECT u.id, u.name, u.email, u.team, u.area, u.system, u.active, u.created_at, u.last_seen_at FROM users u WHERE ${uw.sql}`)
    .all(...uw.params).map((u) => {
      const e = evUser.get(u.id) || {};
      const v = viUser.get(u.id) || {};
      return {
        id: u.id, name: u.name, email: u.email, team: u.team, area: u.area, system: u.system, active: !!u.active,
        copies: e.copies || 0, views: e.views || 0, prompts: e.prompts || 0, minutes: Math.round((v.seconds || 0) / 60), visits: v.visits || 0,
        favorites: favUser.get(u.id) || 0, ratings: ratUser.get(u.id) || 0, lastSeen: u.last_seen_at || e.last || null, createdAt: u.created_at
      };
    }).sort((a, b) => b.copies - a.copies || b.minutes - a.minutes || a.name.localeCompare(b.name));

  /* When people use it */
  const heat = db.prepare(`SELECT e.dow, e.hour, COUNT(*) AS n FROM events e ${ew.sql} AND e.type = 'copy' GROUP BY e.dow, e.hour`).all(...ew.params);

  /* Searches */
  const searchRows = db.prepare(`SELECT e.meta FROM events e ${eventsWhere(f, { prompt: false }).sql} AND e.type = 'search' ORDER BY e.ts DESC LIMIT 20000`)
    .all(...eventsWhere(f, { prompt: false }).params);
  const sMap = new Map();
  for (const r of searchRows) {
    let m;
    try { m = JSON.parse(r.meta || '{}'); } catch (e) { continue; }
    const q = String(m.q || '').toLowerCase().trim();
    if (q.length < 2) continue;
    const s = sMap.get(q) || { q, count: 0, zero: 0 };
    s.count++;
    if (!m.results) s.zero++;
    sMap.set(q, s);
  }
  const searches = [...sMap.values()].sort((a, b) => b.count - a.count).slice(0, 50);
  const zeroResults = [...sMap.values()].filter((s) => s.zero > 0).sort((a, b) => b.zero - a.zero).slice(0, 30);

  /* Feedback */
  const feedback = ratingsInRange.filter((r) => r.comment).slice(0, 100).map((r) => ({
    promptId: r.prompt_id, title: (info.get(r.prompt_id) || {}).title || r.prompt_id, stars: r.stars, comment: r.comment, at: r.updated_at, user: r.name, team: r.team
  }));
  const ratingDist = [1, 2, 3, 4, 5].map((s) => ({ stars: s, n: ratingsInRange.filter((r) => r.stars === s).length }));

  /* Filter options */
  const distinct = (sql) => db.prepare(sql).all().map((r) => r.v).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)));
  const options = {
    teams: distinct("SELECT DISTINCT team AS v FROM users WHERE role = 'user' UNION SELECT DISTINCT team AS v FROM events"),
    areas: distinct("SELECT DISTINCT area AS v FROM users WHERE role = 'user' UNION SELECT DISTINCT area AS v FROM events"),
    users: db.prepare("SELECT id, name, team FROM users WHERE role = 'user' ORDER BY name").all()
  };

  return {
    filters: f,
    generatedAt: Date.now(),
    previous: { from: prev[0], to: prev[1] },
    kpis: {
      activeUsers: cur.active, activeUsersPrev: before.active,
      copies: cur.copies, copiesPrev: before.copies,
      views: cur.views, viewsPrev: before.views,
      minutes: Math.round(cur.seconds / 60), minutesPrev: Math.round(before.seconds / 60),
      visits: cur.visits, visitsPrev: before.visits,
      avgMinutesPerUser: cur.visitUsers ? Math.round(cur.seconds / 60 / cur.visitUsers) : 0,
      avgRating, ratingsCount: ratingsInRange.length,
      newUsers, registered,
      copyRate: cur.views ? cur.copies / cur.views : null
    },
    trend, prompts, byTeam, byArea, bySystem, byCategory, byStage, people, heat,
    searches, zeroResults, feedback, ratingDist, options
  };
}

/* Raw events for the CSV export */
function exportEvents(db, catalog, query, tz) {
  const f = parseFilters(query, tz);
  const info = promptInfo(db, catalog);
  const ew = eventsWhere(f);
  const rows = db.prepare(`SELECT e.ts, e.day, e.type, e.prompt_id, e.category, e.stage, e.platform, e.team, e.area, e.meta, u.name, u.email
      FROM events e JOIN users u ON u.id = e.user_id ${ew.sql} ORDER BY e.ts LIMIT 200000`).all(...ew.params);
  const header = ['timestamp_utc', 'day', 'user', 'email', 'team', 'area', 'event', 'prompt_id', 'prompt', 'category', 'stage', 'system', 'details'];
  const csvCell = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // keep spreadsheets from evaluating cells
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([new Date(r.ts).toISOString(), r.day, r.name, r.email, r.team, r.area, r.type, r.prompt_id,
      r.prompt_id ? (info.get(r.prompt_id) || {}).title : '', r.category, r.stage, r.platform, r.meta].map(csvCell).join(','));
  }
  return { filename: `qagent-prompt-hub-events_${f.from}_${f.to}.csv`, body: '﻿' + lines.join('\r\n') };
}

module.exports = { compute, exportEvents, parseFilters };

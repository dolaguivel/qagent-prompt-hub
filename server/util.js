'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  try {
    const [algo, N, r, p, saltB64, keyB64] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const expected = Buffer.from(keyB64, 'base64');
    const key = await scrypt(String(password), Buffer.from(saltB64, 'base64'), expected.length, { N: +N, r: +r, p: +p });
    return crypto.timingSafeEqual(key, expected);
  } catch (e) {
    return false;
  }
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

/* Calendar parts of a timestamp in the reporting time zone. */
const partFormatters = new Map();
function dayParts(ts, timeZone) {
  let f = partFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
    partFormatters.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, dow };
}

/* Loads data/prompts.js (a browser script) and returns window.QPH_DATA. */
let catalogCache = { mtime: 0, data: null };
function loadCatalog(file) {
  const stat = fs.statSync(file);
  if (catalogCache.data && stat.mtimeMs === catalogCache.mtime) return catalogCache.data;
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { timeout: 2000, filename: file });
  const data = sandbox.window.QPH_DATA;
  if (!data || !Array.isArray(data.prompts)) throw new Error('Catalog file did not define window.QPH_DATA.prompts');
  data._byId = new Map(data.prompts.map((p) => [p.id, p]));
  catalogCache = { mtime: stat.mtimeMs, data };
  return data;
}

function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'prompt';
}

const clean = (v, max = 200) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

module.exports = { hashPassword, verifyPassword, sha256, randomToken, dayParts, loadCatalog, slugify, clean };

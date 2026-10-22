/* QAgent Prompt Hub — application logic (vanilla JS, no build step) */
(function () {
  'use strict';

  // The catalog is inlined in the local edition. On a server it holds internal details
  // (repositories, tables), so it is loaded from /api/catalog.js only after sign-in.
  let D = null;
  const view = document.getElementById('view');
  // Local edition: the one-file HTML build sets QPH_LOCAL and keeps everything in this browser.
  const LOCAL = !!window.QPH_LOCAL;
  const ASSET = Object.assign({ logo: 'assets/img/qualifacts-logo.png', mark: 'assets/img/qualifacts-mark.png' }, window.QPH_ASSETS || {});

  /* ================= Helpers ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name, cls) => `<svg class="i ${cls || ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const plural = (n, one, many) => `${Number(n).toLocaleString('en-US')} ${n === 1 ? one : (many || one + 's')}`;
  const num = (n) => Number(n || 0).toLocaleString('en-US');
  const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'prompt';
  const qs = (obj) => { const u = new URLSearchParams(); Object.keys(obj).forEach((k) => { if (obj[k] !== '' && obj[k] != null) u.set(k, obj[k]); }); const s = u.toString(); return s ? '?' + s : ''; };
  const fmtDate = (iso) => { try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return iso; } };
  const rtf = typeof Intl.RelativeTimeFormat === 'function' ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }) : null;
  function timeAgo(ts) {
    if (!ts) return 'never';
    const s = (ts - Date.now()) / 1000;
    const a = Math.abs(s);
    if (!rtf) return new Date(ts).toLocaleDateString('en-US');
    if (a < 60) return 'just now';
    if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
    if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
    if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const randomId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  /* ================= API ================= */
  async function api(method, path, body) {
    if (LOCAL) return localApi(method, path, body);
    const opts = { method, headers: { 'X-QPH': '1' }, credentials: 'same-origin' };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res;
    try { res = await fetch(path, opts); } catch (e) {
      const err = new Error('Cannot reach the server. Check your connection and try again.'); err.code = 'network'; throw err;
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const err = new Error((data && data.message) || `Request failed (${res.status}).`);
      err.code = (data && data.error) || 'http';
      err.status = res.status;
      if (res.status === 401 && !path.startsWith('/api/auth') && state.user) onSignedOut('Your session ended. Sign in again.');
      if (err.code === 'password_change_required' && state.user) showAuth('change', { forced: true });
      throw err;
    }
    return data;
  }

  /* ================= Local storage (per user) ================= */
  const store = (() => {
    let ok = false;
    try { localStorage.setItem('qph:__t', '1'); localStorage.removeItem('qph:__t'); ok = true; } catch (e) { ok = false; }
    const mem = {};
    return {
      get(k, d) { try { const raw = ok ? localStorage.getItem('qph:' + k) : mem[k]; return raw == null ? d : JSON.parse(raw); } catch (e) { return d; } },
      set(k, v) { const raw = JSON.stringify(v); try { if (ok) localStorage.setItem('qph:' + k, raw); else mem[k] = raw; } catch (e) { mem[k] = raw; } },
      raw(k) { try { return ok ? localStorage.getItem('qph:' + k) : null; } catch (e) { return null; } },
      setRaw(k, v) { try { if (ok) localStorage.setItem('qph:' + k, v); } catch (e) { /* ignore */ } },
      remove(k) { delete mem[k]; try { if (ok) localStorage.removeItem('qph:' + k); } catch (e) { /* ignore */ } }
    };
  })();
  const userKey = (k) => `u${state.user ? state.user.id : 0}:${k}`;

  /* ================= Local edition: browser-only API ================= */
  const LOCAL_USER = { id: 0, name: '', email: '', role: 'user', team: null, area: null, system: null, mustChange: false };
  function localLoad() {
    const d = store.get('local:data', null) || {};
    return {
      favorites: Array.isArray(d.favorites) ? d.favorites : [],
      ratings: d.ratings && typeof d.ratings === 'object' ? d.ratings : {},
      usage: d.usage && typeof d.usage === 'object' ? d.usage : {},
      custom: Array.isArray(d.custom) ? d.custom : [],
      contacts: Array.isArray(d.contacts) ? d.contacts : [],
      prefs: d.prefs && typeof d.prefs === 'object' ? d.prefs : {}
    };
  }
  const localSave = (d) => store.set('local:data', d);
  function localStats(d) {
    const out = {};
    const get = (id) => (out[id] = out[id] || { avg: null, ratings: 0, copies: 0, users: 0, favorites: 0 });
    Object.keys(d.ratings).forEach((id) => { const s = get(id); s.avg = d.ratings[id].stars; s.ratings = 1; });
    Object.keys(d.usage).forEach((id) => { const s = get(id); s.copies = d.usage[id].count || 0; s.users = s.copies ? 1 : 0; });
    d.favorites.forEach((id) => { get(id).favorites = 1; });
    return out;
  }
  function localFail(code, message) { const e = new Error(message); e.code = code; e.status = 400; throw e; }
  function localPrompt(body) {
    const p = {
      title: String(body.title || '').trim().slice(0, 120),
      description: String(body.description || '').trim().slice(0, 300),
      category: catById[body.category] ? body.category : '',
      stage: stageById[body.stage] ? body.stage : '',
      tags: Array.isArray(body.tags) ? body.tags.map((t) => String(t).trim().slice(0, 30)).filter(Boolean).slice(0, 10) : [],
      ticket: ['required', 'optional', 'none'].includes(body.ticket) ? body.ticket : 'optional',
      template: String(body.template || '').replace(/\r\n/g, '\n').trim().slice(0, 20000)
    };
    if (p.title.length < 3) localFail('title', 'Add a title.');
    if (!p.template) localFail('template', 'Write the prompt text.');
    if (!p.category) localFail('category', 'Choose a category.');
    if (!p.stage) localFail('stage', 'Choose a PDLC stage.');
    return p;
  }
  async function localApi(method, path, body) {
    body = body || {};
    const d = localLoad();
    const m = path.match(/^\/api\/(favorites|ratings|my-prompts|contacts)\/([a-z0-9-]+)$/);
    const id = m ? m[2] : null;
    switch (method + ' ' + (m ? `/api/${m[1]}/:id` : path)) {
      case 'GET /api/config':
        return { allowedDomain: 'qualifacts.com', demo: false, requirePasswordChange: false, areas: D.areas || [], systems: D.platforms.map((p) => p.name), teams: D.teams || [], promptCount: D.prompts.length, appName: D.meta.appName, version: D.meta.version, updated: D.meta.updated };
      case 'GET /api/contacts':
        return { team: [], mine: d.contacts.slice().sort((a, b) => a.name.localeCompare(b.name)), canEditTeam: false };
      case 'POST /api/contacts': {
        const name = String(body.name || '').replace(/^@+/, '').replace(/\s+/g, ' ').trim().slice(0, 80);
        if (name.length < 2) localFail('name', 'Enter the person’s full name.');
        const email = String(body.email || '').trim().slice(0, 160);
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) localFail('email', 'Enter a valid email address or leave it empty.');
        if (d.contacts.some((c) => c.name.toLowerCase() === name.toLowerCase())) localFail('exists', `${name} is already in your list.`);
        if (d.contacts.length >= 300) localFail('limit', 'This list is full. Remove someone first.');
        const contact = { id: Date.now() + Math.floor(Math.random() * 1000), name, email, role: String(body.role || '').trim().slice(0, 80) };
        d.contacts.push(contact);
        localSave(d);
        return { contact, scope: 'mine' };
      }
      case 'DELETE /api/contacts/:id':
        d.contacts = d.contacts.filter((c) => String(c.id) !== String(id));
        localSave(d);
        return { ok: true };
      case 'GET /api/me/prefs/comment':
        return { data: d.prefs.comment || {} };
      case 'PUT /api/me/prefs/comment':
        d.prefs.comment = body.data && typeof body.data === 'object' ? body.data : {};
        localSave(d);
        return { ok: true };
      case 'GET /api/me':
        return { user: Object.assign({}, LOCAL_USER), favorites: d.favorites, ratings: d.ratings, usage: d.usage, custom: d.custom, stats: localStats(d) };
      case 'GET /api/stats':
        return localStats(d);
      case 'PUT /api/favorites/:id':
        if (!d.favorites.includes(id)) d.favorites.unshift(id);
        localSave(d);
        return { ok: true };
      case 'DELETE /api/favorites/:id':
        d.favorites = d.favorites.filter((x) => x !== id);
        localSave(d);
        return { ok: true };
      case 'PUT /api/ratings/:id': {
        const stars = Number(body.stars);
        if (!Number.isInteger(stars) || stars < 1 || stars > 5) localFail('stars', 'Choose from 1 to 5 stars.');
        d.ratings[id] = { stars, comment: String(body.comment || '').trim().slice(0, 1000), updated: Date.now() };
        localSave(d);
        return { ok: true, stats: localStats(d)[id] };
      }
      case 'DELETE /api/ratings/:id':
        delete d.ratings[id];
        localSave(d);
        return { ok: true, stats: localStats(d)[id] || null };
      case 'POST /api/my-prompts': {
        if (d.custom.length >= 200) localFail('limit', 'You can keep up to 200 prompts.');
        const prompt = Object.assign(localPrompt(body), { id: `my-${slugify(body.title).slice(0, 40)}-${Math.random().toString(36).slice(2, 8)}`, updated: Date.now() });
        d.custom.unshift(prompt);
        localSave(d);
        return { prompt };
      }
      case 'PUT /api/my-prompts/:id': {
        const i = d.custom.findIndex((x) => x.id === id);
        if (i < 0) localFail('prompt', 'Only your own prompts can be edited.');
        const prompt = Object.assign(localPrompt(body), { id, updated: Date.now() });
        d.custom[i] = prompt;
        localSave(d);
        return { prompt };
      }
      case 'DELETE /api/my-prompts/:id':
        d.custom = d.custom.filter((x) => x.id !== id);
        d.favorites = d.favorites.filter((x) => x !== id);
        delete d.ratings[id];
        delete d.usage[id];
        localSave(d);
        return { ok: true };
      default:
        return { ok: true };
    }
  }

  // Brings favorites, prompts, history and settings over from the first one-file version.
  function migrateV1() {
    if (store.raw('local:data') != null) return;
    const favs = store.get('favs', null);
    const custom = store.get('custom', null);
    const usage = store.get('usage', null);
    const settings = store.get('settings', null);
    const vars = store.get('vars', null);
    if (!favs && !custom && !usage && !settings) return;
    const d = { favorites: Array.isArray(favs) ? favs : [], ratings: {}, usage: usage && typeof usage === 'object' ? usage : {}, custom: [] };
    (Array.isArray(custom) ? custom : []).forEach((p) => {
      if (!p || !p.title || !p.template) return;
      d.custom.push({
        id: /^[a-z0-9-]+$/.test(String(p.id || '')) ? p.id : `my-${slugify(p.title).slice(0, 40)}-${Math.random().toString(36).slice(2, 8)}`,
        title: p.title, description: p.description || '', tags: p.tags || [], template: p.template,
        category: catById[p.category] ? p.category : 'triage', stage: stageById[p.stage] ? p.stage : 'intake',
        ticket: p.ticket || (p.needsTicket ? 'required' : 'optional'), updated: Date.now()
      });
    });
    localSave(d);
    if (settings && typeof settings === 'object') {
      if (settings.theme && store.raw('theme') == null) store.setRaw('theme', settings.theme);
      const keep = {};
      ['guardrail', 'length', 'view'].forEach((k) => { if (settings[k] !== undefined) keep[k] = settings[k]; });
      if (settings.cleanSession !== undefined) keep.product = false;
      store.set('u0:settings', keep);
    }
    if (vars && typeof vars === 'object' && store.raw('u0:vars') == null) store.set('u0:vars', vars);
  }

  /* ================= Catalog lookups ================= */
  const TICKET_KEYS = ['WORK_ITEM_URL', 'WORK_ITEM_ID', 'PLATFORM'];
  const LIST_ROUTES = ['prompts', 'mine'];
  const FALLBACK_CAT = { id: 'other', name: 'Other', color: '#5A6B8C', description: '' };
  const VAR_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
  const STAR_WORDS = ['', 'Not useful', 'Slightly useful', 'Useful', 'Very useful', 'Essential'];
  let catById = {};
  let stageById = {};
  let SNIPPETS = {};
  let COMPUTED = new Set();
  function setCatalog(data) {
    D = data;
    catById = Object.fromEntries(D.categories.map((c) => [c.id, c]));
    stageById = Object.fromEntries(D.stages.map((s, i) => [s.id, Object.assign({ n: i + 1 }, s)]));
    SNIPPETS = D.snippets || {};
    COMPUTED = new Set(['PLATFORM_NOTES'].concat(Object.keys(SNIPPETS)));
    const v = $('#sideVersion');
    if (v) v.textContent = `Catalog v${D.meta.version}, updated ${fmtDate(D.meta.updated)}${LOCAL ? ' · local edition' : ''}`;
  }

  const loadedScripts = {};
  function loadScript(src) {
    if (!loadedScripts[src]) {
      loadedScripts[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { delete loadedScripts[src]; s.remove(); reject(new Error('Could not load ' + src.split('?')[0] + '.')); };
        document.head.appendChild(s);
      });
    }
    return loadedScripts[src];
  }
  async function ensureCatalog() {
    if (D) return;
    if (!window.QPH_DATA) await loadScript('/api/catalog.js?v=' + encodeURIComponent((state.config && state.config.version) || ''));
    if (!window.QPH_DATA) throw new Error('The prompt catalog did not load.');
    setCatalog(window.QPH_DATA);
  }

  /* ================= State ================= */
  const DEFAULT_SETTINGS = { guardrail: true, agent: '', agentCustom: '', fileOut: '', length: 'standard', view: 'grid', sort: 'relevance' };
  const state = {
    config: null,
    user: null,
    favs: new Set(),
    ratings: {},
    usage: {},
    custom: [],
    stats: {},
    statsAt: 0,
    vars: {},
    settings: Object.assign({}, DEFAULT_SETTINGS),
    showMissing: {},
    current: null,
    bannerDismissed: false,
    homeTab: 'popular'
  };

  const saveSettings = () => store.set(userKey('settings'), state.settings);
  function persistVars() {
    const keep = {};
    Object.keys(state.vars).forEach((k) => { const v = state.vars[k]; if (v && varDef(k).type !== 'textarea') keep[k] = v; });
    store.set(userKey('vars'), keep);
  }

  function allPrompts() { return D.prompts.concat(state.custom.map((p) => Object.assign({}, p, { mine: true }))); }
  function getPrompt(id) { return allPrompts().find((p) => p.id === id); }
  const ticketMode = (p) => p.ticket || (p.needsTicket ? 'required' : 'optional');
  const readsCode = (p) => /\{\{\s*CODE_EVIDENCE\s*\}\}|codebase|repository/i.test(p.template || '');
  const isAdmin = () => state.user && state.user.role === 'admin';

  /* ================= Variables & prompt building ================= */
  function templateVars(t) {
    const out = [];
    String(t || '').replace(VAR_RE, (m, k) => { k = k.toUpperCase(); if (!out.includes(k)) out.push(k); return m; });
    return out;
  }
  function fieldKeys(p) { return templateVars(p.template).filter((k) => !COMPUTED.has(k) && !TICKET_KEYS.includes(k)); }
  function usesPlatform(p) {
    const vars = templateVars(p.template);
    return vars.includes('PLATFORM') || vars.includes('PLATFORM_NOTES') || vars.some((k) => SNIPPETS[k] && /\{\{\s*PLATFORM\s*\}\}/.test(SNIPPETS[k]));
  }
  function varDef(k) {
    const d = D.variables && D.variables[k];
    if (d) return d;
    const label = k.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
    return { label, type: /TEXT|CODE|NOTES|DESCRIPTION|DETAILS|CONTEXT|SUMMARY|LOG|STEPS|EXPECTED|ACTUAL/.test(k) ? 'textarea' : 'text' };
  }
  function varOptions(d) { return d.options === 'platforms' ? D.platforms.map((p) => p.name) : (d.options || []); }
  function varValue(k) { return String(state.vars[k] == null ? '' : state.vars[k]).trim(); }
  const platformText = () => varValue('PLATFORM') || 'the platform';
  const withPlatform = (s) => String(s || '').replace(/\{\{\s*PLATFORM\s*\}\}/g, platformText());
  function platformNotes() {
    const p = D.platforms.find((x) => x.name === varValue('PLATFORM'));
    return (p && p.notes) || D.platformNotesFallback || '';
  }

  /* QAgent agent and file deliverable chosen under Options */
  const AGENT_RE = /^\/[a-z0-9][a-z0-9_-]{0,39}$/i;
  const normalizeCmd = (v) => { let c = String(v || '').trim().split(/\s+/)[0] || ''; if (c && c[0] !== '/') c = '/' + c; return c; };
  const agentDef = (cmd) => (D.agents || []).find((a) => a.cmd.toLowerCase() === String(cmd || '').toLowerCase()) || null;
  function agentProblem(cmd) {
    if (!cmd) return 'Type the agent command, for example /product.';
    if (!AGENT_RE.test(cmd)) return 'Use the command as /switch shows it: a slash and one word.';
    const lower = cmd.toLowerCase();
    const builtin = (D.commands || []).find((c) => !agentDef(c.cmd) && (c.cmd === lower || (c.aliases || []).includes(lower)));
    return builtin ? `${builtin.cmd} is a built-in command, not an agent.` : '';
  }
  // The agent selected in the dropdown: '' (current agent), a catalog command, or 'custom'.
  function agentChoice() {
    const a = state.settings.agent || '';
    if (!a || a === 'custom' || agentDef(a)) return a;
    return 'custom'; // a command that is no longer in the catalog
  }
  function agentCommand() {
    const a = agentChoice();
    if (!a) return '';
    if (a !== 'custom') return agentDef(a).cmd;
    const cmd = normalizeCmd(state.settings.agentCustom || state.settings.agent);
    return agentProblem(cmd) ? '' : cmd;
  }
  function fileRequestText() {
    const f = D.fileOutputs && D.fileOutputs[state.settings.fileOut];
    return f ? f.text : '';
  }
  function agentHelpText(prefix) {
    const a = agentChoice();
    if (a === 'custom') {
      const problem = agentProblem(normalizeCmd(state.settings.agentCustom || state.settings.agent));
      return problem ? { error: true, text: problem } : { text: 'Send /switch in QAgent to see the agents you can reach and their commands.' };
    }
    if (!a) return { text: 'The prompt goes to the agent already active in your QAgent chat.' };
    const def = agentDef(a);
    return { text: `${def.desc}${def.takesWorkItem ? ' The work item link goes right after the command.' : ''}` };
  }
  function agentFieldHTML(prefix) {
    const a = agentChoice();
    const help = agentHelpText(prefix);
    return `<div class="field agent-field" data-prefix="${prefix}"><label for="${prefix}Agent">QAgent agent</label>
      <select id="${prefix}Agent" data-setting-select="agent">
        <option value="" ${a === '' ? 'selected' : ''}>Current agent (no command)</option>
        ${(D.agents || []).map((x) => `<option value="${esc(x.cmd)}" ${a === x.cmd ? 'selected' : ''}>${esc(x.name)} (${esc(x.cmd)})</option>`).join('')}
        <option value="custom" ${a === 'custom' ? 'selected' : ''}>Another agent: type its command</option>
      </select>
      ${a === 'custom' ? `<input id="${prefix}AgentCmd" type="text" data-setting-text="agentCustom" value="${esc(state.settings.agentCustom || (agentDef(state.settings.agent) || state.settings.agent === 'custom' ? '' : state.settings.agent))}" placeholder="/agent-command" autocomplete="off" spellcheck="false" aria-label="Agent command" aria-describedby="${prefix}AgentHelp" ${help.error ? 'aria-invalid="true"' : ''}>` : ''}
      <p class="help ${help.error ? 'is-error' : ''}" id="${prefix}AgentHelp" data-agent-help>${esc(help.text)}</p>
    </div>`;
  }
  const FILE_CHOICES = [['', 'No file'], ['docx', 'Word'], ['xlsx', 'Excel']];
  function fileHelpText() {
    const v = state.settings.fileOut;
    if (v === 'docx') return 'At the end, the prompt asks QAgent to attach its complete answer as a Word (.docx) file.';
    if (v === 'xlsx') return 'At the end, the prompt asks QAgent to attach its complete answer as an Excel (.xlsx) file, with each table on its own sheet.';
    return 'Ask QAgent to also attach its complete answer as a Word or Excel file.';
  }
  function fileFieldHTML() {
    const v = state.settings.fileOut || '';
    return `<div class="field"><span class="field-label" id="fileOutLabel">Also deliver the answer as a file</span>
      <div class="segmented" role="group" aria-labelledby="fileOutLabel">
        ${FILE_CHOICES.map(([k, l]) => `<button type="button" data-act="setting-seg" data-key="fileOut" data-val="${k}" aria-pressed="${v === k}">${k ? icon(k === 'docx' ? 'file-doc' : 'file-sheet', 'i-sm') : ''}${l}</button>`).join('')}
      </div>
      <p class="help" data-file-help>${esc(fileHelpText())}</p>
    </div>`;
  }

  function ticketParts(p) {
    const mode = ticketMode(p);
    const url = varValue('WORK_ITEM_URL');
    const id = varValue('WORK_ITEM_ID');
    const includeTicket = mode === 'required' || (mode === 'optional' && !!(url || id));
    const includePlatform = includeTicket || usesPlatform(p);
    return { mode, url, id, includeTicket, includePlatform };
  }

  function missingVars(p) {
    const t = ticketParts(p);
    const miss = [];
    if (t.includeTicket && !t.url && !t.id) miss.push('WORK_ITEM_URL');
    if (t.includePlatform && !varValue('PLATFORM')) miss.push('PLATFORM');
    fieldKeys(p).forEach((k) => { if (!varValue(k) && !varDef(k).optional) miss.push(k); });
    return miss;
  }

  function buildPrompt(p, html) {
    const t = ticketParts(p);
    const e = (s) => (html ? esc(s) : s);
    const val = (v, label, kind) => {
      if (v) return html ? `<mark class="${kind || 'ok'}">${esc(v)}</mark>` : v;
      return html ? `<mark class="miss">${esc(label)}</mark>` : `[${label}]`;
    };
    const blocks = [];
    const head = [];
    const cmd = agentCommand();
    const linkOnCommand = !!(cmd && t.includeTicket && (agentDef(cmd) || {}).takesWorkItem);
    if (cmd) head.push(linkOnCommand ? e(cmd + ' ') + val(t.url || t.id, 'Work item URL') : (html ? `<mark class="ok">${esc(cmd)}</mark>` : cmd));
    if (t.includePlatform) head.push(e('Platform: ') + val(varValue('PLATFORM'), 'Platform'));
    if (t.includeTicket && !linkOnCommand) head.push(e('Work item: ') + val(t.url || (t.id ? 'ID ' + t.id : ''), 'Work item URL'));
    if (head.length) blocks.push(head.join('\n'));
    if (t.includeTicket) {
      const idv = val(t.id, 'Work item ID');
      blocks.push(t.mode === 'required'
        ? e('Load work item ') + idv + e(' from Azure DevOps and read its description, comments and attachments before you answer.')
        : e('Read work item ') + idv + e(' (description, comments and attachments) for context before you answer.'));
    }

    const tpl = String(p.template || '');
    let body = '';
    let last = 0;
    for (const m of tpl.matchAll(VAR_RE)) {
      body += e(tpl.slice(last, m.index));
      const k = m[1].toUpperCase();
      if (k === 'PLATFORM_NOTES') body += html ? `<mark class="fb" title="Platform notes from the catalog">${esc(platformNotes())}</mark>` : platformNotes();
      else if (SNIPPETS[k]) body += e(withPlatform(SNIPPETS[k]));
      else {
        const d = varDef(k);
        const v = varValue(k);
        if (v) body += val(v, d.label);
        else if (d.optional) body += html ? `<mark class="fb" title="${esc(d.label)} is empty, default text used">${esc(withPlatform(d.fallback || ''))}</mark>` : withPlatform(d.fallback || '');
        else body += val('', d.label);
      }
      last = m.index + m[0].length;
    }
    body += e(tpl.slice(last));
    blocks.push(body.trim());

    const extras = [];
    const len = D.lengths && D.lengths[state.settings.length];
    if (len && len.text) extras.push(len.text);
    if (state.settings.guardrail && D.guardrail) extras.push(D.guardrail);
    const fileText = fileRequestText();
    if (fileText) extras.push(fileText);
    let out = blocks.join('\n\n');
    if (extras.length) out += html ? `\n\n<span class="appended">${esc(extras.join('\n\n'))}</span>` : '\n\n' + extras.join('\n\n');
    return out;
  }

  function parseWorkItemId(url) {
    const s = String(url || '');
    const m = s.match(/_workitems\/(?:edit\/)?(\d{3,})/i) || s.match(/[?&](?:id|workitem)=(\d{3,})/i) || s.match(/\b(\d{5,})\b/);
    return m ? m[1] : '';
  }
  function guessPlatform(url) {
    const s = String(url || '').toLowerCase();
    const hit = D.platforms.find((p) => (p.match || []).some((m) => s.includes(m)));
    return hit ? hit.name : '';
  }

  /* ================= Tracking ================= */
  const queue = [];
  let flushTimer = null;
  let lastView = { id: null, at: 0 };
  function track(type, promptId, extra) {
    if (LOCAL) {
      if (type === 'copy' && promptId) {
        const d = localLoad();
        const u = d.usage[promptId] || { count: 0, last: 0 };
        d.usage[promptId] = { count: (u.count || 0) + 1, last: Date.now() };
        localSave(d);
      }
      return;
    }
    if (!state.user || isAdmin()) return;
    queue.push(Object.assign({ type, promptId: promptId || null, platform: varValue('PLATFORM') || null }, extra || {}));
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, type === 'copy' ? 300 : 4000);
  }
  function flush() {
    if (!queue.length) return;
    const events = queue.splice(0, 50);
    fetch('/api/events', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-QPH': '1' }, body: JSON.stringify({ events }) }).catch(() => {});
    if (queue.length) flushTimer = setTimeout(flush, 500);
  }

  // Time in app: counts seconds while the tab is visible and the person was active in the last 5 minutes.
  const hb = { visitId: randomId(), pending: 0, lastInput: Date.now(), timer: null };
  function startHeartbeat() {
    stopHeartbeat();
    if (!state.user || isAdmin() || LOCAL) return;
    hb.visitId = randomId();
    hb.timer = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - hb.lastInput < 5 * 60000) hb.pending += 15;
      if (hb.pending >= 60) sendHeartbeat();
    }, 15000);
  }
  function stopHeartbeat() { if (hb.timer) clearInterval(hb.timer); hb.timer = null; }
  function sendHeartbeat() {
    if (!hb.pending || !state.user || isAdmin()) return;
    const seconds = hb.pending;
    hb.pending = 0;
    fetch('/api/heartbeat', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-QPH': '1' }, body: JSON.stringify({ visitId: hb.visitId, seconds }) }).catch(() => {});
  }
  ['pointerdown', 'keydown', 'scroll', 'pointermove'].forEach((ev) => window.addEventListener(ev, () => { hb.lastInput = Date.now(); }, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { flush(); sendHeartbeat(); } });
  window.addEventListener('pagehide', () => { flush(); sendHeartbeat(); });

  async function refreshStats(force) {
    if (!force && !LOCAL && Date.now() - state.statsAt < 60000) return;
    try { state.stats = await api('GET', '/api/stats'); state.statsAt = Date.now(); } catch (e) { /* keep old numbers */ }
  }

  /* ================= Clipboard, toasts, downloads ================= */
  async function copyText(text) {
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }
  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind === 'warn' ? ' warn' : '');
    el.innerHTML = icon(kind === 'warn' ? 'info' : 'check') + `<span>${esc(msg)}</span>`;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), kind === 'warn' ? 5000 : 2600);
  }
  function flashButton(btn, label) {
    if (!btn) return;
    const span = btn.querySelector('span');
    const prev = span ? span.textContent : '';
    btn.classList.add('is-done');
    if (span) span.textContent = label || 'Copied';
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.classList.remove('is-done'); if (span) span.textContent = prev; }, 1600);
  }
  function download(filename, text, type) {
    try {
      const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      return true;
    } catch (e) { toast('Download is blocked here.', 'warn'); return false; }
  }

  /* ================= Small UI pieces ================= */
  function catChip(cat, link) {
    const inner = `<i style="--cat:${cat.color}"></i>${esc(cat.name)}`;
    return link ? `<a class="cat-chip" href="#/prompts?cat=${cat.id}">${inner}</a>` : `<span class="cat-chip">${inner}</span>`;
  }
  function stageBadge(st, link) {
    if (!st) return '';
    const inner = `<b aria-hidden="true">${st.n}</b><span class="visually-hidden">PDLC stage ${st.n}: </span>${esc(st.name)}`;
    return link ? `<a class="stage-badge" href="#/prompts?stage=${st.id}" title="PDLC stage ${st.n}">${inner}</a>` : `<span class="stage-badge" title="PDLC stage ${st.n}">${inner}</span>`;
  }
  const codeBadge = () => `<span class="flag-badge" title="QAgent searches and reads the platform code for this prompt">${icon('code', 'i-sm')}Reads code</span>`;
  function ratingBadge(id) {
    const s = state.stats[id];
    if (!s || !s.ratings) return '';
    if (LOCAL) return `<span class="rating-badge" title="Your rating">${icon('star', 'i-sm')}<b>${s.avg}</b><small>(yours)</small></span>`;
    return `<span class="rating-badge" title="${s.avg} average from ${plural(s.ratings, 'rating')}">${icon('star', 'i-sm')}<b>${s.avg.toFixed(1)}</b><small>(${num(s.ratings)})</small></span>`;
  }
  function favButton(p, cls) {
    const on = state.favs.has(p.id);
    return `<button class="icon-btn sm fav-btn ${cls || ''} ${on ? 'is-on' : ''}" data-act="fav" data-id="${esc(p.id)}" aria-pressed="${on}" aria-label="${on ? 'Remove from' : 'Save to'} favorites: ${esc(p.title)}" title="${on ? 'Saved to favorites' : 'Save to favorites'}">${icon('bookmark')}</button>`;
  }

  function cardHTML(p) {
    const cat = catById[p.category] || FALLBACK_CAT;
    const st = stageById[p.stage];
    const s = state.stats[p.id];
    const mine = state.usage[p.id];
    return `<article class="card" style="--cat:${cat.color}">
      ${favButton(p, 'card-fav')}
      <div class="card-main">
        <h3><a href="#/prompt/${encodeURIComponent(p.id)}">${esc(p.title)}</a></h3>
        <p class="card-desc">${esc(p.description || '')}</p>
      </div>
      <div class="card-meta">${catChip(cat)}${stageBadge(st)}${readsCode(p) ? codeBadge() : ''}${p.mine ? '<span class="pill-mine">Mine</span>' : ''}</div>
      <div class="card-foot">
        <span class="uses">${ratingBadge(p.id)}${!LOCAL && s && s.copies ? `<span title="Copied ${plural(s.copies, 'time')} by ${plural(s.users, 'person', 'people')}">Used ${plural(s.copies, 'time')}</span>` : ''}${mine && mine.count ? `<span class="mine-count">${LOCAL ? `Copied ${plural(mine.count, 'time')}` : `You: ${num(mine.count)}`}</span>` : ''}</span>
        <div class="card-actions"><button class="btn btn-sm btn-ghost" data-act="copy-prompt" data-id="${esc(p.id)}">${icon('copy', 'i-sm')}<span>Copy</span></button></div>
      </div>
    </article>`;
  }

  function fieldHTML(k, prefix, opts) {
    const d = varDef(k);
    const v = state.vars[k] == null ? '' : state.vars[k];
    const id = (prefix || 'f') + '_' + k;
    const optional = d.optional || (opts && opts.optional);
    let input;
    if (d.type === 'select') {
      const options = varOptions(d);
      const list = options.includes(v) || !v ? options : options.concat([v]);
      input = `<select id="${id}" data-var="${k}"><option value="">Choose</option>${list.map((o) => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    } else if (d.type === 'textarea') {
      input = `<textarea id="${id}" data-var="${k}" rows="${d.rows || 4}" placeholder="${esc(d.placeholder || '')}" spellcheck="false">${esc(v)}</textarea>`;
    } else {
      input = `<input id="${id}" data-var="${k}" type="text" value="${esc(v)}" placeholder="${esc(d.placeholder || '')}" autocomplete="off" spellcheck="false">`;
    }
    return `<div class="field" data-key="${k}"><label for="${id}">${esc(d.label)}${optional ? '<span class="opt">optional</span>' : ''}</label>${input}${d.help ? `<p class="help">${esc(d.help)}</p>` : ''}</div>`;
  }
  function ticketFieldsHTML(prefix, opts) {
    return `${fieldHTML('WORK_ITEM_URL', prefix, opts)}<div class="row">${fieldHTML('WORK_ITEM_ID', prefix, opts)}${fieldHTML('PLATFORM', prefix)}</div>`;
  }

  /* ================= Chrome ================= */
  function renderNav(active, params) {
    const favCount = allPrompts().filter((p) => state.favs.has(p.id)).length;
    const items = [
      ['', 'home', 'Home'],
      ['prompts', 'list', 'All prompts', allPrompts().length],
      ['favorites', 'bookmark', 'Favorites', favCount],
      ['troubleshoot', 'wrench', 'Troubleshooting'],
      ['comment', 'message', 'Ticket comment'],
      ['playbook', 'route', 'PDLC playbook'],
      ['commands', 'terminal', 'QAgent commands'],
      ['mine', 'pen', 'My prompts', state.custom.length]
    ];
    if (isAdmin()) items.push(['admin', 'chart', 'Admin dashboard']);
    const onlyAll = active === 'prompts' && !(params && (params.cat || params.stage));
    $('#mainNav').innerHTML = items.map(([r, ic, label, count]) => {
      const isActive = r === 'prompts' ? onlyAll : active === (r || 'home');
      return `<a href="#/${r}" class="nav-link ${isActive ? 'active' : ''} ${r === 'admin' ? 'nav-admin' : ''}" ${isActive ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${count != null ? `<span class="count">${count}</span>` : ''}</a>`;
    }).join('');

    const counts = {};
    allPrompts().forEach((p) => { counts[p.category] = (counts[p.category] || 0) + 1; });
    const activeCat = params && params.cat && active === 'prompts' ? params.cat : null;
    $('#catNav').innerHTML = D.categories.map((c) => `<li><a href="#/prompts?cat=${c.id}" class="${activeCat === c.id ? 'active' : ''}"><span class="dot" style="background:${c.color}"></span><span>${esc(c.name)}</span><span class="count">${counts[c.id] || 0}</span></a></li>`).join('');
    $$('.side-foot .nav-link').forEach((a) => a.classList.toggle('active', a.dataset.route === active));
  }

  function renderTicketChip() {
    const id = varValue('WORK_ITEM_ID');
    const plat = varValue('PLATFORM');
    $('#ticketChip').innerHTML = id
      ? `<div class="ticket-chip">${icon('ticket')}<button class="link" data-act="ticket-open" title="Change work item">${esc(id)}</button>${plat ? `<span class="plat">${esc(plat)}</span>` : ''}<button class="icon-btn sm" data-act="ticket-clear" aria-label="Clear work item">${icon('x', 'i-sm')}</button></div>`
      : `<button class="btn btn-sm ticket-chip ticket-set" data-act="ticket-open">${icon('ticket')}<span>Set work item</span></button>`;
  }

  function renderUserChrome() {
    const u = state.user;
    if (LOCAL) {
      $('.user-menu').hidden = true;
      $('#banner').hidden = true;
      const pill = $('#demoPill');
      pill.hidden = false;
      pill.classList.add('local');
      pill.textContent = 'Local edition';
      pill.title = 'Runs only in this browser. Nothing is sent to a server.';
      return;
    }
    $('#userBtn').textContent = initials(u.name);
    $('#userBtn').setAttribute('aria-label', `Account menu for ${u.name}`);
    $('#userMenu').innerHTML = `
      <div class="menu-head"><b>${esc(u.name)}</b><span>${esc(u.role === 'admin' ? 'Administrator' : u.email)}</span>${u.team ? `<span>${esc(u.team)}${u.area ? ' · ' + esc(u.area) : ''}</span>` : ''}</div>
      ${u.role === 'admin' ? `<a role="menuitem" href="#/admin">${icon('chart')}<span>Admin dashboard</span></a>` : ''}
      <a role="menuitem" href="#/settings">${icon('sliders')}<span>Settings</span></a>
      <a role="menuitem" href="#/settings?section=password">${icon('key')}<span>Change password</span></a>
      <button role="menuitem" data-act="logout">${icon('logout')}<span>Sign out</span></button>`;
    $('#demoPill').hidden = !(state.config && state.config.demo);
    renderBanner();
  }

  function renderBanner() {
    const b = $('#banner');
    const show = state.user && state.user.mustChange && !state.bannerDismissed;
    b.hidden = !show;
    if (show) {
      b.innerHTML = `${icon('key')}<p>You are still using the initial password. Change it so nobody else can sign in with your email.</p>
        <a class="btn btn-sm" href="#/settings?section=password">Change password</a>
        <button class="icon-btn sm" data-act="banner-close" aria-label="Hide this message">${icon('x', 'i-sm')}</button>`;
    }
  }

  function toggleUserMenu(force) {
    const menu = $('#userMenu');
    const open = force != null ? force : menu.hidden;
    menu.hidden = !open;
    $('#userBtn').setAttribute('aria-expanded', String(open));
  }

  function applyTheme() {
    let t = store.raw('theme') || 'system';
    try { t = JSON.parse(t); } catch (e) { /* plain string */ }
    if (t === 'system') t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
  }
  const themeSetting = () => { const r = store.raw('theme'); try { return JSON.parse(r) || 'system'; } catch (e) { return r || 'system'; } };
  const setTheme = (t) => { store.setRaw('theme', t); applyTheme(); };

  /* ================= Auth screens ================= */
  function showAuth(mode, opts) {
    opts = opts || {};
    stopHeartbeat();
    $('#splash').hidden = true;
    $('#app').hidden = true;
    const auth = $('#auth');
    auth.hidden = false;
    const domain = state.config ? state.config.allowedDomain : 'qualifacts.com';
    const cfg = state.config || { areas: [], systems: ['Credible', 'CareLogic', 'InSync'], teams: [] };
    const promptCount = (D && D.prompts.length) || (state.config && state.config.promptCount) || 0;
    const tabs = (active) => `<div class="auth-tabs" role="tablist">
        <button role="tab" aria-selected="${active === 'signin'}" data-act="auth-mode" data-mode="signin">Sign in</button>
        <button role="tab" aria-selected="${active === 'register'}" data-act="auth-mode" data-mode="register">Create account</button>
      </div>`;
    let form = '';
    if (mode === 'signin') {
      form = `${tabs('signin')}
        <form class="auth-form" id="signinForm" novalidate>
          <h1>Sign in</h1>
          ${opts.message ? `<p class="auth-note">${esc(opts.message)}</p>` : ''}
          <div class="field"><label for="siLogin">Corporate email</label>
            <input id="siLogin" name="login" type="text" inputmode="email" autocomplete="username" placeholder="name@${esc(domain)}" required value="${esc(opts.login || '')}">
          </div>
          <div class="field"><label for="siPass">Password</label><input id="siPass" name="password" type="password" autocomplete="current-password" required></div>
          <p class="form-error" id="authError" role="alert" hidden></p>
          <button class="btn btn-primary btn-lg" type="submit">${icon('check')}<span>Sign in</span></button>
          <p class="auth-foot">New here? <button type="button" class="link" data-act="auth-mode" data-mode="register">Create an account</button> with your @${esc(domain)} email.</p>
        </form>`;
    } else if (mode === 'register') {
      form = `${tabs('register')}
        <form class="auth-form" id="registerForm" novalidate>
          <h1>Create your account</h1>
          <p class="auth-note">Only corporate @${esc(domain)} email addresses can register.</p>
          <div class="field"><label for="reEmail">Corporate email</label><input id="reEmail" name="email" type="email" autocomplete="email" placeholder="name@${esc(domain)}" required></div>
          <div class="field"><label for="reName">Full name</label><input id="reName" name="name" type="text" autocomplete="name" required></div>
          <div class="field"><label for="reTeam">Team</label><input id="reTeam" name="team" type="text" list="teamList" autocomplete="off" placeholder="e.g. Credible Sustainment" required>
            <datalist id="teamList">${(cfg.teams || []).map((t) => `<option value="${esc(t)}">`).join('')}</datalist></div>
          <div class="row">
            <div class="field"><label for="reArea">Area</label><select id="reArea" name="area" required><option value="">Choose</option>${(cfg.areas || []).map((a) => `<option>${esc(a)}</option>`).join('')}</select></div>
            <div class="field"><label for="reSystem">Main system</label><select id="reSystem" name="system" required><option value="">Choose</option>${(cfg.systems || []).map((a) => `<option>${esc(a)}</option>`).join('')}</select></div>
          </div>
          <p class="form-error" id="authError" role="alert" hidden></p>
          <button class="btn btn-primary btn-lg" type="submit">${icon('plus')}<span>Create account</span></button>
          <p class="auth-foot">Already registered? <button type="button" class="link" data-act="auth-mode" data-mode="signin">Sign in</button></p>
        </form>`;
    } else if (mode === 'registered') {
      form = `<div class="auth-form">
          <h1>Your account is ready</h1>
          <p>Welcome, ${esc(state.user.name)}. Your initial password is</p>
          <p class="initial-pass"><code>${esc(opts.password)}</code></p>
          <p class="auth-note">Use it with your email the next time you sign in. Change it now so nobody else can sign in as you.</p>
          <div class="form-actions">
            <button class="btn btn-primary btn-lg" data-act="auth-mode" data-mode="change">${icon('key')}<span>Change password now</span></button>
            <button class="btn btn-lg" data-act="auth-continue">Continue to the hub</button>
          </div>
        </div>`;
    } else if (mode === 'change') {
      const forced = opts.forced || (state.config && state.config.requirePasswordChange && state.user && state.user.mustChange);
      form = `<form class="auth-form" id="authPasswordForm" novalidate>
          <h1>Change your password</h1>
          <p class="auth-note">${forced ? 'Your organization asks you to replace the initial password before using the hub.' : 'Choose a password only you know.'}</p>
          ${passwordFieldsHTML('ap')}
          <p class="form-error" id="authError" role="alert" hidden></p>
          <div class="form-actions">
            <button class="btn btn-primary btn-lg" type="submit">${icon('check')}<span>Save password</span></button>
            ${forced ? `<button type="button" class="btn btn-ghost" data-act="logout">Sign out</button>` : `<button type="button" class="btn btn-ghost" data-act="auth-continue">Skip for now</button>`}
          </div>
        </form>`;
    }

    auth.innerHTML = `
      <section class="auth-brand">
        <img class="auth-logo" src="${esc(ASSET.logo)}" alt="Qualifacts" width="626" height="132">
        <div class="auth-copy">
          <p class="auth-product">QAgent Prompt Hub</p>
          <h2>The right QAgent prompt for every ticket</h2>
          <p>${promptCount ? promptCount + ' prompts' : 'Prompts'} for Credible, CareLogic and InSync: review tickets, find why an option does not appear, trace errors to the code and tell configuration from defects.</p>
        </div>
        <img class="auth-mark" src="${esc(ASSET.mark)}" alt="">
      </section>
      <section class="auth-panel">${form}</section>`;
    const first = auth.querySelector('form input, .auth-form .btn-primary');
    if (first) first.focus();
  }

  function passwordFieldsHTML(prefix) {
    return `<div class="field"><label for="${prefix}Current">Current password</label><input id="${prefix}Current" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="${prefix}Next">New password</label><input id="${prefix}Next" type="password" autocomplete="new-password" minlength="8" required aria-describedby="${prefix}Rules"><p class="help" id="${prefix}Rules">At least 8 characters, different from the initial password.</p></div>
      <div class="field"><label for="${prefix}Confirm">Repeat new password</label><input id="${prefix}Confirm" type="password" autocomplete="new-password" required></div>`;
  }

  function authError(msg, field) {
    const el = $('#authError') || $('#pwError');
    if (el) { el.textContent = msg; el.hidden = !msg; }
    if (field) { const f = $(field); if (f) { f.setAttribute('aria-invalid', 'true'); f.focus(); } }
  }

  function domainOk(value) {
    const domain = state.config ? state.config.allowedDomain : 'qualifacts.com';
    const v = String(value || '').trim().toLowerCase();
    return v.split('@')[1] === domain;
  }
  const domainMessage = () => `Only corporate @${state.config ? state.config.allowedDomain : 'qualifacts.com'} email addresses can sign in or create an account.`;

  async function submitSignin(form) {
    const login = form.login.value.trim();
    const password = form.password.value;
    $$('[aria-invalid]', form).forEach((x) => x.removeAttribute('aria-invalid'));
    if (!login) return authError('Enter your corporate email.', '#siLogin');
    if (login.includes('@') && !domainOk(login)) return authError(domainMessage(), '#siLogin');
    if (!login.includes('@') && login.toLowerCase() !== 'admin') return authError('Enter your full corporate email, for example name@' + (state.config ? state.config.allowedDomain : 'qualifacts.com') + '.', '#siLogin');
    if (!password) return authError('Enter your password.', '#siPass');
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await api('POST', '/api/auth/login', { login, password });
      const me = await api('GET', '/api/me');
      onSignedIn(me);
    } catch (e) {
      authError(e.message, e.code === 'domain' || e.code === 'email' ? '#siLogin' : '#siPass');
    } finally { btn.disabled = false; }
  }

  async function submitRegister(form) {
    const body = { email: form.email.value.trim(), name: form.name.value.trim(), team: form.team.value.trim(), area: form.area.value, system: form.system.value };
    $$('[aria-invalid]', form).forEach((x) => x.removeAttribute('aria-invalid'));
    if (!body.email) return authError('Enter your corporate email.', '#reEmail');
    if (!domainOk(body.email)) return authError(domainMessage(), '#reEmail');
    if (body.name.length < 2) return authError('Enter your full name.', '#reName');
    if (body.team.length < 2) return authError('Enter your team.', '#reTeam');
    if (!body.area) return authError('Choose your area.', '#reArea');
    if (!body.system) return authError('Choose the system you work on most.', '#reSystem');
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const out = await api('POST', '/api/auth/register', body);
      const me = await api('GET', '/api/me');
      loadUserState(me);
      showAuth('registered', { password: out.initialPassword });
    } catch (e) {
      const fieldMap = { domain: '#reEmail', email: '#reEmail', exists: '#reEmail', name: '#reName', team: '#reTeam', area: '#reArea', system: '#reSystem' };
      authError(e.message, fieldMap[e.code]);
    } finally { btn.disabled = false; }
  }

  async function submitPassword(prefix, onDone) {
    const current = $(`#${prefix}Current`).value;
    const next = $(`#${prefix}Next`).value;
    const confirm = $(`#${prefix}Confirm`).value;
    if (!current) return authError('Enter your current password.', `#${prefix}Current`);
    if (next.length < 8) return authError('Use at least 8 characters for the new password.', `#${prefix}Next`);
    if (next !== confirm) return authError('The new passwords do not match.', `#${prefix}Confirm`);
    try {
      await api('POST', '/api/me/password', { current, next });
      state.user.mustChange = false;
      toast('Password changed');
      onDone();
    } catch (e) {
      authError(e.message, e.code === 'current' ? `#${prefix}Current` : `#${prefix}Next`);
    }
  }

  function loadUserState(me) {
    state.user = me.user;
    state.favs = new Set(me.favorites || []);
    state.ratings = me.ratings || {};
    state.usage = me.usage || {};
    state.custom = me.custom || [];
    state.stats = me.stats || {};
    state.statsAt = Date.now();
    state.vars = store.get(userKey('vars'), {});
    state.settings = Object.assign({}, DEFAULT_SETTINGS, store.get(userKey('settings'), {}));
    if (LOCAL && state.settings.sort === 'popular') state.settings.sort = 'mine';
    // Before agents were selectable there was only an on/off "/product" option.
    if (state.settings.product === true && !state.settings.agent) state.settings.agent = '/product';
    delete state.settings.product;
    if (!['', 'docx', 'xlsx'].includes(state.settings.fileOut)) state.settings.fileOut = '';
    state.bannerDismissed = false;
  }

  function onSignedIn(me) {
    loadUserState(me);
    if (state.config && state.config.requirePasswordChange && state.user.mustChange) return showAuth('change', { forced: true });
    return showApp();
  }

  async function showApp() {
    if (!D) {
      try { await ensureCatalog(); } catch (e) {
        $('#splash').hidden = false;
        $('#auth').hidden = true;
        $('#splash').innerHTML = `<div class="empty"><h2>The prompt catalog did not load</h2><p>${esc(e.message)} Reload the page to try again.</p><button class="btn" data-act="reload">Reload</button></div>`;
        return;
      }
    }
    $('#splash').hidden = true;
    $('#auth').hidden = true;
    $('#auth').innerHTML = '';
    $('#app').hidden = false;
    renderUserChrome();
    startHeartbeat();
    route();
  }

  function onSignedOut(message) {
    flush();
    sendHeartbeat();
    stopHeartbeat();
    state.user = null;
    state.favs = new Set(); state.ratings = {}; state.usage = {}; state.custom = []; state.vars = {};
    if (window.QPHComment && window.QPHComment.reset) window.QPHComment.reset();
    closeModal();
    showAuth('signin', { message });
  }

  /* ================= Views ================= */
  function setView(html, title) {
    view.innerHTML = html;
    document.title = (title ? title + ' | ' : '') + ((D && D.meta.appName) || (state.config && state.config.appName) || 'QAgent Prompt Hub');
  }

  function viewHome() {
    state.current = { type: 'home' };
    const prompts = allPrompts();
    const stageCounts = {};
    const catCounts = {};
    prompts.forEach((p) => { stageCounts[p.stage] = (stageCounts[p.stage] || 0) + 1; catCounts[p.category] = (catCounts[p.category] || 0) + 1; });
    const favs = prompts.filter((p) => state.favs.has(p.id)).slice(0, 4);
    const first = String(state.user.name || '').split(/\s+/)[0];

    setView(`
      <section class="hero">
        <img class="hero-mark" src="${esc(ASSET.mark)}" alt="">
        <div>
          <p class="hero-hello">${LOCAL ? 'Local edition' : isAdmin() ? 'Signed in as administrator' : `Hi ${esc(first)}`}</p>
          <h1>The right QAgent prompt for every ticket</h1>
          <p class="hero-sub">${prompts.length} prompts for Credible, CareLogic and InSync. Set the work item once, fill in a few details and copy one message into QAgent.</p>
          <div class="ticket-actions" style="margin-top:24px">
            <a class="btn btn-lg btn-on-dark" href="#/prompts">${icon('list')}<span>Browse prompts</span></a>
            <a class="btn btn-lg btn-ghost on-dark" href="#/troubleshoot">${icon('wrench')}<span>Troubleshooting guide</span></a>
            <a class="btn btn-lg btn-ghost on-dark" href="#/comment">${icon('message')}<span>Write a ticket comment</span></a>
          </div>
        </div>
        <div class="ticket-panel" id="heroTicket">${heroTicketHTML()}</div>
      </section>

      ${favs.length ? `<section class="section" aria-labelledby="favTitle">
        <div class="section-head"><h2 id="favTitle">Your favorites</h2><a href="#/favorites">Open favorites</a></div>
        <div class="cards grid">${favs.map(cardHTML).join('')}</div>
      </section>` : ''}

      <section class="lane" aria-labelledby="laneTitle">
        <div class="section-head"><h2 id="laneTitle">Find prompts by PDLC stage</h2><a href="#/playbook">Open the playbook</a></div>
        <ol class="lane-track">
          ${D.stages.map((s, i) => `<li><a href="#/prompts?stage=${s.id}" title="${esc(s.goal)}"><span class="n">${i + 1}</span><span class="nm">${esc(s.name)}</span><span class="ct">${plural(stageCounts[s.id] || 0, 'prompt')}</span></a></li>`).join('')}
        </ol>
      </section>

      <div class="home-grid">
        <section aria-labelledby="recipesTitle">
          <div class="section-head"><h2 id="recipesTitle">Recipes for common situations</h2></div>
          <div class="recipes">${D.recipes.map(recipeHTML).join('')}</div>
        </section>
        <section class="panel" aria-labelledby="qsTitle">
          <h2 id="qsTitle">Using QAgent in three steps</h2>
          <ol class="quickstart">
            <li><span class="num">1</span><div><b>Set the work item once</b><p>Paste the Azure DevOps link. The ID and the platform are detected for every prompt.</p></div></li>
            <li><span class="num">2</span><div><b>Pick a prompt and fill in the details</b><p>The preview shows exactly what QAgent will receive.</p></div></li>
            <li><span class="num">3</span><div><b>Copy one message into QAgent</b><p>It already includes the platform, the work item and the request. QAgent loads the ticket and reads the code by itself.</p></div></li>
          </ol>
          <p class="muted" style="font-size:13.5px">Moving to another ticket? Send <code>/new</code> first.</p>
        </section>
      </div>

      <section class="section" aria-labelledby="popTitle">
        <div class="section-head">
          <h2 id="popTitle">${LOCAL ? 'Good places to start' : 'Popular prompts'}</h2>
          <div class="segmented" role="group" aria-label="Order popular prompts">
            ${(LOCAL ? [['popular', 'Most used by you'], ['rated', 'Rated highest by you'], ['code', 'Reads code']] : [['popular', 'Most used'], ['rated', 'Top rated'], ['code', 'Reads code']]).map(([k, l]) => `<button data-act="home-tab" data-tab="${k}" aria-pressed="${state.homeTab === k}">${l}</button>`).join('')}
          </div>
        </div>
        <div class="cards grid" id="homePopular">${homePopularHTML()}</div>
      </section>

      <section class="section" aria-labelledby="catTitle">
        <div class="section-head"><h2 id="catTitle">Browse by category</h2></div>
        <div class="cat-grid">${D.categories.map((c) => `<a class="cat-tile" style="--cat:${c.color}" href="#/prompts?cat=${c.id}"><span class="nm">${esc(c.name)}<span>${catCounts[c.id] || 0}</span></span><span class="ds">${esc(c.description || '')}</span></a>`).join('')}</div>
      </section>
    `);
  }

  function homePopularHTML() {
    const list = D.prompts.slice();
    const st = (id) => state.stats[id] || {};
    let out;
    if (state.homeTab === 'rated') {
      out = list.filter((p) => st(p.id).ratings).sort((a, b) => (st(b.id).avg - st(a.id).avg) || (st(b.id).ratings - st(a.id).ratings));
    } else if (state.homeTab === 'code') {
      out = list.filter(readsCode).sort((a, b) => (st(b.id).copies || 0) - (st(a.id).copies || 0) || (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    } else {
      out = list.filter((p) => st(p.id).copies).sort((a, b) => st(b.id).copies - st(a.id).copies);
    }
    if (out.length < 3) out = out.concat(list.filter((p) => p.featured && !out.includes(p)));
    return out.slice(0, 6).map(cardHTML).join('');
  }

  function heroTicketHTML(forceForm) {
    const id = varValue('WORK_ITEM_ID');
    const plat = varValue('PLATFORM');
    if (id && !forceForm) {
      return `
        <h2>Work item set</h2>
        <div class="ticket-loaded">${icon('ticket')}<div><div class="num">${esc(id)}</div><div class="meta">${plat ? 'On ' + esc(plat) + '. ' : ''}Every prompt includes it.</div></div></div>
        <div class="ticket-actions">
          <a class="btn btn-primary" href="#/prompt/ticket-review">Start with a deep review</a>
          <a class="btn btn-ghost" href="#/prompt/config-or-defect">Configuration or defect?</a>
        </div>
        <div class="ticket-actions">
          <button class="btn btn-sm btn-ghost" data-act="hero-edit">Change work item</button>
          <button class="btn btn-sm btn-ghost" data-act="ticket-clear">Clear</button>
        </div>`;
    }
    return `
      <h2>Start with a work item</h2>
      <p>Paste the Azure DevOps link once. The ID and the platform are added to every prompt.</p>
      ${ticketFieldsHTML('hero')}
      <div class="ticket-actions"><button class="btn btn-primary" data-act="hero-load">${icon('check')}<span>Use this work item</span></button></div>`;
  }

  function recipeHTML(r) {
    const steps = r.steps.map(getPrompt).filter(Boolean);
    return `<article class="recipe"><h3>${esc(r.title)}</h3><p class="when">${esc(r.when)}</p><ol>${steps.map((p) => `<li><a href="#/prompt/${encodeURIComponent(p.id)}">${esc(p.title)}</a></li>`).join('')}</ol></article>`;
  }

  /* ---------- Library ---------- */
  function scorePrompt(p, terms) {
    const cat = catById[p.category] || FALLBACK_CAT;
    const st = stageById[p.stage];
    const fields = [[p.title, 6], [(p.tags || []).join(' '), 4], [cat.name, 3], [st ? st.name : '', 3], [p.description, 2], [p.template, 1]];
    let total = 0;
    for (const t of terms) {
      let best = 0;
      for (const [f, w] of fields) if (String(f || '').toLowerCase().includes(t)) best = Math.max(best, w);
      if (!best) return 0;
      total += best;
    }
    return total;
  }

  function filterPrompts(params, opts) {
    let list = allPrompts();
    if (opts.mine) list = list.filter((p) => p.mine);
    if (params.cat) list = list.filter((p) => p.category === params.cat);
    if (params.stage) list = list.filter((p) => p.stage === params.stage);
    if (params.type === 'ticket') list = list.filter((p) => ticketMode(p) === 'required');
    if (params.type === 'code') list = list.filter(readsCode);
    if (params.type === 'free') list = list.filter((p) => ticketMode(p) !== 'required');
    const q = String(params.q || '').trim().toLowerCase();
    const stageN = (p) => (stageById[p.stage] ? stageById[p.stage].n : 99);
    const sort = LOCAL && state.settings.sort === 'popular' ? 'mine' : state.settings.sort;
    const byTitle = (a, b) => a.title.localeCompare(b.title);
    if (q) {
      const terms = q.split(/\s+/).filter(Boolean);
      const scored = list.map((p) => ({ p, s: scorePrompt(p, terms) })).filter((x) => x.s > 0);
      if (sort === 'relevance') return scored.sort((a, b) => b.s - a.s).map((x) => x.p);
      list = scored.map((x) => x.p);
    }
    const st = (id) => state.stats[id] || {};
    const us = (id) => state.usage[id] || {};
    if (sort === 'az') return list.sort(byTitle);
    if (sort === 'popular') return list.sort((a, b) => (st(b.id).copies || 0) - (st(a.id).copies || 0) || byTitle(a, b));
    if (sort === 'rated') return list.sort((a, b) => (st(b.id).avg || 0) - (st(a.id).avg || 0) || (st(b.id).ratings || 0) - (st(a.id).ratings || 0) || byTitle(a, b));
    if (sort === 'mine') return list.sort((a, b) => (us(b.id).count || 0) - (us(a.id).count || 0) || byTitle(a, b));
    if (sort === 'recent') return list.sort((a, b) => (us(b.id).last || 0) - (us(a.id).last || 0) || byTitle(a, b));
    return list.sort((a, b) => stageN(a) - stageN(b) || byTitle(a, b));
  }

  function viewLibrary(params, opts) {
    state.current = { type: 'library', params, opts };
    const cat = params.cat ? catById[params.cat] : null;
    const st = params.stage ? stageById[params.stage] : null;
    let title = 'All prompts';
    let sub = 'Pick a prompt, fill in the details and copy one message into QAgent.';
    if (opts.mine) { title = 'My prompts'; sub = 'Prompts you wrote or duplicated. Only you can see them; use "Copy as catalog entry" to propose one for everyone.'; }
    else if (cat) { title = cat.name; sub = cat.description; }
    else if (st) { title = `Stage ${st.n}: ${st.name}`; sub = st.goal; }

    const base = opts.mine ? 'mine' : 'prompts';
    const chip = (id, label, color) => {
      const np = Object.assign({}, params, { cat: id });
      if (!id) delete np.cat;
      return `<a class="fchip" href="#/${base}${qs(np)}" aria-pressed="${(params.cat || '') === (id || '')}">${color ? `<i style="--cat:${color}"></i>` : ''}${esc(label)}</a>`;
    };

    setView(`
      <div class="page-head">
        <div>
          ${cat || st ? `<nav class="crumbs"><a href="#/prompts">All prompts</a><span aria-hidden="true">/</span><span>${esc(title)}</span></nav>` : ''}
          <h1>${esc(title)}</h1>
          <p>${esc(sub)}</p>
        </div>
        ${opts.mine ? `<div class="detail-actions">
          <a class="btn btn-primary" href="#/new">${icon('plus')}<span>New prompt</span></a>
          <button class="btn" data-act="import">${icon('upload')}<span>Import</span></button>
          <button class="btn" data-act="export">${icon('download')}<span>Export</span></button>
        </div>` : ''}
      </div>
      <div class="filter-chips" aria-label="Filter by category">${chip('', 'All categories')}${D.categories.map((c) => chip(c.id, c.name, c.color)).join('')}</div>
      <div class="toolbar" style="margin-top:14px">
        <label class="inline">Stage
          <select class="select-inline" data-filter="stage">
            <option value="">All stages</option>
            ${D.stages.map((s, i) => `<option value="${s.id}" ${params.stage === s.id ? 'selected' : ''}>${i + 1}. ${esc(s.name)}</option>`).join('')}
          </select>
        </label>
        <label class="inline">Type
          <select class="select-inline" data-filter="type">
            ${[['', 'All prompts'], ['code', 'Reads the code'], ['ticket', 'About a work item'], ['free', 'Work item optional']].map(([v, l]) => `<option value="${v}" ${(params.type || '') === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        <label class="inline">Sort
          <select class="select-inline" data-filter="sort">
            ${(LOCAL ? [['relevance', 'PDLC order'], ['mine', 'Most copied'], ['rated', 'Rated highest'], ['recent', 'Recently copied'], ['az', 'A to Z']] : [['relevance', 'PDLC order'], ['popular', 'Most used'], ['rated', 'Top rated'], ['mine', 'Most copied by me'], ['recent', 'Recently copied by me'], ['az', 'A to Z']]).map(([v, l]) => `<option value="${v}" ${state.settings.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        <span class="spacer"></span>
        <div class="segmented" role="group" aria-label="Layout">
          <button data-act="view-mode" data-mode="grid" aria-pressed="${state.settings.view === 'grid'}">${icon('grid', 'i-sm')}<span>Cards</span></button>
          <button data-act="view-mode" data-mode="rows" aria-pressed="${state.settings.view === 'rows'}">${icon('rows', 'i-sm')}<span>List</span></button>
        </div>
      </div>
      <p class="result-count" id="resultCount"></p><div id="results"></div>`, title);
    renderResults();
  }

  function renderResults() {
    const cur = state.current;
    if (!cur || cur.type !== 'library') return;
    const { params } = parseHash();
    cur.params = params;
    const list = filterPrompts(params, cur.opts);
    const q = String(params.q || '').trim();
    const results = $('#results');
    if (!results) return;
    $('#resultCount').innerHTML = `<b>${plural(list.length, 'prompt')}</b>${q ? ` matching "${esc(q)}"` : ''}`;
    if (!list.length) {
      let empty;
      if (cur.opts.mine && !q) empty = `<h2>You have not created any prompts yet</h2><p>Write your own, or duplicate a catalog prompt and adapt it to your team.</p><a class="btn btn-primary" href="#/new">${icon('plus')}<span>New prompt</span></a>`;
      else empty = `<h2>No prompts match</h2><p>Try fewer words, another category, or clear the filters. Missing a prompt? <a href="#/new">Write it</a> and propose it to the catalog.</p><a class="btn" href="#/${cur.opts.mine ? 'mine' : 'prompts'}">Clear filters</a>`;
      results.className = '';
      results.innerHTML = `<div class="empty">${empty}</div>`;
      return;
    }
    results.className = 'cards ' + (state.settings.view === 'rows' ? 'rows' : 'grid');
    results.innerHTML = list.map(cardHTML).join('');
  }

  /* ---------- Favorites zone ---------- */
  function viewFavorites() {
    state.current = { type: 'favorites' };
    const prompts = allPrompts();
    const saved = Array.from(state.favs).map(getPrompt).filter(Boolean);
    const used = prompts.filter((p) => state.usage[p.id] && state.usage[p.id].count);
    const often = used.filter((p) => !state.favs.has(p.id)).sort((a, b) => state.usage[b.id].count - state.usage[a.id].count).slice(0, 6);
    const recent = used.slice().sort((a, b) => state.usage[b.id].last - state.usage[a.id].last).slice(0, 8);

    setView(`
      <div class="page-head"><div><h1>Favorites</h1><p>Your saved prompts, plus the ones you copy most, so the prompts you rely on are one click away. ${LOCAL ? 'They are saved in this browser; export them from Settings to move them to another computer.' : 'Favorites follow your account on any computer.'}</p></div></div>
      <section aria-labelledby="savedTitle">
        <div class="section-head"><h2 id="savedTitle">Saved prompts <span class="count-pill">${saved.length}</span></h2></div>
        ${saved.length ? `<div class="cards grid">${saved.map(cardHTML).join('')}</div>`
          : `<div class="empty"><h2>Nothing saved yet</h2><p>Select ${icon('bookmark', 'i-sm')} on any prompt to keep it here.</p><a class="btn" href="#/prompts">Browse prompts</a></div>`}
      </section>
      ${often.length ? `<section class="section" aria-labelledby="oftenTitle">
        <div class="section-head"><h2 id="oftenTitle">You copy these often</h2><span class="muted" style="font-size:14px">Save them to keep them at the top</span></div>
        <div class="cards grid">${often.map(cardHTML).join('')}</div>
      </section>` : ''}
      ${recent.length ? `<section class="section" aria-labelledby="recentTitle">
        <div class="section-head"><h2 id="recentTitle">Recently copied</h2></div>
        <div class="panel table-panel"><table class="data-table">
          <thead><tr><th scope="col">Prompt</th><th scope="col">Last copied</th><th scope="col" class="num">Times</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead>
          <tbody>${recent.map((p) => `<tr><td><a href="#/prompt/${encodeURIComponent(p.id)}">${esc(p.title)}</a></td><td>${esc(timeAgo(state.usage[p.id].last))}</td><td class="num">${num(state.usage[p.id].count)}</td>
            <td class="actions">${favButton(p)}<button class="btn btn-sm btn-ghost" data-act="copy-prompt" data-id="${esc(p.id)}">${icon('copy', 'i-sm')}<span>Copy</span></button></td></tr>`).join('')}</tbody>
        </table></div>
      </section>` : ''}
    `, 'Favorites');
  }

  /* ---------- Prompt detail ---------- */
  function viewPrompt(id) {
    const p = getPrompt(id);
    if (!p) return viewNotFound('That prompt does not exist or was deleted.');
    state.current = { type: 'prompt', id: p.id };
    const cat = catById[p.category] || FALLBACK_CAT;
    const st = stageById[p.stage];
    const mode = ticketMode(p);
    const keys = fieldKeys(p);
    const fav = state.favs.has(p.id);
    const hasPaste = keys.some((k) => varDef(k).type === 'textarea');
    const related = allPrompts().filter((x) => x.stage === p.stage && x.id !== p.id).slice(0, 3);
    const qagent = D.meta.qagentLink ? `<a class="btn btn-ghost" href="${esc(D.meta.qagentLink)}" target="_blank" rel="noopener">${icon('external', 'i-sm')}<span>Open QAgent</span></a>` : '';
    const ticketGroup = mode !== 'none'
      ? `<div class="form-group"><div class="form-group-title">Work item <span class="sub">${mode === 'required' ? 'Shared by every prompt' : 'Optional for this prompt'}</span></div>${fieldHTML('WORK_ITEM_URL', 'f', { optional: mode === 'optional' })}<div class="two">${fieldHTML('WORK_ITEM_ID', 'f', { optional: mode === 'optional' })}${fieldHTML('PLATFORM')}</div></div>`
      : (usesPlatform(p) ? `<div class="form-group"><div class="form-group-title">Platform</div>${fieldHTML('PLATFORM')}</div>` : '');
    const ticketNote = mode === 'required' ? 'About a work item' : mode === 'optional' ? 'Work item optional' : 'No work item needed';

    if (lastView.id !== p.id || Date.now() - lastView.at > 30000) { track('view', p.id); lastView = { id: p.id, at: Date.now() }; }

    setView(`
      <nav class="crumbs"><a href="#/prompts">All prompts</a><span aria-hidden="true">/</span><a href="#/prompts?cat=${cat.id}">${esc(cat.name)}</a></nav>
      <div class="detail-head">
        <div>
          <h1>${esc(p.title)}</h1>
          <p class="detail-desc">${esc(p.description || '')}</p>
          <div class="detail-meta">
            ${catChip(cat, true)}${stageBadge(st, true)}${readsCode(p) ? codeBadge() : ''}<span class="flag-badge">${icon('ticket', 'i-sm')}${ticketNote}</span>${p.mine ? '<span class="pill-mine">My prompt</span>' : ''}
            <span id="detailRating">${ratingBadge(p.id)}</span>
            ${(p.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
          </div>
        </div>
        <div class="detail-actions">
          <button class="btn btn-sm fav-toggle ${fav ? 'is-on' : ''}" data-act="fav" data-id="${esc(p.id)}" aria-pressed="${fav}">${icon('bookmark')}<span>${fav ? 'Saved' : 'Save to favorites'}</span></button>
          <button class="btn btn-sm" data-act="share" data-id="${esc(p.id)}">${icon('link')}<span>Copy link</span></button>
          <button class="btn btn-sm" data-act="download" data-id="${esc(p.id)}">${icon('download')}<span>Download .md</span></button>
          ${p.mine
            ? `<a class="btn btn-sm" href="#/edit/${encodeURIComponent(p.id)}">${icon('pen')}<span>Edit</span></a><button class="btn btn-sm" data-act="catalog-entry" data-id="${esc(p.id)}">${icon('copy')}<span>Copy as catalog entry</span></button>`
            : `<a class="btn btn-sm" href="#/new?from=${encodeURIComponent(p.id)}">${icon('duplicate')}<span>Duplicate and edit</span></a>`}
        </div>
      </div>

      <div class="composer">
        <aside class="form-panel" aria-label="Prompt details">
          ${ticketGroup}
          ${keys.length ? `<div class="form-group"><div class="form-group-title">Details</div>${keys.map((k) => fieldHTML(k)).join('')}
            ${hasPaste ? `<p class="form-note">${icon('shield')}<span>Pasted text stays in this browser tab and is never saved. Remove patient names and other identifiers before pasting.</span></p>` : ''}</div>` : ''}
          <div class="form-group">
            <div class="form-group-title">Options</div>
            <div class="field"><span class="field-label">Answer length</span>
              <div class="segmented" role="group" aria-label="Answer length">
                ${Object.keys(D.lengths).map((k) => `<button data-act="length" data-len="${k}" aria-pressed="${state.settings.length === k}">${esc(D.lengths[k].label)}</button>`).join('')}
              </div>
            </div>
            <label class="switch"><input type="checkbox" data-setting="guardrail" ${state.settings.guardrail ? 'checked' : ''}><span><b>Add PHI guardrail</b><small>Asks QAgent not to repeat patient identifiers and to flag anything it does not know.</small></span></label>
            ${agentFieldHTML('opt')}
            ${fileFieldHTML()}
            ${keys.length ? `<div><button class="btn btn-sm btn-ghost" data-act="clear-fields" data-id="${esc(p.id)}">${icon('x', 'i-sm')}<span>Clear details</span></button></div>` : ''}
          </div>
        </aside>

        <section class="send" aria-labelledby="sendTitle">
          <div class="send-head">
            <div><h2 id="sendTitle">Send to QAgent</h2><p>One message with the platform, the work item and the request. Paste it into QAgent as it is.</p></div>
          </div>
          <div class="prompt-box" id="promptBox">${promptBoxInner(p, qagent)}</div>
          <p class="send-hint">${icon('info', 'i-sm')}<span>Moving to a different ticket? Send <code>/new</code> first so details from the previous one do not carry over.</span><button class="btn btn-sm btn-ghost" data-act="copy-new">${icon('copy', 'i-sm')}<span>Copy /new</span></button></p>
          <section class="rate panel" id="ratePanel" aria-labelledby="rateTitle">${ratePanelHTML(p)}</section>
        </section>
      </div>

      ${related.length ? `<section class="related"><div class="section-head"><h2>More for the ${esc(st ? st.name : '')} stage</h2><a href="#/prompts?stage=${p.stage}">See all</a></div><div class="cards grid">${related.map(cardHTML).join('')}</div></section>` : ''}
    `, p.title);
    updateMissingFields(p);
  }

  function promptBoxInner(p, qagent) {
    const miss = missingVars(p);
    const text = buildPrompt(p, false);
    const words = text.split(/\s+/).filter(Boolean).length;
    return `<div class="prompt-box-head"><span>Prompt preview</span>${miss.length
        ? `<span class="status-warn">To fill in: ${esc(miss.map((k) => varDef(k).label).join(', '))}</span>`
        : `<span class="status-ok">${icon('check', 'i-sm')}Ready to send</span>`}</div>
      <pre class="prompt-out" id="promptOut">${buildPrompt(p, true)}</pre>
      <div class="prompt-box-foot">
        <button class="btn btn-primary btn-lg" data-act="copy-prompt" data-id="${esc(p.id)}">${icon('copy')}<span>Copy prompt</span></button>
        ${qagent || ''}
        <span class="hint">${words} words</span>
      </div>`;
  }

  function ratePanelHTML(p) {
    const mine = state.ratings[p.id];
    const stars = mine ? mine.stars : 0;
    const s = state.stats[p.id];
    return `<div class="rate-head">
        <h3 id="rateTitle">How useful is this prompt?</h3>
        <span class="rate-summary">${LOCAL ? 'Your rating is saved in this browser.' : s && s.ratings ? `${icon('star', 'i-sm')}<b>${s.avg.toFixed(1)}</b> average from ${plural(s.ratings, 'rating')}` : 'No ratings yet. Be the first.'}</span>
      </div>
      <div class="stars" role="radiogroup" aria-labelledby="rateTitle" id="starGroup">
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" class="star ${n <= stars ? 'on' : ''}" data-act="rate" data-stars="${n}" data-id="${esc(p.id)}" aria-checked="${n === stars}" aria-label="${n} ${n === 1 ? 'star' : 'stars'}: ${STAR_WORDS[n]}" tabindex="${(stars ? n === stars : n === 1) ? 0 : -1}">${icon('star')}</button>`).join('')}
        <span class="star-word" id="starWord">${stars ? `You rated it: ${STAR_WORDS[stars]}` : 'Select a star to rate'}</span>
      </div>
      ${stars ? `<div class="rate-comment">
        <label for="rateComment">What would make it more useful? <span class="opt">${LOCAL ? 'optional, kept in this browser with your rating' : 'optional, the prompt maintainers read these'}</span></label>
        <textarea id="rateComment" rows="2" maxlength="1000" placeholder="e.g. It should also ask QAgent for the configuration path">${esc(mine.comment || '')}</textarea>
        <div class="form-actions"><button class="btn btn-sm" data-act="rate-comment" data-id="${esc(p.id)}">${icon('message', 'i-sm')}<span>Save comment</span></button><button class="btn btn-sm btn-ghost" data-act="rate-clear" data-id="${esc(p.id)}">Remove my rating</button></div>
      </div>` : ''}`;
  }

  function updateMissingFields(p) {
    const show = state.showMissing[p.id];
    const miss = new Set(missingVars(p));
    $$('.form-panel .field[data-key]').forEach((f) => f.classList.toggle('is-missing', !!show && miss.has(f.dataset.key)));
  }

  function refreshComposer() {
    if (!state.current || state.current.type !== 'prompt') return;
    const p = getPrompt(state.current.id);
    const box = $('#promptBox');
    if (!p || !box) return;
    const out = $('#promptOut');
    const scroll = out ? out.scrollTop : 0;
    const qagent = D.meta.qagentLink ? `<a class="btn btn-ghost" href="${esc(D.meta.qagentLink)}" target="_blank" rel="noopener">${icon('external', 'i-sm')}<span>Open QAgent</span></a>` : '';
    box.innerHTML = promptBoxInner(p, qagent);
    const out2 = $('#promptOut');
    if (out2) out2.scrollTop = scroll;
    updateMissingFields(p);
  }

  /* ---------- Troubleshooting ---------- */
  function viewTroubleshoot() {
    state.current = { type: 'troubleshoot' };
    const T = D.troubleshooting || { symptoms: [], rules: [] };
    const promptChip = (id) => { const p = getPrompt(id); if (!p) return ''; const c = catById[p.category] || FALLBACK_CAT; return `<a href="#/prompt/${encodeURIComponent(p.id)}" style="--cat:${c.color}"><i></i>${esc(p.title)}</a>`; };
    setView(`
      <div class="page-head"><div><h1>Troubleshooting guide</h1><p>${esc(T.intro || '')}</p></div></div>

      <section aria-labelledby="verdictTitle">
        <div class="section-head"><h2 id="verdictTitle">Configuration, data, code or environment?</h2><a href="#/prompt/config-or-defect">Ask QAgent to decide</a></div>
        <div class="verdicts">${T.rules.map((r) => `<div class="verdict"><b>${esc(r.verdict)}</b><p>${esc(r.test)}</p></div>`).join('')}</div>
      </section>

      <section class="section" aria-labelledby="symTitle">
        <div class="section-head"><h2 id="symTitle">Common causes by symptom</h2></div>
        <div class="symptoms">
          ${T.symptoms.map((s, i) => `<details class="symptom" ${i === 0 ? 'open' : ''} id="sym-${esc(s.id)}">
            <summary><span>${esc(s.title)}</span><small>${plural(s.causes.length, 'common cause')}</small></summary>
            <div class="symptom-body">
              <table class="data-table causes"><thead><tr><th scope="col">Cause</th><th scope="col">How to check</th></tr></thead>
                <tbody>${s.causes.map((c) => `<tr><td>${esc(c.cause)}</td><td>${esc(c.check)}</td></tr>`).join('')}</tbody></table>
              <p class="field-label" style="margin-top:14px">Prompts for this</p>
              <div class="stage-prompts">${s.prompts.map(promptChip).join('')}</div>
            </div>
          </details>`).join('')}
        </div>
      </section>

      <section class="section" aria-labelledby="platTitle">
        <div class="section-head"><h2 id="platTitle">Platform notes</h2><a href="#/about">How to update them</a></div>
        <p class="muted" style="margin:-6px 0 14px;max-width:72ch">Code-reading prompts include these notes so QAgent knows where each platform keeps configuration and permissions.</p>
        <div class="platforms">${D.platforms.filter((p) => p.name !== 'Other').map((p) => `<div class="platform-card"><h3>${esc(p.name)}</h3>${p.notes ? `<p>${esc(p.notes)}</p>` : `<p class="muted">No notes yet. The ${esc(p.name)} team can add the repositories and the tables that hold configuration and permissions in <code>catalog/prompts.js</code>.</p>`}</div>`).join('')}</div>
      </section>
    `, 'Troubleshooting guide');
  }

  /* ---------- Playbook ---------- */
  function viewPlaybook() {
    state.current = { type: 'playbook' };
    const prompts = allPrompts();
    setView(`
      <div class="page-head"><div><h1>PDLC playbook</h1><p>What to aim for at each stage of a ticket, and the prompts that help you get there. Stage names follow the team's working version of the PDLC and can be adjusted in the catalog.</p></div></div>
      <ol class="stages">
        ${D.stages.map((s, i) => {
          const list = prompts.filter((p) => p.stage === s.id);
          return `<li class="stage-row" id="stage-${s.id}"><span class="n">${i + 1}</span><div class="stage-body">
            <h2>${esc(s.name)}</h2>
            <p class="goal">${esc(s.goal)}</p>
            <p class="done">${icon('check')}<span>Done when: ${esc(s.done)}</span></p>
            <div class="stage-prompts">${list.length ? list.map((p) => `<a href="#/prompt/${encodeURIComponent(p.id)}" style="--cat:${(catById[p.category] || FALLBACK_CAT).color}"><i></i>${esc(p.title)}</a>`).join('') : '<span class="muted">No prompts yet. <a href="#/new">Write one</a>.</span>'}</div>
          </div></li>`;
        }).join('')}
      </ol>
      <section class="section"><div class="section-head"><h2>Recipes</h2></div><div class="recipes">${D.recipes.map(recipeHTML).join('')}</div></section>
    `, 'PDLC playbook');
  }

  /* ---------- Commands ---------- */
  function viewCommands() {
    state.current = { type: 'commands' };
    const url = varValue('WORK_ITEM_URL');
    const groups = [];
    D.commands.forEach((c) => { let g = groups.find((x) => x.name === c.group); if (!g) { g = { name: c.group, items: [] }; groups.push(g); } g.items.push(c); });
    const cmdText = (c) => (c.cmd === '/product' && url ? '/product ' + url : c.cmd + (c.args ? ' ' + c.args : ''));
    setView(`
      <div class="page-head"><div><h1>QAgent commands</h1><p>Built-in commands work in any Qualifacts agent. Copy one and paste it into the chat.</p></div></div>
      <section class="panel" aria-labelledby="flowTitle">
        <h2 id="flowTitle">What QAgent does with a prompt from this hub</h2>
        <ol class="flow">
          <li><span class="num">1</span><b>Sets the platform</b><p>The first line names Credible, CareLogic or InSync, so QAgent does not need to ask.</p></li>
          <li><span class="num">2</span><b>Pulls the work item</b><p>It loads the ticket from Azure DevOps: description, comments and attachments.</p></li>
          <li><span class="num">3</span><b>Searches and reads the code</b><p>For code prompts it searches the repository and opens the pages, code-behind and procedures involved.</p></li>
          <li><span class="num">4</span><b>Answers with evidence</b><p>File paths, quoted code, read-only queries and a verdict you can paste into the ticket.</p></li>
        </ol>
      </section>
      ${(D.agents || []).length ? `<section class="section" aria-labelledby="agentsTitle">
        <div class="section-head"><h2 id="agentsTitle">Agents</h2></div>
        <p class="muted">Pick one under <b>Options &gt; QAgent agent</b> on any prompt and the prompt starts with its command. Send <code>/switch</code> in QAgent to see every agent you can reach; the hub maintainers can add them to the catalog.</p>
        <div class="cmd-list">${D.agents.map((a) => `<article class="cmd-card">
          <div class="cmd-line"><code>${esc(a.cmd)}${a.takesWorkItem ? ' ' + esc(url || '<work item URL>') : ''}</code><button class="copy-mini" data-act="copy-cmd" data-cmd="${esc(a.cmd)}">${icon('copy')}<span>Copy</span></button></div>
          <p><b>${esc(a.name)}.</b> ${esc(a.desc)}</p>
        </article>`).join('')}</div>
      </section>` : ''}
      <div class="cmd-groups section">
        ${groups.map((g) => `<section class="cmd-group"><h2>${esc(g.name)}</h2><div class="cmd-list">
          ${g.items.map((c) => `<article class="cmd-card">
            <div class="cmd-line"><code>${esc(cmdText(c))}</code><button class="copy-mini" data-act="copy-cmd" data-cmd="${esc(c.cmd)}">${icon('copy')}<span>Copy</span></button></div>
            <p>${esc(c.desc)}</p>
            <p class="when"><b>When to use it.</b> ${esc(c.when)}</p>
            ${c.aliases ? `<p class="aliases">Also works as ${c.aliases.map((a) => `<code>${esc(a)}</code>`).join(' and ')}</p>` : ''}
          </article>`).join('')}
        </div></section>`).join('')}
      </div>
    `, 'QAgent commands');
  }

  /* ---------- Editor ---------- */
  function viewEditor(id, params) {
    const existing = id ? state.custom.find((x) => x.id === id) : null;
    if (id && !existing) return viewNotFound('Only your own prompts can be edited. Duplicate a catalog prompt to adapt it.');
    const source = existing || (params.from ? getPrompt(params.from) : null);
    const draft = source
      ? Object.assign({}, source, existing ? {} : { title: source.title + ' (my version)' })
      : { title: '', description: '', category: 'triage', stage: 'intake', tags: [], ticket: 'required', template: '' };
    state.current = { type: 'editor', id: existing ? existing.id : null };
    const common = ['SCREEN', 'MISSING_ITEM', 'ERROR_TEXT', 'USER_ROLE', 'CUSTOMER', 'FEATURE', 'ENVIRONMENT', 'AUDIENCE', 'EXTRA_CONTEXT', 'CODE_EVIDENCE', 'PLATFORM_NOTES'];
    const mode = ticketMode(draft);
    setView(`
      <nav class="crumbs"><a href="#/mine">My prompts</a><span aria-hidden="true">/</span><span>${existing ? 'Edit' : 'New'}</span></nav>
      <div class="page-head"><div><h1>${existing ? 'Edit prompt' : source ? 'Duplicate prompt' : 'New prompt'}</h1><p>Your prompts are saved ${LOCAL ? 'in this browser' : 'to your account and only you can see them'}. To share one with everyone, use "Copy as catalog entry" and open a pull request.</p></div></div>
      <div class="editor">
        <form class="editor-main" id="editorForm" novalidate>
          <div class="field"><label for="edTitle">Title</label><input id="edTitle" value="${esc(draft.title)}" placeholder="e.g. Explain a CareLogic billing rule" maxlength="120" required><p class="field-error" id="errTitle" hidden>Add a title.</p></div>
          <div class="field"><label for="edDesc">Description <span class="opt">optional</span></label><input id="edDesc" value="${esc(draft.description || '')}" maxlength="300" placeholder="One sentence on what the prompt produces"></div>
          <div class="two">
            <div class="field"><label for="edCat">Category</label><select id="edCat">${D.categories.map((c) => `<option value="${c.id}" ${draft.category === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
            <div class="field"><label for="edStage">PDLC stage</label><select id="edStage">${D.stages.map((s, i) => `<option value="${s.id}" ${draft.stage === s.id ? 'selected' : ''}>${i + 1}. ${esc(s.name)}</option>`).join('')}</select></div>
          </div>
          <div class="two">
            <div class="field"><label for="edTicket">Work item</label><select id="edTicket">
              ${[['required', 'Required: the prompt is about a ticket'], ['optional', 'Optional: added when one is set'], ['none', 'Not used']].map(([v, l]) => `<option value="${v}" ${mode === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select></div>
            <div class="field"><label for="edTags">Tags <span class="opt">comma separated</span></label><input id="edTags" value="${esc((draft.tags || []).join(', '))}" placeholder="billing, carelogic, rules"></div>
          </div>
          <div class="field"><label for="edTemplate">Prompt</label><textarea id="edTemplate" class="template" spellcheck="false" placeholder="On {{SCREEN}}, users cannot ...">${esc(draft.template)}</textarea>
            <p class="help">The hub adds the platform, the work item link and the instruction to load it at the top, so you do not need to write them.</p>
            <p class="field-error" id="errTemplate" hidden>Write the prompt text.</p></div>
          <p class="form-error" id="editorError" role="alert" hidden></p>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">${icon('check')}<span>Save prompt</span></button>
            <a class="btn btn-ghost" href="${existing ? '#/prompt/' + encodeURIComponent(existing.id) : '#/mine'}">Cancel</a>
            <span class="spacer"></span>
            ${existing ? `<button type="button" class="btn btn-danger" data-act="delete" data-id="${esc(existing.id)}">${icon('trash')}<span>Delete</span></button>` : ''}
          </div>
        </form>
        <aside class="editor-side">
          <div class="panel" style="display:grid;gap:10px">
            <h3>Variables in this prompt</h3>
            <div class="var-list" id="edVars"></div>
            <p class="muted" style="font-size:13px">Wrap anything the user fills in with double braces, like <code class="mono" style="font-size:12px">{{ERROR_TEXT}}</code>. Known variables get labels and dropdowns; new ones become text fields.</p>
          </div>
          <div class="panel" style="display:grid;gap:10px">
            <h3>Insert</h3>
            <div class="var-list">${common.map((k) => `<button type="button" class="fchip" data-act="insert-var" data-key="${k}">${esc(k === 'CODE_EVIDENCE' ? 'Code-reading rules' : k === 'PLATFORM_NOTES' ? 'Platform notes' : varDef(k).label)}</button>`).join('')}</div>
          </div>
        </aside>
      </div>
    `, existing ? 'Edit prompt' : 'New prompt');
    renderEditorVars();
  }

  function renderEditorVars() {
    const el = $('#edVars');
    const ta = $('#edTemplate');
    if (!el || !ta) return;
    const keys = templateVars(ta.value);
    el.innerHTML = keys.length
      ? keys.map((k) => `<span class="var-pill ${D.variables[k] || COMPUTED.has(k) ? '' : 'new'}" title="${COMPUTED.has(k) ? 'Filled in automatically' : D.variables[k] ? esc(varDef(k).label) : 'New variable: shown as a text field'}">${esc(k)}</span>`).join('')
      : '<span class="muted" style="font-size:13px">None yet.</span>';
  }

  async function saveEditor() {
    const title = $('#edTitle').value.trim();
    const template = $('#edTemplate').value.trim();
    $('#errTitle').hidden = !!title;
    $('#errTemplate').hidden = !!template;
    if (!title) { $('#edTitle').focus(); return; }
    if (!template) { $('#edTemplate').focus(); return; }
    const body = {
      title, template,
      description: $('#edDesc').value.trim(),
      category: $('#edCat').value,
      stage: $('#edStage').value,
      ticket: $('#edTicket').value,
      tags: $('#edTags').value.split(',').map((t) => t.trim()).filter(Boolean)
    };
    const editingId = state.current && state.current.id;
    try {
      const out = editingId ? await api('PUT', '/api/my-prompts/' + encodeURIComponent(editingId), body) : await api('POST', '/api/my-prompts', body);
      const idx = state.custom.findIndex((x) => x.id === out.prompt.id);
      if (idx >= 0) state.custom[idx] = out.prompt; else state.custom.unshift(out.prompt);
      toast('Prompt saved');
      location.hash = '#/prompt/' + encodeURIComponent(out.prompt.id);
    } catch (e) {
      const el = $('#editorError'); el.textContent = e.message; el.hidden = false;
    }
  }

  function catalogEntry(p) {
    const tpl = String(p.template).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    return `    {
      id: '${slugify(p.title)}',
      title: ${JSON.stringify(p.title)},
      category: '${p.category}', stage: '${p.stage}', ticket: '${ticketMode(p)}',
      tags: ${JSON.stringify(p.tags || [])},
      description: ${JSON.stringify(p.description || '')},
      template: \`${tpl}\`
    },`;
  }

  function promptMarkdown(p) {
    const cat = catById[p.category] || FALLBACK_CAT;
    const st = stageById[p.stage];
    return `# ${p.title}\n\n${p.description || ''}\n\n- Category: ${cat.name}\n- PDLC stage: ${st ? st.n + '. ' + st.name : '-'}\n- Tags: ${(p.tags || []).join(', ') || '-'}\n\n## Prompt for QAgent\n\nPaste this as one message.\n\n\`\`\`text\n${buildPrompt(p, false)}\n\`\`\`\n\n_Generated with ${D.meta.appName}._\n`;
  }

  /* ---------- Settings ---------- */
  function viewSettings(params) {
    state.current = { type: 'settings' };
    const u = state.user;
    const cfg = state.config || { areas: [], systems: [], teams: [] };
    const seg = (key, options, current) => `<div class="segmented" role="group">${options.map(([v, l]) => `<button data-act="setting-seg" data-key="${key}" data-val="${v}" aria-pressed="${current === v}">${l}</button>`).join('')}</div>`;
    setView(`
      <div class="page-head"><div><h1>Settings</h1><p>${LOCAL ? 'Everything in this local edition is saved in this browser only.' : 'Your profile and password are saved to your account. Display and prompt preferences are saved in this browser.'}</p></div></div>
      <div class="settings">
        ${u.role !== 'admin' && !LOCAL ? `<section class="panel" aria-labelledby="profTitle">
          <h2 id="profTitle">Profile</h2>
          <p class="muted">Your team, area and main system group your activity in the usage reports.</p>
          <form id="profileForm" class="settings-form" novalidate>
            <div class="field"><label for="pfEmail">Email</label><input id="pfEmail" value="${esc(u.email)}" disabled></div>
            <div class="field"><label for="pfName">Full name</label><input id="pfName" name="name" value="${esc(u.name)}" maxlength="80" required></div>
            <div class="field"><label for="pfTeam">Team</label><input id="pfTeam" name="team" value="${esc(u.team || '')}" list="pfTeamList" maxlength="60" required>
              <datalist id="pfTeamList">${(cfg.teams || []).map((t) => `<option value="${esc(t)}">`).join('')}</datalist></div>
            <div class="two">
              <div class="field"><label for="pfArea">Area</label><select id="pfArea" name="area">${cfg.areas.map((a) => `<option ${a === u.area ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></div>
              <div class="field"><label for="pfSystem">Main system</label><select id="pfSystem" name="system">${cfg.systems.map((a) => `<option ${a === u.system ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></div>
            </div>
            <p class="form-error" id="profileError" role="alert" hidden></p>
            <div class="form-actions"><button class="btn btn-primary" type="submit">${icon('check')}<span>Save profile</span></button></div>
          </form>
        </section>` : ''}

        ${LOCAL ? '' : `<section class="panel" id="password" aria-labelledby="pwTitle">
          <h2 id="pwTitle">Password</h2>
          ${u.mustChange ? `<p class="callout">${icon('key')}<span>You are still using the initial password. Replace it with one only you know.</span></p>` : '<p class="muted">Changing your password signs you out on other devices.</p>'}
          <form id="passwordForm" class="settings-form" novalidate>
            ${passwordFieldsHTML('pw')}
            <p class="form-error" id="pwError" role="alert" hidden></p>
            <div class="form-actions"><button class="btn btn-primary" type="submit">${icon('check')}<span>Change password</span></button></div>
          </form>
        </section>`}

        <section class="panel">
          <h2>Appearance</h2>
          <div class="settings-row"><div class="lbl"><b>Theme</b><span>System follows your operating system setting.</span></div>${seg('theme', [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], themeSetting())}</div>
        </section>

        <section class="panel">
          <h2>Prompt defaults</h2>
          <div class="settings-row"><div class="lbl"><b>Answer length</b><span>Adds a length instruction to the end of every prompt.</span></div>${seg('length', Object.keys(D.lengths).map((k) => [k, D.lengths[k].label]), state.settings.length)}</div>
          <label class="switch"><input type="checkbox" data-setting="guardrail" ${state.settings.guardrail ? 'checked' : ''}><span><b>Add PHI guardrail to every prompt</b><small>${esc(D.guardrail)}</small></span></label>
          <div class="settings-form">${agentFieldHTML('set')}${fileFieldHTML()}</div>
        </section>

        ${u.role !== 'admin' ? `<section class="panel">
          <h2>Your prompts</h2>
          <p class="muted">${plural(state.custom.length, 'custom prompt')} and ${plural(state.favs.size, 'favorite')} are saved ${LOCAL ? 'in this browser, together with your ratings and copy history. Export them to back them up, move them to another computer or share your prompts with a teammate' : 'to your account. Export them to share your prompts with a teammate'}.</p>
          <div class="form-actions">
            <button class="btn" data-act="export">${icon('download')}<span>Export</span></button>
            <button class="btn" data-act="import">${icon('upload')}<span>Import</span></button>
            ${LOCAL ? `<span class="spacer"></span><button class="btn btn-danger" data-act="local-reset">${icon('trash')}<span>Clear local data</span></button>` : ''}
          </div>
        </section>` : ''}
      </div>
    `, 'Settings');
    if (params && params.section === 'password') {
      const el = $('#password');
      if (el) { el.scrollIntoView({ block: 'start' }); const f = $('#pwCurrent'); if (f) f.focus({ preventScroll: true }); }
    }
  }

  async function saveProfile(form) {
    const body = { name: form.name.value.trim(), team: form.team.value.trim(), area: form.area.value, system: form.system.value };
    const err = $('#profileError');
    err.hidden = true;
    try {
      const out = await api('PATCH', '/api/me', body);
      state.user = out.user;
      renderUserChrome();
      toast('Profile saved');
    } catch (e) { err.textContent = e.message; err.hidden = false; }
  }

  /* ---------- About / contribute ---------- */
  function viewAbout() {
    state.current = { type: 'about' };
    const varsRows = Object.keys(D.variables).map((k) => `<li><code>{{${esc(k)}}}</code> ${esc(D.variables[k].label)}${D.variables[k].optional ? ' (optional)' : ''}</li>`).join('');
    setView(`
      <div class="page-head"><div><h1>Add a prompt</h1><p>Every prompt in the hub lives in one file, so improving the catalog is a small pull request.</p></div></div>
      <div class="prose">
        <h2>For yourself</h2>
        <p>Go to <a href="#/mine">My prompts</a> and select New prompt, or open any catalog prompt and select Duplicate and edit. Your prompts are saved ${LOCAL ? 'in this browser' : 'to your account'} and appear everywhere in the hub with a "Mine" label.</p>
        <h2>For everyone</h2>
        <ol>
          <li>Build and test the prompt in QAgent with a real work item.</li>
          <li>Save it under My prompts and select <b>Copy as catalog entry</b>.</li>
          <li>Paste the entry into the <code>prompts</code> list in <code>catalog/prompts.js</code>.</li>
          <li>Open a pull request with a line on when the prompt helps.</li>
        </ol>
        <h2>What makes a good prompt here</h2>
        <ul>
          <li>One job per prompt. If it needs two outputs, it is probably two prompts.</li>
          <li>Say exactly what to produce: sections, a table with named columns, a word limit.</li>
          <li>For anything that touches code, include <code>{{CODE_EVIDENCE}}</code> so QAgent cites files and lines instead of guessing.</li>
          <li>Ask QAgent to separate configuration, permissions, data and code, and to give read-only checks.</li>
          <li>Never put real patient, customer or credential data in a template or an example.</li>
        </ul>
        <h2>Platform notes</h2>
        <p>Each platform in <code>platforms</code> has a <code>notes</code> field that code-reading prompts include through <code>{{PLATFORM_NOTES}}</code>. Keep them short: the repositories, where customer settings and role permissions are stored, and anything cached at login.</p>
        <h2>Available variables</h2>
        <ul>${varsRows}</ul>
        <h2>Privacy</h2>
        <p>${LOCAL ? 'This local edition runs entirely in your browser. Nothing you type, paste, rate or save is sent anywhere; it stays in this browser until you clear it.' : 'The hub records which prompts you open and copy, your searches and how long the hub is open, so the team can see which prompts help. The text you paste into prompts (code, logs, documents) is never sent to the server.'}</p>
        <p class="muted">Catalog version ${esc(D.meta.version)}, updated ${esc(fmtDate(D.meta.updated))}. Maintained by the ${esc(D.meta.maintainers)}.${D.meta.feedbackLink ? ` <a href="${esc(D.meta.feedbackLink)}" target="_blank" rel="noopener">Send feedback</a>.` : ''}</p>
      </div>
    `, 'Add a prompt');
  }

  function viewNotFound(msg) {
    state.current = { type: 'notfound' };
    setView(`<div class="empty"><h2>Page not found</h2><p>${esc(msg || 'This link does not match anything in the hub.')}</p><a class="btn" href="#/">Go to home</a></div>`, 'Not found');
  }

  /* ================= Modal ================= */
  let lastFocus = null;
  function openModal(html, opts) {
    lastFocus = document.activeElement;
    $('#modalCard').className = 'modal-card' + (opts && opts.wide ? ' wide' : '');
    $('#modalCard').innerHTML = `<button class="icon-btn close" data-act="modal-close" aria-label="Close">${icon('x')}</button>${html}`;
    $('#modal').hidden = false;
    const first = $('#modalCard input, #modalCard select, #modalCard textarea, #modalCard .btn');
    if (first) first.focus();
  }
  function closeModal() {
    if ($('#modal').hidden) return;
    $('#modal').hidden = true;
    $('#modalCard').innerHTML = '';
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  function openTicketModal() {
    openModal(`<h2 id="modalTitle">Work item</h2>
      <p class="muted">Every prompt uses this work item. The link, ID and platform are remembered in this browser.</p>
      ${ticketFieldsHTML('modal')}
      <div class="form-actions"><button class="btn btn-primary" data-act="ticket-done">${icon('check')}<span>Done</span></button><span class="spacer"></span><button class="btn btn-ghost" data-act="ticket-clear">Clear</button></div>`);
  }
  function openShortcuts() {
    openModal(`<h2 id="modalTitle">Keyboard shortcuts</h2>
      <div class="shortcuts"><span><kbd>/</kbd> or <kbd>Ctrl</kbd> <kbd>K</kbd></span><span>Search prompts</span><span><kbd>Esc</kbd></span><span>Close a dialog or leave the search box</span><span><kbd>?</kbd></span><span>Show this list</span></div>`);
  }

  /* ================= Router ================= */
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, query] = h.split('?');
    const parts = path.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch (e) { return s; } });
    const params = {};
    new URLSearchParams(query || '').forEach((v, k) => { params[k] = v; });
    return { parts, params };
  }
  const routeName = () => parseHash().parts[0] || '';

  function route() {
    if (!state.user) return;
    closeNav();
    closeModal();
    toggleUserMenu(false);
    if (window.QPHCharts) window.QPHCharts.hideTip();
    const { parts, params } = parseHash();
    const r = parts[0] || '';
    let active = r || 'home';
    let navParams = params;
    refreshStats().then(() => {
      if (state.current && state.current.type === 'library') renderResults();
      if (state.current && state.current.type === 'home') { const el = $('#homePopular'); if (el) el.innerHTML = homePopularHTML(); }
    });
    switch (r) {
      case '': viewHome(); break;
      case 'prompts': viewLibrary(params, {}); break;
      case 'mine': viewLibrary(params, { mine: true }); break;
      case 'favorites': viewFavorites(); break;
      case 'prompt': {
        viewPrompt(parts[1]);
        const p = getPrompt(parts[1]);
        active = p && p.mine ? 'mine' : 'prompts';
        navParams = p ? { cat: p.category } : {};
        break;
      }
      case 'troubleshoot': viewTroubleshoot(); break;
      case 'playbook': viewPlaybook(); break;
      case 'commands': viewCommands(); break;
      case 'new': viewEditor(null, params); active = 'mine'; break;
      case 'edit': viewEditor(parts[1], params); active = 'mine'; break;
      case 'settings': viewSettings(params); break;
      case 'about': viewAbout(); break;
      case 'comment':
        state.current = { type: 'comment' };
        if (window.QPHComment) window.QPHComment.render(commentCtx);
        else viewNotFound('The comment generator did not load. Reload the page.');
        break;
      case 'admin':
        if (!isAdmin()) { viewNotFound('Only the admin account can open the dashboards.'); break; }
        state.current = { type: 'admin' };
        window.QPHAdmin.render(adminCtx, parts[1] || 'overview', params);
        break;
      default: viewNotFound();
    }
    const gs = $('#globalSearch');
    if (document.activeElement !== gs) gs.value = LIST_ROUTES.includes(r) ? (params.q || '') : '';
    renderNav(active, navParams);
    renderTicketChip();
    if (document.activeElement !== gs && !(state.current && state.current.keepScroll)) {
      if (!(r === 'settings' && params.section)) window.scrollTo(0, 0);
      view.focus({ preventScroll: true });
    }
  }

  let searchTimer = null;
  let lastSearch = '';
  function onSearch(value) {
    const { parts, params } = parseHash();
    const r = parts[0] || '';
    const onList = LIST_ROUTES.includes(r);
    const np = Object.assign({}, onList ? params : {}, { q: value });
    if (!value) delete np.q;
    const hash = '#/' + (onList ? r : 'prompts') + qs(np);
    if (onList) { history.replaceState(null, '', hash); renderResults(); }
    else if (value) { location.hash = hash; }
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q = value.trim();
      if (q.length < 2 || q.toLowerCase() === lastSearch) return;
      lastSearch = q.toLowerCase();
      track('search', null, { meta: { q, results: filterPrompts({ q }, {}).length } });
    }, 1500);
  }

  function navigateWithParam(key, value) {
    const { parts, params } = parseHash();
    const np = Object.assign({}, params, { [key]: value });
    if (!value) delete np[key];
    location.hash = '#/' + (parts[0] || 'prompts') + qs(np);
  }

  const openNav = () => document.body.classList.add('nav-open');
  const closeNav = () => document.body.classList.remove('nav-open');

  /* ================= Variables ================= */
  function setVar(k, v, source) {
    state.vars[k] = v;
    if (k === 'WORK_ITEM_URL') {
      const id = parseWorkItemId(v);
      if (id) { state.vars.WORK_ITEM_ID = id; syncFields('WORK_ITEM_ID', id, source); }
      const plat = guessPlatform(v);
      if (plat && !varValue('PLATFORM')) { state.vars.PLATFORM = plat; syncFields('PLATFORM', plat, source); }
    }
    persistVars();
    refreshComposer();
    renderTicketChip();
  }
  function syncFields(k, v, except) { $$(`[data-var="${k}"]`).forEach((el) => { if (el !== except) el.value = v; }); }
  function clearTicket() { TICKET_KEYS.forEach((k) => { delete state.vars[k]; }); persistVars(); }

  /* ================= Actions ================= */
  function copyPrompt(id, btn) {
    const p = getPrompt(id);
    if (!p) return;
    const text = buildPrompt(p, false);
    const miss = missingVars(p);
    copyText(text).then((ok) => {
      if (!ok) { toast('Copy was blocked. Select the prompt text and copy it manually.', 'warn'); return; }
      track('copy', p.id, { meta: { length: state.settings.length, guardrail: state.settings.guardrail, agent: agentCommand(), file: state.settings.fileOut || '', missing: miss.length } });
      const u = state.usage[p.id] || { count: 0, last: 0 };
      state.usage[p.id] = { count: u.count + 1, last: Date.now() };
      flashButton(btn, 'Copied');
      if (miss.length) {
        state.showMissing[p.id] = true;
        updateMissingFields(p);
        toast(`Copied with ${plural(miss.length, 'empty field')}: ${miss.map((k) => varDef(k).label).join(', ')}.`, 'warn');
      } else {
        toast('Prompt copied. Paste it into QAgent.');
      }
    });
  }

  async function toggleFavorite(id) {
    const p = getPrompt(id);
    if (!p) return;
    const on = !state.favs.has(id);
    if (on) state.favs.add(id); else state.favs.delete(id);
    paintFav(id, on);
    try {
      await api(on ? 'PUT' : 'DELETE', '/api/favorites/' + encodeURIComponent(id));
      const s = state.stats[id] || (state.stats[id] = { avg: null, ratings: 0, copies: 0, users: 0, favorites: 0 });
      s.favorites = Math.max(0, (s.favorites || 0) + (on ? 1 : -1));
      toast(on ? 'Saved to favorites' : 'Removed from favorites');
      renderNav(activeNavName(), parseHash().params);
      if (state.current && state.current.type === 'favorites') viewFavorites();
    } catch (e) {
      if (on) state.favs.delete(id); else state.favs.add(id);
      paintFav(id, !on);
      toast(e.message, 'warn');
    }
  }
  function paintFav(id, on) {
    $$(`[data-act="fav"][data-id="${CSS.escape(id)}"]`).forEach((b) => {
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
      const span = b.querySelector('span');
      if (span) span.textContent = on ? 'Saved' : 'Save to favorites';
      const t = getPrompt(id);
      if (!span && t) { b.setAttribute('aria-label', `${on ? 'Remove from' : 'Save to'} favorites: ${t.title}`); b.title = on ? 'Saved to favorites' : 'Save to favorites'; }
    });
  }

  async function saveRating(id, stars, comment) {
    const prev = state.ratings[id];
    const next = { stars, comment: comment != null ? comment : (prev ? prev.comment : '') };
    state.ratings[id] = next;
    try {
      const out = await api('PUT', '/api/ratings/' + encodeURIComponent(id), next);
      if (out.stats) state.stats[id] = out.stats;
      repaintRating(id);
      toast(comment != null ? (LOCAL ? 'Comment saved' : 'Comment saved. Thank you.') : `Rated ${STAR_WORDS[stars].toLowerCase()}`);
    } catch (e) {
      if (prev) state.ratings[id] = prev; else delete state.ratings[id];
      repaintRating(id);
      toast(e.message, 'warn');
    }
  }
  async function clearRating(id) {
    try {
      const out = await api('DELETE', '/api/ratings/' + encodeURIComponent(id));
      delete state.ratings[id];
      if (out.stats) state.stats[id] = out.stats; else delete state.stats[id];
      repaintRating(id);
      toast('Rating removed');
    } catch (e) { toast(e.message, 'warn'); }
  }
  function repaintRating(id) {
    const p = getPrompt(id);
    const panel = $('#ratePanel');
    if (panel && p) { panel.innerHTML = ratePanelHTML(p); const on = panel.querySelector('.star[tabindex="0"]'); if (on) on.focus(); }
    const badge = $('#detailRating');
    if (badge) badge.innerHTML = ratingBadge(id);
  }

  function exportData() {
    const payload = { app: 'qagent-prompt-hub', version: D.meta.version, exported: new Date().toISOString(), favorites: Array.from(state.favs), ratings: state.ratings, custom: state.custom };
    if (download('qagent-prompt-hub-my-prompts.json', JSON.stringify(payload, null, 2), 'application/json')) toast('Exported your prompts and favorites');
  }
  function importData(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      let data;
      try { data = JSON.parse(reader.result); } catch (e) { toast('That file is not a Prompt Hub export. Choose a .json file exported from this app.', 'warn'); return; }
      const incoming = Array.isArray(data.custom) ? data.custom : (Array.isArray(data) ? data : []);
      let added = 0;
      let failed = 0;
      for (const p of incoming) {
        if (!p || !p.title || !p.template) continue;
        const body = { title: p.title, description: p.description || '', category: catById[p.category] ? p.category : 'triage', stage: stageById[p.stage] ? p.stage : 'intake', tags: p.tags || [], ticket: p.ticket || (p.needsTicket ? 'required' : 'optional'), template: p.template };
        try { const out = await api('POST', '/api/my-prompts', body); state.custom.unshift(out.prompt); added++; } catch (e) { failed++; }
      }
      for (const f of data.favorites || []) {
        if (!getPrompt(f) || state.favs.has(f)) continue;
        try { await api('PUT', '/api/favorites/' + encodeURIComponent(f)); state.favs.add(f); } catch (e) { /* skip unknown ids */ }
      }
      const ratings = data.ratings && typeof data.ratings === 'object' ? data.ratings : {};
      for (const id of Object.keys(ratings)) {
        const r = ratings[id];
        if (!getPrompt(id) || state.ratings[id] || !r || !r.stars) continue;
        try { await api('PUT', '/api/ratings/' + encodeURIComponent(id), { stars: r.stars, comment: r.comment || '' }); state.ratings[id] = { stars: r.stars, comment: r.comment || '' }; } catch (e) { /* skip */ }
      }
      await refreshStats(true);
      toast(`Imported ${plural(added, 'prompt')}${failed ? `; ${failed} could not be imported` : ''}`, failed ? 'warn' : '');
      route();
    };
    reader.readAsText(file);
  }

  function activeNavName() {
    const r = routeName();
    if (r === 'prompt') { const p = getPrompt(parseHash().parts[1]); return p && p.mine ? 'mine' : 'prompts'; }
    if (r === 'new' || r === 'edit') return 'mine';
    return r || 'home';
  }

  async function logout() {
    flush();
    sendHeartbeat();
    try { await api('POST', '/api/auth/logout'); } catch (e) { /* signed out anyway */ }
    history.replaceState(null, '', location.pathname + '#/');
    onSignedOut();
  }

  document.addEventListener('click', (e) => {
    const menu = $('#userMenu');
    if (menu && !menu.hidden && !e.target.closest('.user-menu')) toggleUserMenu(false);
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const id = el.dataset.id;

    switch (act) {
      case 'fav': e.preventDefault(); toggleFavorite(id); break;
      case 'copy-prompt': e.preventDefault(); copyPrompt(id, el); break;
      case 'copy-new': copyText('/new').then((ok) => { if (ok) { flashButton(el); toast('Copied /new. Send it before the prompt.'); } }); break;
      case 'copy-cmd': {
        const c = D.commands.find((x) => x.cmd === el.dataset.cmd) || agentDef(el.dataset.cmd) || { cmd: el.dataset.cmd };
        const url = varValue('WORK_ITEM_URL');
        const takesLink = c.cmd === '/product' || (agentDef(c.cmd) || {}).takesWorkItem;
        const text = takesLink ? (url ? c.cmd + ' ' + url : c.cmd + ' ') : c.cmd;
        copyText(text).then((ok) => { if (ok) { flashButton(el); toast(`Copied ${c.cmd}`); } });
        break;
      }
      case 'share': {
        const url = location.href.split('#')[0] + '#/prompt/' + encodeURIComponent(id);
        copyText(url).then((ok) => { if (ok) { flashButton(el, 'Link copied'); toast('Link copied'); track('share', id); } });
        break;
      }
      case 'download': {
        const p = getPrompt(id);
        if (p && download(slugify(p.title) + '.md', promptMarkdown(p), 'text/markdown;charset=utf-8')) { toast('Downloaded ' + slugify(p.title) + '.md'); track('download', id); }
        break;
      }
      case 'catalog-entry': {
        const p = getPrompt(id);
        if (p) copyText(catalogEntry(p)).then((ok) => { if (ok) { flashButton(el); toast('Copied. Paste it into the prompts list in catalog/prompts.js.'); } });
        break;
      }
      case 'rate': saveRating(id, Number(el.dataset.stars)); break;
      case 'rate-comment': { const c = $('#rateComment'); const r = state.ratings[id]; if (r && c) saveRating(id, r.stars, c.value.trim()); break; }
      case 'rate-clear': clearRating(id); break;
      case 'delete': {
        e.preventDefault();
        if (!window.confirm('Delete this prompt? This cannot be undone.')) return;
        api('DELETE', '/api/my-prompts/' + encodeURIComponent(id)).then(() => {
          state.custom = state.custom.filter((x) => x.id !== id);
          state.favs.delete(id);
          toast('Prompt deleted');
          location.hash = '#/mine';
        }).catch((err) => toast(err.message, 'warn'));
        break;
      }
      case 'clear-fields': {
        const p = getPrompt(id);
        if (!p) return;
        fieldKeys(p).forEach((k) => { delete state.vars[k]; syncFields(k, '', null); });
        persistVars();
        state.showMissing[p.id] = false;
        refreshComposer();
        toast('Details cleared');
        break;
      }
      case 'length': {
        state.settings.length = el.dataset.len;
        saveSettings();
        $$('[data-act="length"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.len === state.settings.length)));
        refreshComposer();
        break;
      }
      case 'setting-seg': {
        if (el.dataset.key === 'theme') setTheme(el.dataset.val);
        else { state.settings[el.dataset.key] = el.dataset.val; saveSettings(); }
        $$(`[data-act="setting-seg"][data-key="${el.dataset.key}"]`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.val === el.dataset.val)));
        if (el.dataset.key === 'fileOut') { $$('[data-file-help]').forEach((h) => { h.textContent = fileHelpText(); }); refreshComposer(); }
        if (el.dataset.key === 'length') refreshComposer();
        break;
      }
      case 'view-mode': {
        state.settings.view = el.dataset.mode;
        saveSettings();
        $$('[data-act="view-mode"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.settings.view)));
        renderResults();
        break;
      }
      case 'home-tab': {
        state.homeTab = el.dataset.tab;
        $$('[data-act="home-tab"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === state.homeTab)));
        $('#homePopular').innerHTML = homePopularHTML();
        break;
      }
      case 'theme': setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); break;
      case 'ticket-open': openTicketModal(); break;
      case 'ticket-done': closeModal(); route(); break;
      case 'ticket-clear': clearTicket(); closeModal(); toast('Work item cleared'); route(); break;
      case 'hero-load': {
        if (!varValue('WORK_ITEM_URL') && !varValue('WORK_ITEM_ID')) { toast('Paste the work item URL first.', 'warn'); const u = $('#hero_WORK_ITEM_URL'); if (u) u.focus(); return; }
        if (!varValue('WORK_ITEM_ID')) { toast('Add the work item ID. It could not be read from the link.', 'warn'); return; }
        $('#heroTicket').innerHTML = heroTicketHTML();
        renderTicketChip();
        break;
      }
      case 'hero-edit': { $('#heroTicket').innerHTML = heroTicketHTML(true); const u = $('#hero_WORK_ITEM_URL'); if (u) u.focus(); break; }
      case 'insert-var': {
        const ta = $('#edTemplate');
        if (!ta) return;
        const token = `{{${el.dataset.key}}}`;
        const s = ta.selectionStart || ta.value.length;
        const end = ta.selectionEnd || s;
        ta.value = ta.value.slice(0, s) + token + ta.value.slice(end);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = s + token.length;
        renderEditorVars();
        break;
      }
      case 'export': exportData(); break;
      case 'local-reset': {
        if (!LOCAL || !window.confirm('Clear your favorites, ratings, prompts, copy history, people for comments and settings from this browser? Export them first if you want to keep them.')) return;
        ['local:data', userKey('settings'), userKey('vars')].forEach((k) => store.remove(k));
        if (window.QPHComment && window.QPHComment.reset) window.QPHComment.reset();
        api('GET', '/api/me').then((me) => { loadUserState(me); toast('Local data cleared'); route(); });
        break;
      }
      case 'import': $('#importFile').click(); break;
      case 'modal-close': closeModal(); break;
      case 'nav-open': openNav(); break;
      case 'nav-close': closeNav(); break;
      case 'user-menu': toggleUserMenu(); break;
      case 'logout': logout(); break;
      case 'banner-close': state.bannerDismissed = true; renderBanner(); break;
      case 'auth-mode': {
        e.preventDefault();
        const login = $('#siLogin') ? $('#siLogin').value : ($('#reEmail') ? $('#reEmail').value : '');
        showAuth(el.dataset.mode, { login });
        break;
      }
      case 'auth-continue': showApp(); break;
      case 'reload': location.reload(); break;
      default: break;
    }
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-var]')) setVar(t.dataset.var, t.value, t);
    else if (t.matches('[data-setting-text="agentCustom"]')) {
      state.settings.agentCustom = t.value;
      saveSettings();
      const help = agentHelpText();
      const el = t.parentElement.querySelector('[data-agent-help]');
      if (el) { el.textContent = help.text; el.classList.toggle('is-error', !!help.error); }
      if (help.error) t.setAttribute('aria-invalid', 'true'); else t.removeAttribute('aria-invalid');
      refreshComposer();
    }
    else if (t.id === 'globalSearch') onSearch(t.value);
    else if (t.id === 'edTemplate') renderEditorVars();
    else if (t.matches('.auth-form input, .auth-form select')) { t.removeAttribute('aria-invalid'); const err = $('#authError'); if (err) err.hidden = true; }
  });

  document.addEventListener('focusout', (e) => {
    const t = e.target;
    if ((t.id === 'siLogin' || t.id === 'reEmail') && t.value.includes('@') && !domainOk(t.value)) authError(domainMessage(), null);
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('select[data-var]')) setVar(t.dataset.var, t.value, t);
    else if (t.matches('[data-setting]')) { state.settings[t.dataset.setting] = t.checked; saveSettings(); refreshComposer(); }
    else if (t.matches('[data-setting-select="agent"]')) {
      state.settings.agent = t.value;
      saveSettings();
      const field = t.closest('.agent-field');
      const prefix = field.dataset.prefix;
      field.outerHTML = agentFieldHTML(prefix);
      const next = $(`#${prefix}AgentCmd`) || $(`#${prefix}Agent`);
      if (next) next.focus();
      refreshComposer();
    }
    else if (t.matches('[data-filter="stage"]')) navigateWithParam('stage', t.value);
    else if (t.matches('[data-filter="type"]')) navigateWithParam('type', t.value);
    else if (t.matches('[data-filter="sort"]')) { state.settings.sort = t.value; saveSettings(); renderResults(); }
    else if (t.id === 'importFile' && t.files && t.files[0]) { importData(t.files[0]); t.value = ''; }
  });

  document.addEventListener('submit', (e) => {
    const f = e.target;
    const handlers = {
      signinForm: () => submitSignin(f),
      registerForm: () => submitRegister(f),
      authPasswordForm: () => submitPassword('ap', showApp),
      passwordForm: () => submitPassword('pw', () => { f.reset(); renderUserChrome(); viewSettings({}); }),
      profileForm: () => saveProfile(f),
      editorForm: () => saveEditor()
    };
    if (handlers[f.id]) { e.preventDefault(); handlers[f.id](); }
  });

  document.addEventListener('keydown', (e) => {
    const t = e.target;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
    if (t.classList && t.classList.contains('star') && /^Arrow(Left|Right|Up|Down)$/.test(e.key)) {
      e.preventDefault();
      const stars = $$('#starGroup .star');
      const i = stars.indexOf(t) + (e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1);
      const next = stars[Math.max(0, Math.min(4, i))];
      next.focus();
      return;
    }
    if (!state.user) return;
    if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
      if ($('#app').hidden) return;
      e.preventDefault();
      const gs = $('#globalSearch');
      gs.focus(); gs.select();
    } else if (e.key === 'Escape') {
      if (!$('#modal').hidden) closeModal();
      else if (!$('#userMenu').hidden) { toggleUserMenu(false); $('#userBtn').focus(); }
      else if (document.body.classList.contains('nav-open')) closeNav();
      else if (t.id === 'globalSearch') t.blur();
    } else if (e.key === '?' && !typing) {
      openShortcuts();
    } else if (e.key === 'Enter' && t.id === 'globalSearch' && !LIST_ROUTES.includes(routeName())) {
      location.hash = '#/prompts' + qs({ q: t.value });
    }
  });

  window.addEventListener('hashchange', route);
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onMq = () => { if (themeSetting() === 'system') applyTheme(); };
    if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
  }

  /* ================= Admin bridge ================= */
  const adminCtx = { api, esc, icon, plural, num, qs, toast, timeAgo, setView, openModal, closeModal, download, parseHash, get D() { return D; }, get catById() { return catById; }, get stageById() { return stageById; }, get state() { return state; } };
  const commentCtx = { LOCAL, api, esc, icon, toast, setView, openModal, closeModal, copyText, flashButton, track, loadScript, varValue, agentCommand, agentDef, agentFieldHTML, fileFieldHTML, fileRequestText, get D() { return D; }, get state() { return state; } };

  /* ================= Init ================= */
  async function init() {
    if (LOCAL) {
      if (!window.QPH_DATA) { $('#splash').innerHTML = '<p>The prompt catalog is missing from this file. Build it again with npm run build:local.</p>'; return; }
      setCatalog(window.QPH_DATA);
      migrateV1();
    }
    applyTheme();
    if (LOCAL) {
      state.config = await api('GET', '/api/config');
      onSignedIn(await api('GET', '/api/me'));
      return;
    }
    try {
      state.config = await api('GET', '/api/config');
    } catch (e) {
      $('#splash').innerHTML = `<div class="empty"><h2>Cannot reach the server</h2><p>${esc(e.message)} The hub needs its server running; see README.md.</p></div>`;
      return;
    }
    try {
      const me = await api('GET', '/api/me');
      onSignedIn(me);
    } catch (e) {
      if (e.code === 'password_change_required') return;
      showAuth('signin');
    }
  }
  init();
})();

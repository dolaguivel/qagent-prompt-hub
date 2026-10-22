/* QAgent Prompt Hub — admin dashboards and user management.
 * Rendered inside the app shell by app.js (route #/admin/...).
 */
(function () {
  'use strict';

  const TABS = [
    ['overview', 'Overview'],
    ['prompts', 'Prompts'],
    ['people', 'Teams & people'],
    ['feedback', 'Feedback & searches'],
    ['users', 'User accounts']
  ];
  const RANGES = [
    ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'],
    ['mtd', 'This month'], ['prev-month', 'Last month'], ['ytd', 'This year'], ['custom', 'Custom range']
  ];
  const METRICS = [
    ['copies', 'Copies'], ['users', 'Active people'], ['minutes', 'Minutes in app'], ['views', 'Views'], ['comments', 'Ticket comments']
  ];
  const DECISION_LABELS = { defect: 'Confirmed defect', duplicate: 'Duplicate', info: 'More information needed', config: 'Configuration', design: 'Working as designed', cannot: 'Could not reproduce', unknown: 'Not recorded' };
  const MODEL_LABELS = { 1: 'Model 1: Decision first', 2: 'Model 2: Summary table', 3: 'Model 3: SBAR', 4: 'Model 4: Questions and answers', 5: 'Model 5: Two layers' };
  const FILTER_KEYS = ['range', 'from', 'to', 'team', 'area', 'system', 'category', 'stage', 'user'];

  const mod = {
    data: null, key: null, loading: false, error: null,
    users: null, metric: 'copies',
    sort: {}, search: {}, promptFilter: 'all', userStatus: 'all'
  };
  let C; // context from app.js

  /* ---------------- Dates ---------------- */
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function rangeDates(p) {
    const today = new Date();
    const r = p.range || '30';
    if (r === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(p.from || '') && /^\d{4}-\d{2}-\d{2}$/.test(p.to || '')) return { from: p.from, to: p.to };
    if (r === 'mtd') return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) };
    if (r === 'prev-month') return { from: iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: iso(new Date(today.getFullYear(), today.getMonth(), 0)) };
    if (r === 'ytd') return { from: iso(new Date(today.getFullYear(), 0, 1)), to: iso(today) };
    const days = Number(r) || 30;
    const from = new Date(today);
    from.setDate(from.getDate() - (days - 1));
    return { from: iso(from), to: iso(today) };
  }
  const shortDay = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const longDay = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  /* ---------------- Formatting ---------------- */
  const fmtMinutes = (m) => {
    m = Math.round(m || 0);
    if (m < 60) return `${m} min`;
    const h = m / 60;
    return h < 10 ? `${h.toFixed(1)} h` : `${Math.round(h).toLocaleString('en-US')} h`;
  };
  const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
  function delta(cur, prev, label) {
    if (!prev && !cur) return `<span class="kpi-delta flat">No change vs ${label}</span>`;
    if (!prev) return `<span class="kpi-delta flat">Nothing in the ${label}</span>`;
    const d = (cur - prev) / prev;
    const dir = d > 0.005 ? 'up' : d < -0.005 ? 'down' : 'flat';
    const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■';
    return `<span class="kpi-delta ${dir}"><span aria-hidden="true">${arrow}</span> ${d > 0 ? '+' : ''}${Math.round(d * 100)}% vs ${label}</span>`;
  }

  /* ---------------- URLs ---------------- */
  function filterParams(p) { const o = {}; FILTER_KEYS.forEach((k) => { if (p[k]) o[k] = p[k]; }); return o; }
  function tabHref(tab, p) { return `#/admin/${tab}${C.qs(filterParams(p))}`; }
  function apiQuery(p) {
    const { from, to } = rangeDates(p);
    return C.qs({ from, to, team: p.team, area: p.area, system: p.system, category: p.category, stage: p.stage, user: p.user });
  }
  function setParam(key, value) {
    const { parts, params } = C.parseHash();
    const np = filterParams(params);
    if (value) np[key] = value; else delete np[key];
    if (key === 'range' && value !== 'custom') { delete np.from; delete np.to; }
    if (key === 'range' && value === 'custom' && !np.from) { const r = rangeDates(params); np.from = r.from; np.to = r.to; }
    location.hash = `#/admin/${parts[1] || 'overview'}${C.qs(np)}`;
  }

  /* ---------------- Shell ---------------- */
  function render(ctx, tab, params) {
    C = ctx;
    if (!TABS.some((t) => t[0] === tab)) tab = 'overview';
    const D = C.D;
    const opts = (mod.data && mod.data.options) || { teams: [], areas: [], users: [] };
    const sel = (key, label, options, allLabel) => `<label class="af"><span>${label}</span>
      <select data-admin-filter="${key}"><option value="">${allLabel}</option>${options.map(([v, l]) => `<option value="${C.esc(v)}" ${String(params[key] || '') === String(v) ? 'selected' : ''}>${C.esc(l)}</option>`).join('')}</select></label>`;
    const { from, to } = rangeDates(params);
    const active = FILTER_KEYS.filter((k) => !['range', 'from', 'to'].includes(k) && params[k]);

    C.setView(`
      <div class="page-head admin-head">
        <div>
          <h1>Usage dashboard</h1>
          <p>How people across Qualifacts use the prompts: what they copy, how they rate it and how much time they spend in the hub. Admin activity is not counted.</p>
        </div>
        <div class="detail-actions">
          <a class="btn btn-sm" href="/api/admin/export.csv${apiQuery(params)}" download>${C.icon('download')}<span>Raw events (CSV)</span></a>
        </div>
      </div>
      <nav class="admin-tabs" aria-label="Dashboard sections">${TABS.map(([k, l]) => `<a href="${tabHref(k, params)}" ${k === tab ? 'aria-current="page" class="active"' : ''}>${l}</a>`).join('')}</nav>
      ${tab !== 'users' ? `<div class="admin-filters" role="group" aria-label="Filters">
        <label class="af"><span>Dates</span><select data-admin-filter="range">${RANGES.map(([v, l]) => `<option value="${v}" ${(params.range || '30') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${(params.range === 'custom') ? `<label class="af"><span>From</span><input type="date" data-admin-filter="from" value="${from}" max="${to}"></label><label class="af"><span>To</span><input type="date" data-admin-filter="to" value="${to}" min="${from}"></label>` : ''}
        ${sel('team', 'Team', opts.teams.map((t) => [t, t]), 'All teams')}
        ${sel('area', 'Area', opts.areas.map((t) => [t, t]), 'All areas')}
        ${sel('system', 'System', D.platforms.map((p) => [p.name, p.name]), 'All systems')}
        ${sel('category', 'Category', D.categories.map((c) => [c.id, c.name]), 'All categories')}
        ${sel('stage', 'PDLC stage', D.stages.map((s, i) => [s.id, `${i + 1}. ${s.name}`]), 'All stages')}
        ${sel('user', 'Person', opts.users.map((u) => [u.id, u.name + (u.team ? ` (${u.team})` : '')]), 'Everyone')}
        ${active.length ? `<button class="btn btn-sm btn-ghost" data-act="admin-reset">${C.icon('x', 'i-sm')}<span>Clear filters</span></button>` : ''}
      </div>
      <p class="admin-range" id="adminRange">${longDay(from)} to ${longDay(to)}${active.length ? ` · ${C.plural(active.length, 'filter')} applied` : ''}</p>` : ''}
      <div id="adminBody" class="admin-body"></div>
    `, 'Admin dashboard');

    if (tab === 'users') return loadUsers();
    const key = apiQuery(params);
    if (mod.data && mod.key === key) return paint(tab, params);
    if (mod.data) { paint(tab, params); document.getElementById('adminBody').classList.add('is-loading'); }
    else document.getElementById('adminBody').innerHTML = '<p class="muted admin-loading">Loading the numbers…</p>';
    mod.key = key;
    C.api('GET', '/api/admin/metrics' + key).then((data) => {
      if (mod.key !== key) return;
      const hadOptions = !!(mod.data && mod.data.options);
      mod.data = data;
      const current = C.parseHash();
      if (current.parts[0] !== 'admin') return;
      if (!hadOptions) return render(C, current.parts[1] || 'overview', current.params);
      paint(current.parts[1] || 'overview', current.params);
    }).catch((e) => {
      const body = document.getElementById('adminBody');
      if (body) { body.classList.remove('is-loading'); body.innerHTML = `<div class="empty"><h2>Could not load the dashboard</h2><p>${C.esc(e.message)}</p></div>`; }
    });
  }

  function paint(tab, params) {
    const body = document.getElementById('adminBody');
    if (!body || !mod.data) return;
    body.classList.remove('is-loading');
    const views = { overview: paintOverview, prompts: paintPrompts, people: paintPeople, feedback: paintFeedback };
    (views[tab] || paintOverview)(body, mod.data, params);
  }

  /* ---------------- Tables ---------------- */
  function table(id, cols, rows, opts) {
    opts = opts || {};
    const s = mod.sort[id] || opts.defaultSort || { key: cols.find((c) => c.num) ? cols.find((c) => c.num).key : cols[0].key, dir: 'desc' };
    const col = cols.find((c) => c.key === s.key) || cols[0];
    const sorted = rows.slice().sort((a, b) => {
      const va = col.sortValue ? col.sortValue(a) : a[col.key];
      const vb = col.sortValue ? col.sortValue(b) : b[col.key];
      let r;
      if (va == null && vb == null) r = 0; else if (va == null) r = -1; else if (vb == null) r = 1;
      else r = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return s.dir === 'asc' ? r : -r;
    });
    const limit = opts.limit || 500;
    return `<div class="table-wrap"><table class="data-table" id="${id}">
      <thead><tr>${cols.map((c) => `<th scope="col" class="${c.num ? 'num' : ''}" aria-sort="${c.key === s.key ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none'}">
        <button class="th-sort" data-act="admin-sort" data-table="${id}" data-key="${c.key}">${C.esc(c.label)}<span aria-hidden="true">${c.key === s.key ? (s.dir === 'asc' ? ' ↑' : ' ↓') : ''}</span></button></th>`).join('')}</tr></thead>
      <tbody>${sorted.slice(0, limit).map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.render ? c.render(r) : C.esc(c.fmt ? c.fmt(r[c.key], r) : r[c.key] == null ? '–' : r[c.key])}</td>`).join('')}</tr>`).join('')
        || `<tr><td colspan="${cols.length}" class="muted">${C.esc(opts.empty || 'No rows for these filters.')}</td></tr>`}</tbody>
    </table></div>${sorted.length > limit ? `<p class="muted table-more">Showing the first ${limit} of ${C.plural(sorted.length, 'row')}. Export the CSV for all of them.</p>` : ''}`;
  }
  const tableData = {};
  function csvFor(id) {
    const t = tableData[id];
    if (!t) return;
    const cell = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [t.cols.map((c) => cell(c.label)).join(',')].concat(t.rows.map((r) => t.cols.map((c) => cell(c.csv ? c.csv(r) : r[c.key])).join(',')));
    C.download(`${t.file}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }
  function card(title, sub, inner, opts) {
    opts = opts || {};
    return `<section class="dash-card ${opts.cls || ''}" ${opts.id ? `id="${opts.id}"` : ''}>
      <div class="dash-card-head"><div><h2>${C.esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${opts.actions || ''}</div>
      ${inner}
    </section>`;
  }
  const csvButton = (id) => `<button class="btn btn-sm btn-ghost" data-act="admin-csv" data-table="${id}">${C.icon('download', 'i-sm')}<span>CSV</span></button>`;
  const promptLink = (r) => `<a href="#/prompt/${encodeURIComponent(r.id)}">${C.esc(r.title)}</a>${r.custom ? `<small class="muted"> · custom${r.author ? ' by ' + C.esc(r.author) : ''}</small>` : ''}`;
  const filterLink = (key, value, label) => value ? `<button type="button" class="link" data-act="admin-filter" data-key="${C.esc(key)}" data-val="${C.esc(value)}" title="Filter by ${C.esc(label || value)}">${C.esc(label || value)}</button>` : '–';

  /* ---------------- Overview ---------------- */
  function paintOverview(body, d, params) {
    const k = d.kpis;
    const n = d.trend.length;
    const prevLabel = `previous ${n} days`;
    const anyFilterOnPrompts = params.category || params.stage;
    const tiles = [
      { label: 'Active people', value: C.num(k.activeUsers), delta: delta(k.activeUsers, k.activeUsersPrev, prevLabel), note: `${C.num(k.registered)} accounts match these filters${k.newUsers ? `, ${C.num(k.newUsers)} new in the period` : ''}` },
      { label: 'Prompts copied', value: C.num(k.copies), delta: delta(k.copies, k.copiesPrev, prevLabel), note: `${C.num(k.views)} prompt views` },
      { label: 'Time in the hub', value: fmtMinutes(k.minutes), delta: delta(k.minutes, k.minutesPrev, prevLabel), note: anyFilterOnPrompts ? 'Not affected by category or stage filters' : `${C.num(k.visits)} visits` },
      { label: 'Time per active person', value: fmtMinutes(k.avgMinutesPerUser), note: 'Average for the period' },
      { label: 'Views that led to a copy', value: pct(k.copyRate), note: 'Copies divided by prompt views' },
      { label: 'Average rating', value: k.avgRating == null ? '–' : `${k.avgRating.toFixed(1)} / 5`, note: k.ratingsCount ? `${C.plural(k.ratingsCount, 'rating')} given in the period` : 'No ratings in the period' },
      { label: 'Ticket comments', value: C.num(k.comments), delta: delta(k.comments, k.commentsPrev, prevLabel), note: anyFilterOnPrompts ? 'Not affected by category or stage filters' : 'Written with the comment generator' },
      { label: 'Prompts in use', value: C.num(d.prompts.filter((p) => !p.custom && p.copies).length), note: `of ${C.num(C.D.prompts.length)} in the catalog were copied` }
    ];
    const D = C.D;
    const topPrompts = d.prompts.filter((p) => p.copies).slice(0, 10);
    const stageRows = D.stages.map((s, i) => { const r = d.byStage.find((x) => x.key === s.id) || {}; return { label: `${i + 1}. ${s.name}`, value: r.copies || 0, filter: { key: 'stage', value: s.id } }; });
    const catRows = d.byCategory.filter((r) => r.copies).map((r) => ({ label: (C.catById[r.key] || { name: r.key }).name, value: r.copies, filter: { key: 'category', value: r.key } }));
    const sysRows = D.platforms.map((p) => { const r = d.bySystem.find((x) => x.key === p.name) || {}; return { label: p.name, value: r.copies || 0, sub: r.registered ? `${C.plural(r.registered, 'account')} with this main system` : '', filter: { key: 'system', value: p.name } }; }).filter((r) => r.value || r.sub);
    const metricLabel = METRICS.find((m) => m[0] === mod.metric)[1];
    const cm = d.comments || { total: 0, byDecision: [], byModel: [], byTeam: [] };

    body.innerHTML = `
      <div class="kpis">${tiles.map((t) => `<div class="kpi"><p class="kpi-label">${C.esc(t.label)}</p><p class="kpi-value">${C.esc(t.value)}</p>${t.delta || ''}<p class="kpi-note">${C.esc(t.note || '')}</p></div>`).join('')}</div>

      ${card('Daily activity', `${C.esc(metricLabel)} per day`, `<div class="viz" id="trendChart"></div>
        <details class="table-toggle"><summary>Show as table</summary>${table('trendTable', [
          { key: 'day', label: 'Day', fmt: (v) => longDay(v) },
          { key: 'copies', label: 'Copies', num: true },
          { key: 'users', label: 'Active people', num: true },
          { key: 'minutes', label: 'Minutes in app', num: true },
          { key: 'views', label: 'Views', num: true },
          { key: 'comments', label: 'Ticket comments', num: true }
        ], d.trend, { defaultSort: { key: 'day', dir: 'desc' } })}</details>`, {
        actions: `<div class="segmented" role="group" aria-label="Metric">${METRICS.map(([v, l]) => `<button data-act="admin-metric" data-metric="${v}" aria-pressed="${mod.metric === v}">${l}</button>`).join('')}</div>`
      })}

      <div class="dash-grid">
        ${card('Most copied prompts', 'Top 10 in the period', '<div id="topPrompts"></div>', { actions: `<a class="btn btn-sm btn-ghost" href="${tabHref('prompts', params)}">All prompts</a>` })}
        ${card('Copies by system', 'The platform selected when the prompt was copied. Select one to filter.', '<div id="bySystem"></div>')}
        ${card('Copies by PDLC stage', 'Where in the lifecycle people need help', '<div id="byStage"></div>')}
        ${card('Copies by category', 'Select one to filter', '<div id="byCategory"></div>')}
      </div>

      <div class="dash-grid">
        ${card('Ticket comments by decision', cm.total ? `${C.plural(cm.total, 'comment')} copied for Azure DevOps in the period` : 'No ticket comments in the period', '<div id="byDecision"></div>', { actions: `<a class="btn btn-sm btn-ghost" href="${tabHref('people', params)}">By team and person</a>` })}
        ${card('Comment structure used', 'Which of the five structures people choose', '<div id="byModel"></div>')}
      </div>

      ${card('When people use the hub', 'Prompt copies by weekday and hour, in the reporting time zone', '<div id="heat"></div>')}
    `;
    tableData.trendTable = { file: 'daily-activity', cols: [{ key: 'day', label: 'Day' }, { key: 'copies', label: 'Copies' }, { key: 'users', label: 'Active people' }, { key: 'minutes', label: 'Minutes in app' }, { key: 'views', label: 'Views' }, { key: 'comments', label: 'Ticket comments' }], rows: d.trend };

    const fmt = mod.metric === 'minutes' ? fmtMinutes : (v) => C.num(v);
    window.QPHCharts.line(document.getElementById('trendChart'), d.trend.map((t) => ({ x: longDay(t.day), short: shortDay(t.day), y: t[mod.metric] || 0 })), { label: metricLabel, format: fmt, aria: `${metricLabel} per day, ${longDay(d.filters.from)} to ${longDay(d.filters.to)}` });
    window.QPHCharts.bars(document.getElementById('topPrompts'), topPrompts.map((p) => ({ label: p.title, value: p.copies, href: `#/prompt/${encodeURIComponent(p.id)}`, tip: `${p.title} · ${C.plural(p.users, 'person', 'people')}` })), { empty: 'No prompts were copied with these filters.' });
    window.QPHCharts.bars(document.getElementById('bySystem'), sysRows);
    window.QPHCharts.bars(document.getElementById('byStage'), stageRows);
    window.QPHCharts.bars(document.getElementById('byCategory'), catRows);
    window.QPHCharts.bars(document.getElementById('byDecision'), cm.byDecision.map((r) => ({ label: DECISION_LABELS[r.key] || r.key, value: r.n })), { empty: 'No ticket comments with these filters.' });
    window.QPHCharts.bars(document.getElementById('byModel'), cm.byModel.map((r) => ({ label: MODEL_LABELS[r.key] || 'Model ' + r.key, value: r.n })), { empty: 'No ticket comments with these filters.' });
    window.QPHCharts.heatmap(document.getElementById('heat'), d.heat);
  }

  /* ---------------- Prompts ---------------- */
  function paintPrompts(body, d) {
    const q = (mod.search.prompts || '').toLowerCase();
    const unused = d.prompts.filter((p) => !p.custom && !p.copies);
    const low = d.prompts.filter((p) => p.rating != null && p.rating < 3.5 && p.ratings >= 2);
    let rows = d.prompts;
    if (mod.promptFilter === 'unused') rows = unused;
    if (mod.promptFilter === 'low') rows = low;
    if (mod.promptFilter === 'custom') rows = rows.filter((p) => p.custom);
    if (q) rows = rows.filter((p) => p.title.toLowerCase().includes(q));
    rows = rows.map((p) => Object.assign({}, p, { rate: p.views ? p.copies / p.views : null, catName: (C.catById[p.category] || { name: p.category || '–' }).name, stageName: C.stageById[p.stage] ? `${C.stageById[p.stage].n}. ${C.stageById[p.stage].name}` : '–' }));
    const cols = [
      { key: 'title', label: 'Prompt', render: promptLink },
      { key: 'catName', label: 'Category' },
      { key: 'stageName', label: 'Stage' },
      { key: 'views', label: 'Views', num: true, fmt: C.num },
      { key: 'copies', label: 'Copies', num: true, fmt: C.num },
      { key: 'rate', label: 'Copy rate', num: true, fmt: pct, csv: (r) => (r.rate == null ? '' : Math.round(r.rate * 100) + '%') },
      { key: 'users', label: 'People', num: true, fmt: C.num },
      { key: 'rating', label: 'Rating', num: true, render: (r) => (r.rating == null ? '<span class="muted">–</span>' : `${r.rating.toFixed(1)} <small class="muted">(${r.ratings})</small>`) },
      { key: 'favorites', label: 'Saved', num: true, fmt: C.num },
      { key: 'last', label: 'Last copied', num: true, fmt: (v) => (v ? C.timeAgo(v) : 'Not in period'), csv: (r) => (r.last ? new Date(r.last).toISOString() : '') }
    ];
    tableData.promptTable = { file: `prompts_${d.filters.from}_${d.filters.to}`, cols, rows };
    const so = d.sendOptions || { total: 0, byAgent: [], byFile: [] };
    const agentName = (cmd) => { if (!cmd) return 'Current agent (no command)'; const a = (C.D.agents || []).find((x) => x.cmd.toLowerCase() === cmd); return a ? `${a.name} (${a.cmd})` : cmd; };
    const fileName = { '': 'No file', docx: 'Word (.docx)', xlsx: 'Excel (.xlsx)' };
    body.innerHTML = `
      <div class="callouts">
        <button class="callout-card" data-act="admin-prompt-filter" data-val="unused"><b>${C.num(unused.length)}</b><span>catalog prompts were not copied in this period</span></button>
        <button class="callout-card" data-act="admin-prompt-filter" data-val="low"><b>${C.num(low.length)}</b><span>prompts rated below 3.5 by two or more people</span></button>
        <div class="callout-card static"><b>${C.num(d.prompts.filter((p) => p.copies).length)}</b><span>prompts copied at least once</span></div>
      </div>
      ${card('Prompt performance', 'Views and copies in the period; ratings and saves are all-time totals.', `
        <div class="toolbar">
          <label class="search small"><span class="visually-hidden">Search prompts</span>${C.icon('search')}<input type="search" data-admin-search="prompts" value="${C.esc(mod.search.prompts || '')}" placeholder="Search prompts"></label>
          <div class="segmented" role="group" aria-label="Show">${[['all', 'All'], ['unused', 'Not copied'], ['low', 'Low rated'], ['custom', 'Custom']].map(([v, l]) => `<button data-act="admin-prompt-filter" data-val="${v}" aria-pressed="${mod.promptFilter === v}">${l}</button>`).join('')}</div>
        </div>
        ${table('promptTable', cols, rows, { defaultSort: { key: 'copies', dir: 'desc' } })}`, { actions: csvButton('promptTable') })}
      <div class="dash-grid">
        ${card('Copies by QAgent agent', so.total ? `The agent chosen under Options when the prompt was copied (${C.plural(so.total, 'copy', 'copies')})` : 'No copies in the period', '<div id="byAgent"></div>')}
        ${card('Answers requested as a file', 'Copies that asked QAgent to attach its answer as Word or Excel', '<div id="byFile"></div>')}
      </div>
    `;
    window.QPHCharts.bars(document.getElementById('byAgent'), so.byAgent.map((r) => ({ label: agentName(r.key), value: r.n })), { empty: 'No copies with these filters.' });
    window.QPHCharts.bars(document.getElementById('byFile'), so.byFile.map((r) => ({ label: fileName[r.key] || r.key, value: r.n })), { empty: 'No copies with these filters.' });
  }

  /* ---------------- Teams & people ---------------- */
  function paintPeople(body, d) {
    const groupCols = (name, key) => [
      { key: 'key', label: name, render: (r) => filterLink(key, r.key) },
      { key: 'registered', label: 'Accounts', num: true, fmt: C.num },
      { key: 'active', label: 'Active', num: true, fmt: C.num },
      { key: 'copies', label: 'Copies', num: true, fmt: C.num },
      { key: 'views', label: 'Views', num: true, fmt: C.num },
      { key: 'comments', label: 'Comments', num: true, fmt: C.num },
      { key: 'minutes', label: 'Time in app', num: true, fmt: fmtMinutes, csv: (r) => r.minutes },
      { key: 'avgMinutes', label: 'Per active person', num: true, fmt: fmtMinutes, csv: (r) => r.avgMinutes }
    ];
    const q = (mod.search.people || '').toLowerCase();
    const people = d.people.filter((p) => !q || `${p.name} ${p.email} ${p.team}`.toLowerCase().includes(q));
    const peopleCols = [
      { key: 'name', label: 'Person', render: (r) => `${filterLink('user', String(r.id), r.name)}<small class="muted cell-sub">${C.esc(r.email)}${r.active ? '' : ' · deactivated'}</small>`, csv: (r) => r.name },
      { key: 'email', label: 'Email', hidden: true },
      { key: 'team', label: 'Team' },
      { key: 'area', label: 'Area' },
      { key: 'system', label: 'System' },
      { key: 'copies', label: 'Copies', num: true, fmt: C.num },
      { key: 'views', label: 'Views', num: true, fmt: C.num },
      { key: 'prompts', label: 'Prompts used', num: true, fmt: C.num },
      { key: 'comments', label: 'Comments', num: true, fmt: C.num },
      { key: 'minutes', label: 'Time in app', num: true, fmt: fmtMinutes, csv: (r) => r.minutes },
      { key: 'visits', label: 'Visits', num: true, fmt: C.num },
      { key: 'favorites', label: 'Saved', num: true, fmt: C.num },
      { key: 'ratings', label: 'Ratings', num: true, fmt: C.num },
      { key: 'lastSeen', label: 'Last seen', num: true, fmt: (v) => C.timeAgo(v), csv: (r) => (r.lastSeen ? new Date(r.lastSeen).toISOString() : '') }
    ];
    const visible = peopleCols.filter((c) => !c.hidden);
    tableData.teamTable = { file: 'teams', cols: groupCols('Team', 'team'), rows: d.byTeam };
    tableData.areaTable = { file: 'areas', cols: groupCols('Area', 'area'), rows: d.byArea };
    tableData.systemTable = { file: 'systems', cols: groupCols('System', 'system'), rows: d.bySystem };
    tableData.peopleTable = { file: `people_${d.filters.from}_${d.filters.to}`, cols: peopleCols, rows: people };
    const inactive = d.people.filter((p) => !p.copies && !p.minutes).length;

    body.innerHTML = `
      <div class="dash-grid">
        ${card('Copies by team', 'Select a team to filter every chart', '<div id="teamBars"></div>')}
        ${card('Time in the hub by team', 'Minutes while the hub was open and in use', '<div id="teamTime"></div>')}
      </div>
      ${card('Teams', '', table('teamTable', groupCols('Team', 'team'), d.byTeam, { defaultSort: { key: 'copies', dir: 'desc' } }), { actions: csvButton('teamTable') })}
      ${card('Areas', '', table('areaTable', groupCols('Area', 'area'), d.byArea, { defaultSort: { key: 'copies', dir: 'desc' } }), { actions: csvButton('areaTable') })}
      ${card('Systems', 'Copies use the platform chosen in the prompt; accounts and time use each person’s main system.', table('systemTable', groupCols('System', 'system'), d.bySystem, { defaultSort: { key: 'copies', dir: 'desc' } }), { actions: csvButton('systemTable') })}
      ${card('People', `${C.plural(d.people.length, 'account')} match these filters${inactive ? `; ${C.num(inactive)} had no activity in the period` : ''}.`, `
        <div class="toolbar"><label class="search small"><span class="visually-hidden">Search people</span>${C.icon('search')}<input type="search" data-admin-search="people" value="${C.esc(mod.search.people || '')}" placeholder="Search by name, email or team"></label></div>
        ${table('peopleTable', visible, people, { defaultSort: { key: 'copies', dir: 'desc' } })}`, { actions: csvButton('peopleTable') })}
    `;
    const top = d.byTeam.slice(0, 12);
    window.QPHCharts.bars(document.getElementById('teamBars'), top.filter((r) => r.copies).map((r) => ({ label: r.key, value: r.copies, sub: `${C.plural(r.active, 'active person', 'active people')}`, filter: { key: 'team', value: r.key } })));
    window.QPHCharts.bars(document.getElementById('teamTime'), d.byTeam.filter((r) => r.minutes).sort((a, b) => b.minutes - a.minutes).slice(0, 12).map((r) => ({ label: r.key, value: r.minutes, filter: { key: 'team', value: r.key } })), { format: fmtMinutes });
  }

  /* ---------------- Feedback & searches ---------------- */
  function paintFeedback(body, d) {
    const total = d.ratingDist.reduce((s, r) => s + r.n, 0);
    const stars = (n) => `<span class="stars-static" aria-label="${n} of 5 stars">${[1, 2, 3, 4, 5].map((i) => `<svg class="i i-sm ${i <= n ? 'on' : ''}" aria-hidden="true"><use href="#i-star"/></svg>`).join('')}</span>`;
    const searchCols = [
      { key: 'q', label: 'Search' },
      { key: 'count', label: 'Times', num: true, fmt: C.num },
      { key: 'zero', label: 'With no results', num: true, fmt: C.num }
    ];
    tableData.searchTable = { file: 'searches', cols: searchCols, rows: d.searches };
    tableData.gapTable = { file: 'searches-without-results', cols: searchCols, rows: d.zeroResults };
    body.innerHTML = `
      <div class="dash-grid">
        ${card('Ratings given in the period', total ? `${C.plural(total, 'rating')}, average ${(d.kpis.avgRating || 0).toFixed(1)} out of 5` : 'No ratings in the period', '<div id="ratingBars"></div>')}
        ${card('Searches with no results', 'What people looked for and did not find: candidates for new prompts', table('gapTable', searchCols, d.zeroResults, { defaultSort: { key: 'zero', dir: 'desc' }, empty: 'Every search found something.' }), { actions: csvButton('gapTable') })}
      </div>
      ${card('Comments', 'Left with a rating; newest first', d.feedback.length ? `<ul class="feedback">${d.feedback.map((f) => `<li>
          <div class="fb-head">${stars(f.stars)}<a href="#/prompt/${encodeURIComponent(f.promptId)}">${C.esc(f.title)}</a></div>
          <p>${C.esc(f.comment)}</p>
          <p class="muted fb-meta">${C.esc(f.user)}${f.team ? ' · ' + C.esc(f.team) : ''} · ${C.esc(C.timeAgo(f.at))}</p>
        </li>`).join('')}</ul>` : '<p class="viz-empty">No comments in this period.</p>')}
      ${card('Top searches', 'Most frequent searches in the period', table('searchTable', searchCols, d.searches, { defaultSort: { key: 'count', dir: 'desc' }, empty: 'No searches in this period.' }), { actions: csvButton('searchTable') })}
    `;
    window.QPHCharts.bars(document.getElementById('ratingBars'), d.ratingDist.slice().reverse().map((r) => ({ label: `${r.stars} ${r.stars === 1 ? 'star' : 'stars'}`, value: r.n })), { empty: 'No ratings in this period.' });
  }

  /* ---------------- User accounts ---------------- */
  function loadUsers() {
    const body = document.getElementById('adminBody');
    if (mod.users) paintUsers(body); else body.innerHTML = '<p class="muted admin-loading">Loading accounts…</p>';
    C.api('GET', '/api/admin/users').then((out) => { mod.users = out.users; const b = document.getElementById('adminBody'); if (b && C.parseHash().parts[1] === 'users') paintUsers(b); })
      .catch((e) => { body.innerHTML = `<div class="empty"><h2>Could not load accounts</h2><p>${C.esc(e.message)}</p></div>`; });
  }
  function paintUsers(body) {
    const all = mod.users || [];
    const q = (mod.search.users || '').toLowerCase();
    let rows = all.filter((u) => !q || `${u.name} ${u.email} ${u.team}`.toLowerCase().includes(q));
    if (mod.userStatus === 'active') rows = rows.filter((u) => u.active);
    if (mod.userStatus === 'inactive') rows = rows.filter((u) => !u.active);
    if (mod.userStatus === 'initial') rows = rows.filter((u) => u.mustChange);
    const cols = [
      { key: 'name', label: 'Person', render: (r) => `<b>${C.esc(r.name)}</b><small class="muted cell-sub">${C.esc(r.email)}</small>` },
      { key: 'team', label: 'Team', render: (r) => `${C.esc(r.team || '–')}<small class="muted cell-sub">${C.esc(r.area || '')}</small>` },
      { key: 'area', label: 'Area', hidden: true },
      { key: 'system', label: 'System' },
      { key: 'active', label: 'Status', sortValue: (r) => (r.active ? 2 : 0) + (r.mustChange ? 0 : 1), render: (r) => `${r.active ? '<span class="status ok">Active</span>' : '<span class="status off">Deactivated</span>'}${r.mustChange ? ' <span class="status warn">Initial password</span>' : ''}`, csv: (r) => (r.active ? 'Active' : 'Deactivated') },
      { key: 'mustChange', label: 'Password', hidden: true, csv: (r) => (r.mustChange ? 'Initial' : 'Changed') },
      { key: 'created_at', label: 'Created', num: true, hidden: true, fmt: (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), csv: (r) => new Date(r.created_at).toISOString() },
      { key: 'last_seen_at', label: 'Last seen', num: true, fmt: (v) => C.timeAgo(v), csv: (r) => (r.last_seen_at ? new Date(r.last_seen_at).toISOString() : '') },
      { key: 'copies', label: 'Copies', num: true, fmt: C.num },
      { key: 'minutes', label: 'Time in app', num: true, fmt: fmtMinutes, csv: (r) => r.minutes },
      { key: 'actions', label: 'Actions', render: (r) => `<div class="row-actions">
          <button class="icon-btn sm" data-act="admin-edit-user" data-id="${r.id}" title="Edit profile" aria-label="Edit ${C.esc(r.name)}">${C.icon('pen', 'i-sm')}</button>
          <button class="icon-btn sm" data-act="admin-reset-pass" data-id="${r.id}" title="Reset password" aria-label="Reset the password of ${C.esc(r.name)}">${C.icon('key', 'i-sm')}</button>
          <button class="btn btn-sm btn-ghost ${r.active ? 'btn-danger' : ''}" data-act="admin-toggle-user" data-id="${r.id}">${r.active ? 'Deactivate' : 'Reactivate'}</button></div>`, csv: () => '' }
    ];
    tableData.userTable = { file: 'user-accounts', cols: cols.filter((c) => c.key !== 'actions'), rows };
    const count = (f) => all.filter(f).length;
    body.innerHTML = `
      <div class="callouts">
        <div class="callout-card static"><b>${C.num(all.length)}</b><span>accounts</span></div>
        <div class="callout-card static"><b>${C.num(count((u) => u.active))}</b><span>active</span></div>
        <button class="callout-card" data-act="admin-user-status" data-val="initial"><b>${C.num(count((u) => u.mustChange))}</b><span>still on the initial password</span></button>
        <button class="callout-card" data-act="admin-user-status" data-val="inactive"><b>${C.num(count((u) => !u.active))}</b><span>deactivated</span></button>
      </div>
      ${card('User accounts', 'People register themselves with their corporate email. Resetting a password sets it back to the initial password and signs the person out.', `
        <div class="toolbar">
          <label class="search small"><span class="visually-hidden">Search accounts</span>${C.icon('search')}<input type="search" data-admin-search="users" value="${C.esc(mod.search.users || '')}" placeholder="Search by name, email or team"></label>
          <div class="segmented" role="group" aria-label="Show">${[['all', 'All'], ['active', 'Active'], ['initial', 'Initial password'], ['inactive', 'Deactivated']].map(([v, l]) => `<button data-act="admin-user-status" data-val="${v}" aria-pressed="${mod.userStatus === v}">${l}</button>`).join('')}</div>
        </div>
        ${table('userTable', cols.filter((c) => !c.hidden), rows, { defaultSort: { key: 'name', dir: 'asc' }, empty: 'No accounts match.' })}`, { actions: csvButton('userTable') })}
    `;
  }

  function editUser(id) {
    const u = (mod.users || []).find((x) => x.id === id);
    if (!u) return;
    const cfg = C.state.config || { areas: [], systems: [], teams: [] };
    C.openModal(`<h2 id="modalTitle">Edit ${C.esc(u.name)}</h2>
      <form id="adminUserForm" data-id="${u.id}" class="settings-form" novalidate>
        <div class="field"><label for="auName">Full name</label><input id="auName" name="name" value="${C.esc(u.name)}" maxlength="80"></div>
        <div class="field"><label for="auTeam">Team</label><input id="auTeam" name="team" value="${C.esc(u.team || '')}" list="auTeams" maxlength="60"><datalist id="auTeams">${(cfg.teams || []).map((t) => `<option value="${C.esc(t)}">`).join('')}</datalist></div>
        <div class="two">
          <div class="field"><label for="auArea">Area</label><select id="auArea" name="area">${cfg.areas.map((a) => `<option ${a === u.area ? 'selected' : ''}>${C.esc(a)}</option>`).join('')}</select></div>
          <div class="field"><label for="auSystem">Main system</label><select id="auSystem" name="system">${cfg.systems.map((a) => `<option ${a === u.system ? 'selected' : ''}>${C.esc(a)}</option>`).join('')}</select></div>
        </div>
        <p class="form-error" id="auError" role="alert" hidden></p>
        <div class="form-actions"><button class="btn btn-primary" type="submit">${C.icon('check')}<span>Save</span></button><button type="button" class="btn btn-ghost" data-act="modal-close">Cancel</button></div>
      </form>`);
  }

  /* ---------------- Events ---------------- */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act^="admin-"]');
    if (!el || !C) return;
    const act = el.dataset.act;
    const { parts, params } = C.parseHash();
    const tab = parts[1] || 'overview';
    switch (act) {
      case 'admin-filter': setParam(el.dataset.key, el.dataset.val); break;
      case 'admin-reset': location.hash = `#/admin/${tab}${C.qs({ range: params.range, from: params.from, to: params.to })}`; break;
      case 'admin-metric': mod.metric = el.dataset.metric; paint(tab, params); break;
      case 'admin-sort': {
        const id = el.dataset.table;
        const cur = mod.sort[id];
        mod.sort[id] = { key: el.dataset.key, dir: cur && cur.key === el.dataset.key && cur.dir === 'desc' ? 'asc' : 'desc' };
        if (tab === 'users') paintUsers(document.getElementById('adminBody')); else paint(tab, params);
        const btn = document.querySelector(`[data-act="admin-sort"][data-table="${id}"][data-key="${el.dataset.key}"]`);
        if (btn) btn.focus();
        break;
      }
      case 'admin-csv': csvFor(el.dataset.table); break;
      case 'admin-prompt-filter': mod.promptFilter = el.dataset.val; paint('prompts', params); break;
      case 'admin-user-status': mod.userStatus = el.dataset.val; paintUsers(document.getElementById('adminBody')); break;
      case 'admin-edit-user': editUser(Number(el.dataset.id)); break;
      case 'admin-reset-pass': {
        const u = (mod.users || []).find((x) => x.id === Number(el.dataset.id));
        if (!u || !window.confirm(`Reset the password of ${u.name} to the initial password? They will be signed out.`)) return;
        C.api('POST', `/api/admin/users/${u.id}/reset-password`).then((out) => {
          u.mustChange = true;
          C.toast(`Password reset. ${u.name} can sign in with ${out.initialPassword}.`);
          paintUsers(document.getElementById('adminBody'));
        }).catch((err) => C.toast(err.message, 'warn'));
        break;
      }
      case 'admin-toggle-user': {
        const u = (mod.users || []).find((x) => x.id === Number(el.dataset.id));
        if (!u) return;
        if (u.active && !window.confirm(`Deactivate ${u.name}? They will be signed out and cannot sign in until reactivated. Their history stays in the reports.`)) return;
        C.api('PATCH', `/api/admin/users/${u.id}`, { active: !u.active }).then(() => {
          u.active = !u.active;
          C.toast(u.active ? `${u.name} reactivated` : `${u.name} deactivated`);
          paintUsers(document.getElementById('adminBody'));
        }).catch((err) => C.toast(err.message, 'warn'));
        break;
      }
      default: break;
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.matches('[data-admin-filter]') || !C) return;
    const key = t.dataset.adminFilter;
    if (key === 'from' || key === 'to') {
      const { parts, params } = C.parseHash();
      const np = filterParams(params);
      np.range = 'custom';
      np[key] = t.value;
      location.hash = `#/admin/${parts[1] || 'overview'}${C.qs(np)}`;
      return;
    }
    setParam(key, t.value);
  });

  let searchTimer;
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.matches('[data-admin-search]') || !C) return;
    mod.search[t.dataset.adminSearch] = t.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const { parts, params } = C.parseHash();
      const pos = t.selectionStart;
      if (t.dataset.adminSearch === 'users') paintUsers(document.getElementById('adminBody')); else paint(parts[1] || 'overview', params);
      const again = document.querySelector(`[data-admin-search="${t.dataset.adminSearch}"]`);
      if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (err) { /* ignore */ } }
    }, 200);
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'adminUserForm' || !C) return;
    e.preventDefault();
    const f = e.target;
    const id = Number(f.dataset.id);
    const body = { name: f.name.value.trim(), team: f.team.value.trim(), area: f.area.value, system: f.system.value };
    C.api('PATCH', `/api/admin/users/${id}`, body).then(() => {
      const u = mod.users.find((x) => x.id === id);
      Object.assign(u, body);
      C.closeModal();
      C.toast('Account updated');
      paintUsers(document.getElementById('adminBody'));
      mod.key = null; // team or area changes affect the reports
    }).catch((err) => { const el = document.getElementById('auError'); el.textContent = err.message; el.hidden = false; });
  });

  window.QPHAdmin = { render };
})();

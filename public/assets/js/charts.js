/* QAgent Prompt Hub — small dependency-free charts for the admin dashboards.
 * Single-series forms only (line with area wash, horizontal bars, heatmap),
 * all colored by the --viz-* tokens in styles.css. Every chart has a
 * hover/focus tooltip; the tables next to them carry the same numbers.
 */
(function () {
  'use strict';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const compact = (n) => {
    const a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return String(Math.round(n));
  };

  /* One shared tooltip */
  let tip;
  function tooltip() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.className = 'viz-tip';
    tip.setAttribute('role', 'status');
    tip.hidden = true;
    document.body.appendChild(tip);
    return tip;
  }
  function showTip(x, y, value, label) {
    const t = tooltip();
    t.innerHTML = '';
    const v = document.createElement('strong');
    v.textContent = value;
    const l = document.createElement('span');
    l.textContent = label;
    t.append(v, l);
    t.hidden = false;
    const w = t.offsetWidth;
    const h = t.offsetHeight;
    let left = x + 14;
    if (left + w > window.innerWidth - 8) left = x - w - 14;
    let top = y - h - 10;
    if (top < 8) top = y + 16;
    t.style.left = Math.max(8, left) + 'px';
    t.style.top = top + 'px';
  }
  function hideTip() { if (tip) tip.hidden = true; }
  window.addEventListener('scroll', hideTip, { passive: true });

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * p;
  }

  /* ---------------- Line chart (single series, area wash) ---------------- */
  function line(el, points, opts) {
    opts = opts || {};
    const fmt = opts.format || ((v) => compact(v));
    const label = opts.label || '';
    const draw = () => {
      const W = Math.max(280, el.clientWidth);
      const H = opts.height || 220;
      const m = { t: 16, r: 44, b: 28, l: 40 };
      const iw = W - m.l - m.r;
      const ih = H - m.t - m.b;
      const max = niceMax(Math.max(1, ...points.map((p) => p.y)));
      const n = points.length;
      const x = (i) => m.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
      const y = (v) => m.t + ih - (v / max) * ih;
      const ticks = [0, 0.5, 1].map((k) => k * max);
      const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join('');
      const area = n ? `${path}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : '';
      const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 90))));
      const xLabels = points.map((p, i) => (i % every === 0 || i === n - 1) && !(i !== n - 1 && n - 1 - i < every / 2)
        ? `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="viz-axis-label">${esc(p.short || p.x)}</text>` : '').join('');
      const last = points[n - 1];
      el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(opts.aria || label)}">
        ${ticks.map((t) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" class="viz-grid${t === 0 ? ' base' : ''}"/>
          <text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end" class="viz-axis-label tnum">${esc(compact(t))}</text>`).join('')}
        ${xLabels}
        <path d="${area}" class="viz-area"/>
        <path d="${path}" class="viz-line"/>
        ${last ? `<circle cx="${x(n - 1)}" cy="${y(last.y)}" r="4" class="viz-dot"/>
          <text x="${x(n - 1) + 8}" y="${y(last.y) + 4}" class="viz-end-label">${esc(fmt(last.y))}</text>` : ''}
        <line class="viz-cross" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" visibility="hidden"/>
        <circle class="viz-dot viz-hover-dot" r="4" visibility="hidden"/>
        <rect class="viz-hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" tabindex="0" aria-label="Move with arrow keys to read values"/>
      </svg>`;
      const svg = el.querySelector('svg');
      const hit = svg.querySelector('.viz-hit');
      const cross = svg.querySelector('.viz-cross');
      const dot = svg.querySelector('.viz-hover-dot');
      let idx = n - 1;
      const at = (i, cx, cy) => {
        if (!n) return;
        idx = Math.max(0, Math.min(n - 1, i));
        const p = points[idx];
        cross.setAttribute('x1', x(idx)); cross.setAttribute('x2', x(idx)); cross.setAttribute('visibility', 'visible');
        dot.setAttribute('cx', x(idx)); dot.setAttribute('cy', y(p.y)); dot.setAttribute('visibility', 'visible');
        const r = svg.getBoundingClientRect();
        const scale = r.width / W;
        showTip(cx != null ? cx : r.left + x(idx) * scale, cy != null ? cy : r.top + y(p.y) * scale, fmt(p.y), `${label} · ${p.x}`);
      };
      const clear = () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); hideTip(); };
      hit.addEventListener('pointermove', (e) => {
        const r = svg.getBoundingClientRect();
        const px = (e.clientX - r.left) * (W / r.width);
        at(Math.round(((px - m.l) / iw) * (n - 1)), e.clientX, e.clientY);
      });
      hit.addEventListener('pointerleave', clear);
      hit.addEventListener('focus', () => at(idx));
      hit.addEventListener('blur', clear);
      hit.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); at(idx - 1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); at(idx + 1); }
      });
    };
    draw();
    observe(el, draw);
  }

  /* ---------------- Horizontal bars (HTML) ---------------- */
  function bars(el, rows, opts) {
    opts = opts || {};
    const fmt = opts.format || ((v) => v.toLocaleString('en-US'));
    const max = Math.max(1, ...rows.map((r) => r.value));
    if (!rows.length) { el.innerHTML = `<p class="viz-empty">${esc(opts.empty || 'No activity for these filters.')}</p>`; return; }
    el.innerHTML = `<ul class="viz-bars" role="list">${rows.map((r, i) => {
      const pct = (r.value / max) * 100;
      const labelHtml = r.href ? `<a href="${esc(r.href)}">${esc(r.label)}</a>` : (r.filter ? `<button type="button" class="link" data-act="admin-filter" data-key="${esc(r.filter.key)}" data-val="${esc(r.filter.value)}" title="Filter by ${esc(r.label)}">${esc(r.label)}</button>` : esc(r.label));
      return `<li class="viz-bar-row" data-i="${i}">
        <span class="viz-bar-label">${labelHtml}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span>
        <span class="viz-bar-track" tabindex="0" data-i="${i}" aria-label="${esc(r.label)}: ${esc(fmt(r.value))}"><span class="viz-bar" style="width:${pct.toFixed(2)}%"></span><span class="viz-bar-value tnum">${esc(fmt(r.value))}</span></span>
      </li>`;
    }).join('')}</ul>`;
    el.querySelectorAll('.viz-bar-track').forEach((t) => {
      const r = rows[Number(t.dataset.i)];
      const label = r.tip || r.label;
      t.addEventListener('pointermove', (e) => showTip(e.clientX, e.clientY, fmt(r.value), label));
      t.addEventListener('pointerleave', hideTip);
      t.addEventListener('focus', () => { const b = t.getBoundingClientRect(); showTip(b.left + 40, b.top, fmt(r.value), label); });
      t.addEventListener('blur', hideTip);
    });
  }

  /* ---------------- Heatmap: weekday x hour ---------------- */
  function heatmap(el, cells, opts) {
    opts = opts || {};
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const order = [1, 2, 3, 4, 5, 6, 0];
    const grid = {};
    let max = 0;
    for (const c of cells) { grid[c.dow + ':' + c.hour] = c.n; max = Math.max(max, c.n); }
    const step = (n) => (n <= 0 ? 0 : Math.min(5, Math.ceil((n / max) * 5)));
    const hours = Array.from({ length: 24 }, (_, h) => h);
    const hLabel = (h) => (h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : (h - 12) + 'p');
    el.innerHTML = `<div class="viz-heat" role="table" aria-label="${esc(opts.aria || 'Activity by weekday and hour')}">
      <div class="viz-heat-row viz-heat-head" role="row"><span role="columnheader"></span>${hours.map((h) => `<span role="columnheader">${h % 3 === 0 ? hLabel(h) : ''}</span>`).join('')}</div>
      ${order.map((d, di) => `<div class="viz-heat-row" role="row"><span role="rowheader">${days[di]}</span>${hours.map((h) => {
        const n = grid[d + ':' + h] || 0;
        return `<span role="cell" class="viz-cell s${step(n)}" tabindex="${n ? 0 : -1}" data-n="${n}" data-l="${days[di]} ${hLabel(h)}" aria-label="${days[di]} ${hLabel(h)}: ${n}"></span>`;
      }).join('')}</div>`).join('')}
    </div>
    <div class="viz-scale"><span>Fewer</span>${[1, 2, 3, 4, 5].map((s) => `<i class="viz-cell s${s}"></i>`).join('')}<span>More copies</span></div>`;
    el.querySelectorAll('.viz-cell[data-n]').forEach((c) => {
      const show = (x, y) => showTip(x, y, Number(c.dataset.n).toLocaleString('en-US') + ' copies', c.dataset.l);
      c.addEventListener('pointermove', (e) => show(e.clientX, e.clientY));
      c.addEventListener('pointerleave', hideTip);
      c.addEventListener('focus', () => { const b = c.getBoundingClientRect(); show(b.right, b.top); });
      c.addEventListener('blur', hideTip);
    });
  }

  /* Redraw on resize */
  const observers = new WeakMap();
  function observe(el, draw) {
    if (!window.ResizeObserver) return;
    const prev = observers.get(el);
    if (prev) prev.disconnect();
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - w) > 4) { w = el.clientWidth; draw(); } });
    ro.observe(el);
    observers.set(el, ro);
  }

  window.QPHCharts = { line, bars, heatmap, compact, hideTip };
})();

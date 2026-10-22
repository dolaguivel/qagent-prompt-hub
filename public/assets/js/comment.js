/* QAgent Prompt Hub — ticket comment generator.
 * Reads a QAgent report (PDF or Word) in the browser, detects the ticket
 * details and findings, and writes an Azure DevOps comment for the ticket
 * owner in one of five structures. Nothing from the file leaves the browser.
 * Rendered inside the app shell by app.js (route #/comment).
 */
(function () {
  'use strict';

  let C; // context from app.js
  const S = {
    file: null, text: '', blocks: [], detected: {}, phi: [], busy: false, error: '',
    contacts: { team: [], mine: [], canEditTeam: false }, prefs: {}, loaded: false, f: null, view: 'rich'
  };

  /* ------------------------------------------------------------------ */
  /* Defaults and vocabulary                                             */
  /* ------------------------------------------------------------------ */
  const DEFAULT_BASE = 'https://dev.azure.com/CredibleBH/Sustainment';
  const MODELS = [
    [5, 'Two layers (Support + technical)'],
    [1, 'Decision first'],
    [2, 'Summary table'],
    [3, 'SBAR'],
    [4, 'Questions and answers']
  ];
  const DECISIONS = [
    ['defect', 'Confirmed defect'],
    ['duplicate', 'Duplicate'],
    ['info', 'More information needed'],
    ['config', 'Configuration or by design'],
    ['cannot', 'Could not reproduce']
  ];
  const INFO_ITEMS = [
    ['domain', true], ['role', true], ['steps', true], ['expected', true], ['actual', true],
    ['screens', true], ['records', false], ['when', false], ['browser', false]
  ];
  const NEXT_STEPS = ['dev', 'qa', 'dup', 'hold', 'resolve', 'holdclose', 'custom'];
  const DEFAULT_NEXT = { defect: 'dev', duplicate: 'dup', info: 'hold', config: 'resolve', cannot: 'holdclose' };

  const T = {
    en: {
      hi: 'Hi', ownerPh: '[Ticket owner]', decision: 'Decision', reproducible: 'Reproducible', reproduction: 'Reproduction',
      forSupport: 'For Support', technical: 'Technical details (Dev and QA)', inShort: 'In short', whatNot: 'What it is not',
      tellPartner: 'Tell the partner', workaround: 'Workaround', yourAction: 'Your action', nextStep: 'Next step in ADO',
      whatHappening: 'What is happening', evidence: 'Evidence', rootCause: 'Root cause', files: 'Files involved', fix: 'Proposed fix',
      verification: 'Verification', attached: 'Full analysis attached', reviewOf: 'Review summary for', cc: 'CC.',
      decDefect: (c) => `Confirmed code defect${c ? ` (${c.toLowerCase()} confidence)` : ''}.`,
      decDuplicate: (id, t) => `Duplicate of ${id}${t ? ` – ${t}` : ''}.`,
      decInfo: 'We need more information to reproduce this issue.',
      decConfig: 'Not a code defect: the behavior comes from configuration.',
      decDesign: 'Not a code defect: the system is working as designed.',
      decCannot: 'We could not reproduce this issue.',
      reproCode: 'Not reproduced yet; this conclusion comes from code analysis.',
      reproDone: (d, dt, r) => `Reproduced in ${d || '[domain]'}${dt ? ` on ${dt}` : ''}${r ? ` as ${r}` : ''}.`,
      reproPending: (d) => `Not reproduced yet. QA will reproduce it in ${d || 'a test domain'}.`,
      cannotTried: (d, r) => `Tried in ${d || '[domain]'}${r ? ` as ${r}` : ''}.`,
      noWorkaround: 'There is no workaround yet.',
      why: 'Why', dupCause: 'same root cause.', dupSteps: 'same steps and result.', dupBoth: 'same root cause, steps and result.',
      dupLinked: (id) => `Linked as "Duplicate Of" ${id}. This ticket will be closed; please follow ${id} for updates.`,
      replyWith: 'Please reply with:',
      hold: (n) => `The ticket stays on hold until we receive this. If there is no reply in ${n} business days, it will be closed and can be reopened with this information.`,
      adminSteps: 'Steps for the administrator', relogin: 'After the change, sign out and back in so the new settings load.',
      tried: 'What we tried', cannotNext: 'If it happens again, please send the steps, the domain, the user role and a screenshot.',
      stepsUsed: 'Steps used',
      action: { defect: 'Update the partner. Nothing else is needed.', duplicate: 'Follow the original ticket; no further action on this one.', info: 'Send us the information listed above.', config: 'Share the steps above with the partner’s administrator.', cannot: 'Send us the details above if the issue happens again.' },
      next: { dev: 'Moving to Development.', qa: 'Keeping it open while QA reproduces it.', dup: 'Closing as Duplicate.', hold: 'On hold until we receive the information.', resolve: 'Resolving this ticket.', holdclose: 'On hold; it will be closed if there is no new information.' },
      situation: 'Situation', background: 'Background', assessment: 'Assessment', recommendation: 'Recommendation',
      reports: (p, t) => `${p || 'The partner'} reports: ${t || '[issue]'}.`,
      reviewed: (pl) => `We reviewed the ticket and the ${pl || 'platform'} code involved.`,
      qBug: 'Is it a bug?', qDup: 'Is it a duplicate?', qSetup: 'Is it the partner’s setup?', qRepro: 'Can it be reproduced?',
      qWork: 'Is there a workaround?', qTell: 'What do I tell the partner?', qNeed: 'What do you need from me?', qNext: 'What happens next?',
      yes: 'Yes.', no: 'No.', yesDefect: 'Yes, a confirmed code defect.', noBug: 'No.', setupYes: 'Yes, it comes from configuration.', setupNo: 'No.',
      tDecision: 'Decision', tDuplicate: 'Duplicate', tRepro: 'Reproducible', tWhat: 'What happens', tSetup: 'Caused by partner setup?',
      tWork: 'Workaround', tTell: 'Tell the partner', tEvidence: 'Evidence', tNext: 'Next step', nothing: 'Nothing else is needed.',
      evidenceAttached: (n) => `Analysis attached${n ? ` (${n})` : ''}`, code: 'Code'
    },
    es: {
      hi: 'Hola', ownerPh: '[Responsable del ticket]', decision: 'Decisión', reproducible: 'Reproducible', reproduction: 'Reproducción',
      forSupport: 'Para Soporte', technical: 'Detalle técnico (Dev y QA)', inShort: 'En resumen', whatNot: 'Lo que no es',
      tellPartner: 'Qué decirle al partner', workaround: 'Workaround', yourAction: 'Tu acción', nextStep: 'Siguiente paso en ADO',
      whatHappening: 'Qué está pasando', evidence: 'Evidencia', rootCause: 'Causa raíz', files: 'Archivos involucrados', fix: 'Fix propuesto',
      verification: 'Verificación', attached: 'Análisis completo adjunto', reviewOf: 'Resumen de la revisión de', cc: 'CC.',
      decDefect: (c) => `Defecto de código confirmado${c ? ` (confianza ${({ high: 'alta', medium: 'media', low: 'baja' })[c.toLowerCase()] || c})` : ''}.`,
      decDuplicate: (id, t) => `Duplicado de ${id}${t ? ` – ${t}` : ''}.`,
      decInfo: 'Necesitamos más información para reproducir este problema.',
      decConfig: 'No es un defecto de código: el comportamiento viene de la configuración.',
      decDesign: 'No es un defecto de código: el sistema funciona según su diseño.',
      decCannot: 'No pudimos reproducir este problema.',
      reproCode: 'Aún no reproducido; la conclusión viene del análisis del código.',
      reproDone: (d, dt, r) => `Reproducido en ${d || '[dominio]'}${dt ? ` el ${dt}` : ''}${r ? ` con el rol ${r}` : ''}.`,
      reproPending: (d) => `Aún no reproducido. QA lo reproducirá en ${d || 'un dominio de prueba'}.`,
      cannotTried: (d, r) => `Probado en ${d || '[dominio]'}${r ? ` con el rol ${r}` : ''}.`,
      noWorkaround: 'Por ahora no hay workaround.',
      why: 'Motivo', dupCause: 'misma causa raíz.', dupSteps: 'mismos pasos y resultado.', dupBoth: 'misma causa raíz, pasos y resultado.',
      dupLinked: (id) => `Vinculado como "Duplicate Of" ${id}. Este ticket se cerrará; por favor sigue ${id} para novedades.`,
      replyWith: 'Por favor responde con:',
      hold: (n) => `El ticket queda en espera hasta recibir esto. Si no hay respuesta en ${n} días hábiles, se cerrará y se puede reabrir con esta información.`,
      adminSteps: 'Pasos para el administrador', relogin: 'Después del cambio, cierra sesión y vuelve a entrar para que se carguen los nuevos valores.',
      tried: 'Lo que probamos', cannotNext: 'Si vuelve a pasar, envíanos los pasos, el dominio, el rol del usuario y una captura.',
      stepsUsed: 'Pasos usados',
      action: { defect: 'Actualizar al partner. No se necesita nada más.', duplicate: 'Seguir el ticket original; no hay más acciones en este.', info: 'Enviarnos la información de la lista.', config: 'Compartir los pasos con el administrador del partner.', cannot: 'Enviarnos los detalles si el problema vuelve a ocurrir.' },
      next: { dev: 'Pasa a Desarrollo.', qa: 'Queda abierto mientras QA lo reproduce.', dup: 'Se cierra como Duplicate.', hold: 'En espera hasta recibir la información.', resolve: 'Se resuelve este ticket.', holdclose: 'En espera; se cerrará si no hay información nueva.' },
      situation: 'Situación', background: 'Contexto', assessment: 'Evaluación', recommendation: 'Recomendación',
      reports: (p, t) => `${p || 'El partner'} reporta: ${t || '[problema]'}.`,
      reviewed: (pl) => `Revisamos el ticket y el código de ${pl || 'la plataforma'} involucrado.`,
      qBug: '¿Es un bug?', qDup: '¿Es un duplicado?', qSetup: '¿Es la configuración del partner?', qRepro: '¿Se puede reproducir?',
      qWork: '¿Hay workaround?', qTell: '¿Qué le digo al partner?', qNeed: '¿Qué necesitan de mí?', qNext: '¿Qué sigue?',
      yes: 'Sí.', no: 'No.', yesDefect: 'Sí, un defecto de código confirmado.', noBug: 'No.', setupYes: 'Sí, viene de la configuración.', setupNo: 'No.',
      tDecision: 'Decisión', tDuplicate: 'Duplicado', tRepro: 'Reproducible', tWhat: 'Qué pasa', tSetup: '¿Lo causa la configuración del partner?',
      tWork: 'Workaround', tTell: 'Qué decirle al partner', tEvidence: 'Evidencia', tNext: 'Siguiente paso', nothing: 'No se necesita nada más.',
      evidenceAttached: (n) => `Análisis adjunto${n ? ` (${n})` : ''}`, code: 'Código'
    }
  };
  const INFO_LABELS = {
    en: { domain: 'Domain and environment where it happens', role: 'User role or security profile', steps: 'Steps to reproduce, numbered, starting from login', expected: 'Expected result', actual: 'Actual result (exact error text or a screenshot)', screens: 'Screenshots or a short screen recording', records: 'Record IDs involved (no patient names)', when: 'When it started and how often it happens', browser: 'Browser and version' },
    es: { domain: 'Dominio y ambiente donde ocurre', role: 'Rol o perfil de seguridad del usuario', steps: 'Pasos para reproducirlo, numerados, desde el inicio de sesión', expected: 'Resultado esperado', actual: 'Resultado actual (texto exacto del error o una captura)', screens: 'Capturas de pantalla o un video corto', records: 'IDs de los registros involucrados (sin nombres de pacientes)', when: 'Cuándo empezó y con qué frecuencia ocurre', browser: 'Navegador y versión' }
  };
  const NEXT_LABELS = { dev: 'Move to Development', qa: 'Keep open for QA to reproduce', dup: 'Close as Duplicate', hold: 'On hold until the information arrives', resolve: 'Resolve the ticket', holdclose: 'On hold; close if no new information', custom: 'Write my own' };

  function blankForm() {
    return {
      adoBase: DEFAULT_BASE, id: '', title: '', partner: '', caseRef: '', platform: '',
      owner: '', cc: [], greeting: 'hi', signature: '',
      decision: 'defect', configKind: 'config', confidence: '',
      repro: 'code', reproDomain: '', reproDate: '', reproRole: '', reproSteps: '',
      dupId: '', dupTitle: '', dupReason: 'cause',
      infoItems: INFO_ITEMS.filter((x) => x[1]).map((x) => x[0]), holdDays: 5,
      configSteps: '', relogin: false, cannotTried: '', cannotDomain: '', cannotRole: '',
      nextStep: 'dev', nextCustom: '', nextAuto: true,
      model: 5, language: 'en', secPartner: true, secWorkaround: true, secTechnical: true, secFix: true,
      attach: true, attachName: '',
      summary: '', whatNot: '', tellPartner: '', workaround: '', rootCause: '', files: '', fixes: '', verification: ''
    };
  }
  // Settings a preset or the "last configuration" carries (not ticket content).
  const SNAPSHOT_KEYS = ['greeting', 'decision', 'configKind', 'repro', 'dupReason', 'infoItems', 'holdDays', 'nextStep', 'nextCustom', 'nextAuto', 'model', 'language', 'secPartner', 'secWorkaround', 'secTechnical', 'secFix', 'attach', 'cc'];
  const snapshot = () => { const o = {}; SNAPSHOT_KEYS.forEach((k) => { o[k] = Array.isArray(S.f[k]) ? S.f[k].slice() : S.f[k]; }); return o; };
  function applySnapshot(o) {
    if (!o || typeof o !== 'object') return;
    SNAPSHOT_KEYS.forEach((k) => { if (o[k] !== undefined) S.f[k] = Array.isArray(o[k]) ? o[k].slice() : o[k]; });
  }

  /* ------------------------------------------------------------------ */
  /* Loading PDF.js and Mammoth on demand                                */
  /* ------------------------------------------------------------------ */
  function injectInline(id) {
    const holder = document.getElementById(id);
    if (!holder) return false;
    const s = document.createElement('script');
    s.textContent = holder.textContent;
    document.head.appendChild(s);
    holder.remove();
    return true;
  }
  async function loadPdfJs() {
    if (!window.pdfjsLib) {
      if (C.LOCAL) {
        // One-file edition: run the PDF parser on the page itself (no worker file to load).
        injectInline('qph-vendor-pdf');
        injectInline('qph-vendor-pdfworker');
      } else {
        await C.loadScript('assets/vendor/pdf.min.js');
      }
    }
    const lib = window.pdfjsLib;
    if (!lib) throw new Error('The PDF reader did not load.');
    if (!C.LOCAL && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdf.worker.min.js';
    return lib;
  }
  async function loadMammoth() {
    if (!window.mammoth) {
      if (C.LOCAL) injectInline('qph-vendor-mammoth');
      else await C.loadScript('assets/vendor/mammoth.browser.min.js');
    }
    if (!window.mammoth) throw new Error('The Word reader did not load.');
    return window.mammoth;
  }

  /* ------------------------------------------------------------------ */
  /* Reading files into blocks: {type: heading|para|bullet, text}        */
  /* ------------------------------------------------------------------ */
  async function pdfToBlocks(buf) {
    const lib = await loadPdfJs();
    const pdf = await lib.getDocument({ data: buf, isEvalSupported: false, disableFontFace: true }).promise;
    const lines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      let cur = null;
      const push = () => { if (cur && cur.text.trim()) lines.push(cur); cur = null; };
      for (const it of tc.items) {
        if (typeof it.str !== 'string') continue;
        const y = it.transform[5];
        const x = it.transform[4];
        const h = Math.abs(it.transform[3]) || it.height || 10;
        if (cur && Math.abs(y - cur.y) > Math.max(cur.h, h) * 0.55) push();
        if (!cur) cur = { page: p, y, h, text: '', endX: x };
        if (cur.text && it.str && !/\s$/.test(cur.text) && !/^\s/.test(it.str) && x > cur.endX + h * 0.15) cur.text += ' ';
        cur.text += it.str;
        cur.h = Math.max(cur.h, h);
        cur.endX = x + (it.width || 0);
        if (it.hasEOL) push();
      }
      push();
    }
    S.file.pages = pdf.numPages;
    // Body text size = the most common height among long lines.
    const sizes = {};
    lines.filter((l) => l.text.length > 40).forEach((l) => { const k = Math.round(l.h * 2) / 2; sizes[k] = (sizes[k] || 0) + 1; });
    const body = Number(Object.keys(sizes).sort((a, b) => sizes[b] - sizes[a])[0]) || 10;
    const blocks = [];
    let prev = null;
    for (const l of lines) {
      const text = l.text.replace(/\s+/g, ' ').trim();
      if (/^\d+\s*\/\s*\d+$/.test(text) || /^page \d+( of \d+)?$/i.test(text)) continue; // page numbers
      const heading = l.h >= body * 1.18 && text.length < 140;
      const bullet = /^([•·▪◦\-–*]|\d+[.)])\s+/.test(text);
      const gap = prev && prev.page === l.page ? prev.y - l.y : Infinity;
      const last = blocks[blocks.length - 1];
      const continues = last && !heading && !bullet && last.type !== 'heading' && prev && prev.page === l.page && gap > 0 && gap <= prev.h * 1.75 && Math.abs(prev.h - l.h) < 1;
      if (continues) last.text = last.text.replace(/-$/, '') + (last.text.endsWith('-') ? '' : ' ') + text;
      else if (heading && last && last.type === 'heading' && prev && prev.page === l.page && gap <= prev.h * 1.6) last.text += ' ' + text;
      else blocks.push({ type: heading ? 'heading' : bullet ? 'bullet' : 'para', text: text.replace(/^[•·▪◦]\s+/, '') });
      prev = l;
    }
    return blocks;
  }

  async function docxToBlocks(buf) {
    const mammoth = await loadMammoth();
    const out = await mammoth.convertToHtml({ arrayBuffer: buf });
    const doc = new DOMParser().parseFromString(`<div>${out.value}</div>`, 'text/html');
    const blocks = [];
    const walk = (node) => {
      for (const el of node.children) {
        const tag = el.tagName.toLowerCase();
        const text = el.textContent.replace(/\s+/g, ' ').trim();
        if (/^h[1-6]$/.test(tag)) { if (text) blocks.push({ type: 'heading', text }); }
        else if (tag === 'p' || tag === 'pre') {
          if (!text) continue;
          const strongOnly = el.children.length === 1 && el.firstElementChild.tagName === 'STRONG' && el.firstElementChild.textContent.trim() === el.textContent.trim();
          blocks.push({ type: strongOnly && text.length < 140 ? 'heading' : /^([•·▪\-–*]|\d+[.)])\s+/.test(text) ? 'bullet' : 'para', text: text.replace(/^[•·▪]\s+/, '') });
        } else if (tag === 'ul' || tag === 'ol') {
          for (const li of el.children) { const t = li.textContent.replace(/\s+/g, ' ').trim(); if (t) blocks.push({ type: 'bullet', text: t }); }
        } else if (tag === 'table') {
          for (const tr of el.querySelectorAll('tr')) {
            const cells = Array.from(tr.children).map((c) => c.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
            if (cells.length) blocks.push({ type: 'para', text: cells.join(' | ') });
          }
        } else walk(el);
      }
    };
    walk(doc.body.firstElementChild);
    return blocks;
  }

  /* ------------------------------------------------------------------ */
  /* Finding the ticket details and findings in the blocks               */
  /* ------------------------------------------------------------------ */
  // Text copied out of a PDF keeps the spaces around code spans and stray bullet glyphs.
  const tidy = (t) => String(t || '').replace(/(\s*[•·▪◦])+\s*$/g, '').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+([,.;:])(?=\s|$)/g, '$1').replace(/\s{2,}/g, ' ').trim();
  const sentences = (t) => String(t || '').match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [];
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const sectionAfter = (blocks, re) => {
    const i = blocks.findIndex((b) => b.type === 'heading' && re.test(b.text));
    if (i < 0) return null;
    const out = [];
    for (let j = i + 1; j < blocks.length && blocks[j].type !== 'heading'; j++) out.push(blocks[j]);
    return { heading: blocks[i], items: out };
  };

  function detect(blocks, fileName) {
    const all = blocks.map((b) => b.text).join('\n');
    const d = {};
    const first = (res, src = all) => { for (const re of res) { const m = src.match(re); if (m) return m[1].trim(); } return ''; };

    d.id = first([/\bADO\s*#?\s*(\d{5,7})\b/i, /_workitems\/edit\/(\d{5,7})/i, /\bwork\s*item\s*#?\s*(\d{5,7})\b/i, /\bBug\s+#?(\d{5,7})\b/i])
      || first([/(?:ado|bug|wi|workitem)[-_ ]?(\d{5,7})/i], fileName || '');
    d.title = first([/\bBug:\s*(.+?)(?=\s+(?:Partner|CRM|Case|Customers?)\b[^\n]*:|\n|$)/i, /\bBug\s+\d{5,7}\s*[—–-]\s*(.+?)(?:\n|$)/i, /\bTitle:\s*(.+?)(?:\n|$)/i]);
    d.partner = first([/\bPartner:\s*([^|\n]+?)(?=\s*\||\s+CRM\b|\s+Case\b|\n|$)/i, /\bCustomers?\s+Impacted:\s*([^\n|]+?)(?=\s+Case\b|\n|$)/i, /\bCustomer:\s*([^\n|]+?)(?:\n|$)/i]);
    const crm = first([/\bCRM:\s*([A-Z]{2,}-\d{3,})/]);
    const kase = first([/\bCase(?:\s*ID)?\s*[:#]?\s*(\d{6,})/i]);
    d.caseRef = [kase ? `Case ${kase}` : '', crm].filter(Boolean).join(', ');

    const counts = { Credible: (all.match(/credible/gi) || []).length, CareLogic: (all.match(/carelogic/gi) || []).length, InSync: (all.match(/insync/gi) || []).length };
    const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    d.platform = counts[top] ? top : '';

    // Verdict and confidence
    const vi = blocks.findIndex((b) => /^(verdict|classification|decision)\s*:/i.test(b.text));
    const verdict = vi >= 0 ? blocks[vi].text.replace(/^(verdict|classification|decision)\s*:\s*/i, '') : first([/\b(?:Verdict|Classification):\s*([^\n]+)/i]);
    d.verdict = verdict;
    d.confidence = (verdict.match(/\b(high|medium|low)\b\s*confidence/i) || all.match(/\b(high|medium|low)\s+confidence\b/i) || [])[1] || '';
    if (d.confidence) d.confidence = cap(d.confidence.toLowerCase());
    const dupOf = first([/\bduplicate\s+of\s+(?:ADO\s*)?#?(\d{5,7})/i]);
    if (dupOf) { d.decision = 'duplicate'; d.dupId = dupOf; }
    else if (/duplicate/i.test(verdict)) d.decision = 'duplicate';
    else if (/work(?:ing|s)? as designed|by design|expected behavior|not a defect/i.test(verdict)) { d.decision = 'config'; d.configKind = 'design'; }
    else if (/configuration|permission|setup|setting/i.test(verdict) && !/defect/i.test(verdict)) { d.decision = 'config'; d.configKind = 'config'; }
    else if (/insufficient|more information|need(s)? info|cannot determine|unable to determine/i.test(verdict)) d.decision = 'info';
    else if (/could not reproduce|cannot reproduce|not reproducible/i.test(verdict)) d.decision = 'cannot';
    else if (/defect|bug|code/i.test(verdict)) d.decision = 'defect';

    // Plain-language summary: the paragraph right after the verdict.
    const verdictPara = vi >= 0 ? (blocks.slice(vi + 1).find((b) => b.type === 'para') || {}).text || '' : '';
    const vs = sentences(verdictPara);
    const notSentences = vs.filter((s) => /^(this is not|it is not|this isn't|not caused|this was not)/i.test(s));
    const rest = vs.filter((s) => !notSentences.includes(s));
    d.summary = rest[0] && rest[0].length < 90 ? rest.slice(0, 2).join(' ') : (rest[0] || '');

    // What it is not, and what to tell the partner
    const notLines = notSentences.slice();
    const shouldNot = sectionAfter(blocks, /should not|do not do|don't/i);
    let partnerNote = '';
    if (shouldNot) {
      for (const b of shouldNot.items) {
        const t = b.text;
        if (/^no\s/i.test(t)) notLines.push(t.split(/\s[—–-]\s/)[0].replace(/[.;]?$/, '.'));
        const m = t.match(/(?:inform|tell|let)\s+the\s+partner(?:\s+know)?(?:\s+that)?\s+(.+?)(?:\.|$)/i);
        if (m && !partnerNote) partnerNote = cap(m[1].trim()) + '.';
      }
    }
    if (!partnerNote) {
      const m = all.match(/(?:inform|tell|let)\s+the\s+partner(?:\s+know)?(?:\s+that)?\s+([^.\n]+)/i);
      if (m) partnerNote = cap(m[1].trim()) + '.';
    }
    d.whatNot = notLines.join('\n');
    d.tellPartner = partnerNote;
    const wa = all.match(/workaround[^.\n]*[.\n]/i);
    d.workaround = wa ? cap(wa[0].trim()) : '';

    // Technical part
    const sum = sectionAfter(blocks, /summary/i);
    d.rootCause = sum ? tidy(sum.items.map((b) => b.text).join(' ')) : '';
    const files = [];
    for (const b of blocks) {
      const m = b.text.match(/^File\s+\d+\s*[—–:-]\s*([^\s(]+)/i);
      if (m && !files.includes(m[1])) files.push(m[1]);
    }
    d.files = files.join('\n');
    const fixes = [];
    for (const b of blocks) {
      const m = b.text.match(/^Fix(?:\s+Layer)?\s*\d*\s*(?:\([^)]*\))?\s*:\s*(.+)$/i);
      if (m && b.type === 'heading') fixes.push(m[1].trim());
    }
    d.fixes = fixes.join('\n');
    const sqlHead = blocks.find((b) => b.type === 'heading' && /read-only sql|diagnostic quer|sql to confirm|verification quer/i.test(b.text));
    if (sqlHead) {
      const num = (sqlHead.text.match(/^(\d+)[.)]/) || [])[1];
      d.verification = `Read-only SQL to confirm it is in ${num ? `section ${num}` : 'the SQL section'} of the attached analysis.`;
    }
    return d;
  }

  /* PHI patterns. A hint for a human review, not a guarantee. */
  function phiFindings(text) {
    const checks = [
      ['Social Security numbers', /\b\d{3}-\d{2}-\d{4}\b/g],
      ['Dates of birth', /\b(?:DOB|date of birth|birth\s?date)\b\s*[:\-]?\s*\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/gi],
      ['Medical record numbers', /\bMRN\b\s*[:#]?\s*[A-Z0-9-]{4,}/gi],
      ['Phone numbers', /(?:\(\d{3}\)\s?|\b\d{3}[-.\s])\d{3}[-.\s]\d{4}\b/g],
      ['Personal email addresses', /\b[A-Z0-9._%+-]+@(?!qualifacts\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/gi]
    ];
    const out = [];
    for (const [label, re] of checks) {
      const m = String(text || '').match(re);
      if (m && m.length) out.push({ label, count: m.length });
    }
    return out;
  }

  async function readFile(file) {
    const name = file.name || 'report';
    const ext = (name.split('.').pop() || '').toLowerCase();
    S.error = '';
    if (ext === 'doc') { S.error = 'Old Word files (.doc) cannot be read. Save it as .docx or export it as PDF, then add it again.'; return paintAll(); }
    if (!['pdf', 'docx'].includes(ext)) { S.error = 'Add a PDF or a Word (.docx) file.'; return paintAll(); }
    if (file.size > 15 * 1024 * 1024) { S.error = 'The file is larger than 15 MB. Export only the analysis and try again.'; return paintAll(); }
    S.busy = true;
    S.file = { name, size: file.size, kind: ext, pages: null };
    paintAll();
    try {
      const buf = await file.arrayBuffer();
      S.blocks = ext === 'pdf' ? await pdfToBlocks(buf) : await docxToBlocks(buf);
      S.text = S.blocks.map((b) => b.text).join('\n');
      if (!S.text.trim()) throw new Error('No text was found in this file. If it is a scanned image, export the analysis from QAgent as text or PDF again.');
      S.detected = detect(S.blocks, name);
      S.phi = phiFindings(S.text);
      applyDetected(S.detected);
      S.f.attachName = name;
    } catch (err) {
      S.error = err.message || 'The file could not be read.';
      S.file = null; S.blocks = []; S.text = ''; S.detected = {}; S.phi = [];
    } finally {
      S.busy = false;
      paintAll();
    }
  }

  function applyDetected(d) {
    const f = S.f;
    ['id', 'title', 'partner', 'caseRef', 'platform', 'summary', 'whatNot', 'tellPartner', 'workaround', 'rootCause', 'files', 'fixes', 'verification', 'confidence', 'dupId']
      .forEach((k) => { if (d[k]) f[k] = d[k]; });
    if (d.decision) { f.decision = d.decision; if (f.nextAuto) f.nextStep = DEFAULT_NEXT[d.decision]; }
    if (d.configKind) f.configKind = d.configKind;
    if (!f.platform) f.platform = C.varValue('PLATFORM');
    if (!f.id) f.id = C.varValue('WORK_ITEM_ID');
  }

  /* ------------------------------------------------------------------ */
  /* Composing the comment                                               */
  /* ------------------------------------------------------------------ */
  const lines = (t) => String(t || '').split(/\r?\n/).map((s) => s.replace(/^[-•*]\s+/, '').trim()).filter(Boolean);
  const mention = (n) => '@' + String(n || '').replace(/^@+/, '').trim();

  function compose(opts) {
    const f = S.f;
    const L = T[f.language] || T.en;
    const technical = opts.technical && f.secTechnical;
    const doc = [];
    const P = (...parts) => doc.push({ k: 'p', parts: parts.flat().filter((x) => x !== '' && x != null) });
    const H = (text) => doc.push({ k: 'h', text });
    const UL = (items) => { const it = items.filter(Boolean); if (it.length) doc.push({ k: 'ul', items: it.map((x) => (Array.isArray(x) ? x : [x])) }); };
    const B = (t) => ({ b: t });
    const ticket = (id) => {
      const clean = String(id || '').replace(/\D/g, '');
      if (!clean) return '#[ID]';
      return f.adoBase ? { a: `${f.adoBase.replace(/\/+$/, '')}/_workitems/edit/${clean}`, text: `#${clean}` } : `#${clean}`;
    };
    const ticketText = (id) => { const t = ticket(id); return typeof t === 'string' ? t : t.text; };
    const owner = f.owner ? mention(f.owner) : '@' + L.ownerPh;

    const decisionText = () => {
      switch (f.decision) {
        case 'duplicate': return L.decDuplicate(ticketText(f.dupId), f.dupTitle);
        case 'info': return L.decInfo;
        case 'config': return f.configKind === 'design' ? L.decDesign : L.decConfig;
        case 'cannot': return L.decCannot;
        default: return L.decDefect(f.confidence);
      }
    };
    const reproText = () => {
      if (f.decision === 'cannot') return L.cannotTried(f.cannotDomain, f.cannotRole);
      if (f.decision !== 'defect') return '';
      if (f.repro === 'reproduced') return L.reproDone(f.reproDomain, f.reproDate, f.reproRole);
      if (f.repro === 'pending') return L.reproPending(f.reproDomain);
      return L.reproCode;
    };
    const nextText = () => (f.nextStep === 'custom' ? f.nextCustom.trim() : L.next[f.nextStep] || '');
    const workaroundText = () => f.workaround.trim() || L.noWorkaround;
    const whatNot = lines(f.whatNot);
    const decisionBlock = () => {
      if (f.decision === 'duplicate') {
        P(B(L.why + ':'), ' ', ({ cause: L.dupCause, steps: L.dupSteps, both: L.dupBoth })[f.dupReason] || L.dupCause);
        P(L.dupLinked(ticketText(f.dupId)));
      } else if (f.decision === 'info') {
        P(B(L.replyWith));
        UL(f.infoItems.map((k) => (INFO_LABELS[f.language] || INFO_LABELS.en)[k]));
        P(L.hold(Math.max(1, Number(f.holdDays) || 5)));
      } else if (f.decision === 'config') {
        const steps = lines(f.configSteps);
        if (steps.length) { H(L.adminSteps); doc.push({ k: 'ol', items: steps.map((s) => [s]) }); }
        if (f.relogin) P(L.relogin);
      } else if (f.decision === 'cannot') {
        if (f.cannotTried.trim()) P(B(L.tried + ':'), ' ', f.cannotTried.trim());
        P(L.cannotNext);
      } else if (f.decision === 'defect' && f.repro === 'reproduced' && lines(f.reproSteps).length) {
        H(L.stepsUsed); doc.push({ k: 'ol', items: lines(f.reproSteps).map((s) => [s]) });
      }
    };
    const technicalBlock = () => {
      if (f.rootCause.trim()) { H(L.rootCause); P(f.rootCause.trim()); }
      const files = lines(f.files);
      if (files.length) { H(L.files); UL(files); }
      const fixes = lines(f.fixes);
      if (f.secFix && fixes.length) { H(L.fix); UL(fixes); }
      if (f.verification.trim()) P(B(L.verification + ':'), ' ', f.verification.trim());
      if (f.attach && f.attachName) P(B(L.attached + ':'), ' ', f.attachName);
    };
    const addTechnical = () => {
      if (!technical) return;
      const start = doc.length;
      doc.push({ k: 'hr' });
      H(L.technical);
      const mark = doc.length;
      technicalBlock();
      if (doc.length === mark) doc.splice(start);
    };
    const greeting = () => {
      if (f.greeting === 'hi') P(`${L.hi} ${owner},`);
      else if (f.greeting === 'mention') P(owner);
    };
    const closing = () => {
      if (f.cc.length) P(L.cc + ' ' + f.cc.map(mention).join(', '));
      const sig = lines(f.signature);
      if (sig.length) doc.push({ k: 'p', parts: [sig.join('\n')] });
    };
    const header = () => {
      const meta = [f.partner, f.caseRef].filter(Boolean).join(', ');
      P(B(`${L.reviewOf} `), B(ticket(f.id)), f.title ? `: ${f.title}` : '', meta ? ` (${meta})` : '');
    };
    const partnerSetup = () => (f.decision === 'config' ? (f.configKind === 'design' ? L.no : L.setupYes) : (whatNot[0] || L.setupNo));
    const repro = reproText();

    greeting();
    const model = Number(f.model) || 5;
    if (model === 1) {
      P(B(L.decision + ':'), ' ', decisionText(), ' ', nextText());
      if (repro) P(B((f.decision === 'defect' ? L.reproducible : L.reproduction) + ':'), ' ', repro);
      if (f.summary.trim()) { H(L.whatHappening); P(f.summary.trim()); }
      if (whatNot.length) { H(L.whatNot); P(whatNot.join(' ')); }
      if (f.secPartner && f.tellPartner.trim()) { H(L.tellPartner); P(f.tellPartner.trim(), f.secWorkaround ? ' ' + workaroundText() : ''); }
      else if (f.secWorkaround) { H(L.workaround); P(workaroundText()); }
      decisionBlock();
      const ev = [];
      if (f.attach && f.attachName) ev.push(L.evidenceAttached(f.attachName));
      const fl = lines(f.files);
      if (fl.length) ev.push(`${L.code}: ${fl.map((x) => x.split('/').pop()).join(', ')}`);
      if (ev.length) { H(L.evidence); UL(ev); }
      addTechnical();
    } else if (model === 2) {
      header();
      const rows = [
        [L.tDecision, decisionText()],
        [L.tDuplicate, f.decision === 'duplicate' ? ticketText(f.dupId) : L.no.replace('.', '')],
        [L.tRepro, repro || '—'],
        [L.tWhat, f.summary.trim() || f.title || '—'],
        [L.tSetup, partnerSetup()]
      ];
      if (f.secWorkaround) rows.push([L.tWork, workaroundText()]);
      if (f.secPartner && f.tellPartner.trim()) rows.push([L.tTell, f.tellPartner.trim()]);
      if (f.attach && f.attachName) rows.push([L.tEvidence, L.evidenceAttached(f.attachName)]);
      rows.push([L.tNext, nextText()]);
      doc.push({ k: 'table', rows });
      decisionBlock();
      addTechnical();
    } else if (model === 3) {
      H(L.situation); P(L.reports(f.partner, f.title));
      H(L.background); P(L.reviewed(f.platform), f.attach && f.attachName ? ' ' + L.evidenceAttached(f.attachName) + '.' : '');
      H(L.assessment); P(decisionText(), f.summary.trim() ? ' ' + f.summary.trim() : '', whatNot.length ? ' ' + whatNot.join(' ') : '', repro ? ' ' + repro : '');
      decisionBlock();
      H(L.recommendation);
      UL([nextText(), L.action[f.decision], f.secPartner && f.tellPartner.trim() ? `${L.tellPartner}: ${f.tellPartner.trim()}` : '', f.secWorkaround ? `${L.workaround}: ${workaroundText()}` : '']);
      addTechnical();
    } else if (model === 4) {
      header();
      const qa = (q, a) => { if (a) P(B(q), ' ', a); };
      qa(L.qBug, f.decision === 'defect' ? L.yes + ' ' + L.decDefect(f.confidence) : f.decision === 'duplicate' ? L.decDuplicate(ticketText(f.dupId), f.dupTitle) : decisionText());
      qa(L.qDup, f.decision === 'duplicate' ? L.yes + ' ' + ticketText(f.dupId) : L.no);
      qa(L.qSetup, partnerSetup());
      qa(L.qRepro, repro || '—');
      if (f.secWorkaround) qa(L.qWork, workaroundText());
      if (f.secPartner && f.tellPartner.trim()) qa(L.qTell, f.tellPartner.trim());
      qa(L.qNeed, f.decision === 'info' ? L.replyWith.replace(/:$/, ' the list below.') : L.action[f.decision]);
      decisionBlock();
      qa(L.qNext, nextText());
      addTechnical();
    } else {
      H(L.forSupport);
      P(B(L.decision + ':'), ' ', decisionText());
      if (repro) P(B((f.decision === 'defect' ? L.reproducible : L.reproduction) + ':'), ' ', repro);
      if (f.summary.trim()) P(B(L.inShort + ':'), ' ', f.summary.trim());
      if (whatNot.length) P(B(L.whatNot + ':'), ' ', whatNot.join(' '));
      if (f.secPartner && f.tellPartner.trim()) P(B(L.tellPartner + ':'), ' ', f.tellPartner.trim());
      if (f.secWorkaround) P(B(L.workaround + ':'), ' ', workaroundText());
      decisionBlock();
      P(B(L.yourAction + ':'), ' ', L.action[f.decision]);
      if (nextText()) P(B(L.nextStep + ':'), ' ', nextText());
      addTechnical();
    }
    closing();
    return doc;
  }

  function partHTML(p) {
    if (typeof p === 'string') return C.esc(p).replace(/\n/g, '<br>');
    if (p.b !== undefined) return `<b>${partHTML(p.b)}</b>`;
    if (p.a) return `<a href="${C.esc(p.a)}">${C.esc(p.text)}</a>`;
    return '';
  }
  const partText = (p) => (typeof p === 'string' ? p : p.b !== undefined ? partText(p.b) : p.a ? p.text : '');
  function toHTML(doc) {
    return doc.map((n) => {
      if (n.k === 'p') return `<p>${n.parts.map(partHTML).join('')}</p>`;
      if (n.k === 'h') return `<p><b>${C.esc(n.text)}</b></p>`;
      if (n.k === 'ul' || n.k === 'ol') return `<${n.k}>${n.items.map((it) => `<li>${it.map(partHTML).join('')}</li>`).join('')}</${n.k}>`;
      if (n.k === 'hr') return '<hr>';
      if (n.k === 'table') return `<table style="border-collapse:collapse">${n.rows.map(([l, v]) => `<tr><td style="border:1px solid #c3cad7;padding:4px 8px;vertical-align:top"><b>${C.esc(l)}</b></td><td style="border:1px solid #c3cad7;padding:4px 8px;vertical-align:top">${C.esc(v)}</td></tr>`).join('')}</table>`;
      return '';
    }).join('\n');
  }
  function toText(doc) {
    return doc.map((n) => {
      if (n.k === 'p') return n.parts.map(partText).join('');
      if (n.k === 'h') return n.text;
      if (n.k === 'ul') return n.items.map((it) => '- ' + it.map(partText).join('')).join('\n');
      if (n.k === 'ol') return n.items.map((it, i) => `${i + 1}. ` + it.map(partText).join('')).join('\n');
      if (n.k === 'hr') return '----------------------------------------';
      if (n.k === 'table') return n.rows.map(([l, v]) => `${l}: ${v}`).join('\n');
      return '';
    }).join('\n\n');
  }

  function missing() {
    const f = S.f;
    const m = [];
    if (!f.owner.trim()) m.push('Ticket owner');
    if (!f.id.trim()) m.push('Work item ID');
    if (f.decision === 'duplicate' && !f.dupId.trim()) m.push('Original ticket ID');
    if (f.decision === 'defect' && f.repro === 'reproduced' && !f.reproDomain.trim()) m.push('Domain where it was reproduced');
    if (f.decision === 'info' && !f.infoItems.length) m.push('Information to request');
    if (f.decision === 'config' && !f.configSteps.trim() && f.configKind === 'config') m.push('Steps for the administrator');
    if (f.nextStep === 'custom' && !f.nextCustom.trim()) m.push('Next step');
    return m;
  }

  function mismatch() {
    const d = S.detected || {};
    if (!d.decision) return '';
    const mine = S.f.decision === 'config' ? (S.f.configKind === 'design' ? 'design' : 'config') : S.f.decision;
    const theirs = d.decision === 'config' ? (d.configKind === 'design' ? 'design' : 'config') : d.decision;
    if (mine === theirs) return '';
    return ({ defect: 'Confirmed defect', duplicate: 'Duplicate', info: 'More information needed', config: 'Configuration', design: 'Working as designed', cannot: 'Could not reproduce' })[theirs] || theirs;
  }

  function qagentPrompt() {
    const f = S.f;
    const draft = toText(compose({ technical: true }));
    const lang = f.language === 'es' ? 'Spanish' : 'English';
    let report = S.text || '';
    const max = 12000;
    const cut = report.length > max;
    if (cut) report = report.slice(0, max);
    const head = [];
    const id = String(f.id || '').replace(/\D/g, '');
    const url = id ? (f.adoBase ? `${f.adoBase.replace(/\/+$/, '')}/_workitems/edit/${id}` : '#' + id) : '';
    const cmd = C.agentCommand();
    const linkOnCommand = !!(cmd && url && f.adoBase && (C.agentDef(cmd) || {}).takesWorkItem);
    if (cmd) head.push(linkOnCommand ? `${cmd} ${url}` : cmd);
    if (f.platform) head.push(`Platform: ${f.platform}`);
    if (url && !linkOnCommand) head.push(`Work item: ${url}`);
    const fileText = C.fileRequestText();
    return `${head.join('\n')}${head.length ? '\n\n' : ''}Improve the Azure DevOps comment below, written for the support case owner of this ticket.

Rules:
- Keep the structure, the decision, the next step and every fact. Do not add facts that are not in the analysis or the ticket.
- Make the support part plain language: no code, file names, tables or procedure names. Keep those only in the technical part.
- Keep every @mention and the CC line exactly as written.
- Write in ${lang}. Return only the comment, ready to paste.

${report ? `Analysis exported from QAgent${cut ? ' (first part)' : ''}:\n"""\n${report}\n"""\n\n` : ''}Draft comment:
"""
${draft}
"""

${C.D.guardrail || ''}${fileText ? '\n\n' + fileText : ''}`.trim();
  }

  /* ------------------------------------------------------------------ */
  /* Copying                                                             */
  /* ------------------------------------------------------------------ */
  async function copyRich(html, text) {
    try {
      if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
        return true;
      }
    } catch (e) { /* fall back below */ }
    try {
      const box = document.createElement('div');
      box.contentEditable = 'true';
      box.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      box.innerHTML = html;
      document.body.appendChild(box);
      const range = document.createRange();
      range.selectNodeContents(box);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
      const ok = document.execCommand('copy');
      sel.removeAllRanges(); box.remove();
      if (ok) return true;
    } catch (e) { /* fall back to text */ }
    return C.copyText(text);
  }

  async function doCopy(kind, btn) {
    const f = S.f;
    let ok;
    if (kind === 'qagent') {
      ok = await C.copyText(qagentPrompt());
    } else {
      const doc = compose({ technical: kind !== 'support' });
      ok = kind === 'plain' ? await C.copyText(toText(doc)) : await copyRich(toHTML(doc), toText(doc));
    }
    if (!ok) { C.toast('Copy was blocked. Select the preview and copy it manually.', 'warn'); return; }
    C.flashButton(btn, 'Copied');
    C.track('comment', null, { platform: f.platform || null, meta: { decision: f.decision === 'config' ? (f.configKind === 'design' ? 'design' : 'config') : f.decision, model: Number(f.model), language: f.language, technical: kind !== 'support' && f.secTechnical, via: kind === 'qagent' ? 'qagent' : kind, agent: kind === 'qagent' ? C.agentCommand() : '', file: kind === 'qagent' ? (C.state.settings.fileOut || '') : '' } });
    const miss = missing();
    if (kind === 'qagent') C.toast('Prompt copied. Paste it into QAgent, then copy its answer into ADO.');
    else if (miss.length) C.toast(`Copied, but still empty: ${miss.join(', ')}.`, 'warn');
    else C.toast('Comment copied. In ADO, retype @ before each name and pick the person so they are notified.');
    saveLast();
  }

  /* ------------------------------------------------------------------ */
  /* Preferences, presets and people                                     */
  /* ------------------------------------------------------------------ */
  let saveTimer = null;
  async function savePrefs() {
    try { await C.api('PUT', '/api/me/prefs/comment', { data: S.prefs }); } catch (e) { C.toast('Your preferences could not be saved: ' + e.message, 'warn'); }
  }
  function saveLast() {
    S.prefs.last = snapshot();
    S.prefs.signature = S.f.signature;
    S.prefs.adoBase = S.f.adoBase;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(savePrefs, 800);
  }

  async function loadData() {
    const [contacts, prefs] = await Promise.all([
      C.api('GET', '/api/contacts').catch(() => ({ team: [], mine: [], canEditTeam: false })),
      C.api('GET', '/api/me/prefs/comment').catch(() => ({ data: {} }))
    ]);
    S.contacts = contacts;
    S.prefs = Object.assign({ presets: [], defaultCc: [] }, prefs.data || {});
    S.f = blankForm();
    if (S.prefs.last) applySnapshot(S.prefs.last);
    S.f.signature = S.prefs.signature != null ? S.prefs.signature : defaultSignature();
    S.f.adoBase = S.prefs.adoBase || DEFAULT_BASE;
    (S.prefs.defaultCc || []).forEach((n) => { if (!S.f.cc.includes(n)) S.f.cc.push(n); });
    S.f.id = C.varValue('WORK_ITEM_ID');
    S.f.platform = C.varValue('PLATFORM');
    S.loaded = true;
  }
  function defaultSignature() {
    const u = C.state.user || {};
    if (!u.name) return '';
    return [u.name, [u.area, u.team].filter(Boolean).join(', ')].filter(Boolean).join('\n');
  }
  const allNames = () => {
    const names = [...S.contacts.mine, ...S.contacts.team].map((c) => c.name);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  };
  const known = (name) => allNames().some((n) => n.toLowerCase() === String(name || '').replace(/^@+/, '').trim().toLowerCase());

  async function addContact(body) {
    const out = await C.api('POST', '/api/contacts', body);
    (out.scope === 'team' ? S.contacts.team : S.contacts.mine).push(out.contact);
    return out.contact;
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */
  async function render(ctx) {
    C = ctx;
    C.setView('<div class="cg-loading muted">Loading your people and preferences…</div>', 'Ticket comment');
    if (!S.loaded || !S.f) {
      try { await loadData(); } catch (e) { C.setView(`<div class="empty"><h2>Could not open the comment generator</h2><p>${C.esc(e.message)}</p></div>`, 'Ticket comment'); return; }
    }
    shell();
    paintAll();
  }

  function shell() {
    C.setView(`
      <div class="page-head">
        <div>
          <h1>Ticket comment</h1>
          <p>Add the analysis QAgent exported (PDF or Word). The hub finds the ticket details and findings and writes the comment for the ticket owner in Azure DevOps. The file is read in your browser and never uploaded.</p>
        </div>
        <div class="cg-presets" id="cgPresets"></div>
      </div>
      <div class="cg-layout">
        <form class="cg-form" id="cgForm" novalidate autocomplete="off"></form>
        <aside class="cg-preview" id="cgPreview" aria-label="Comment preview"></aside>
      </div>`, 'Ticket comment');
  }

  function paintAll() {
    if (!document.getElementById('cgForm')) return;
    paintPresets();
    paintForm();
    paintPreview();
  }

  function paintPresets() {
    const el = document.getElementById('cgPresets');
    if (!el) return;
    const ps = S.prefs.presets || [];
    el.innerHTML = `
      <label class="af"><span>Start from a preset</span>
        <select data-cg="preset"><option value="">Choose a preset</option>${ps.map((p, i) => `<option value="${i}">${C.esc(p.name)}</option>`).join('')}</select>
      </label>
      <button type="button" class="btn btn-sm" data-act="cg-save-preset">${C.icon('plus', 'i-sm')}<span>Save as preset</span></button>
      ${ps.length ? `<button type="button" class="btn btn-sm btn-ghost" data-act="cg-manage-presets">Manage presets</button>` : ''}
      <button type="button" class="btn btn-sm btn-ghost" data-act="cg-reset">${C.icon('x', 'i-sm')}<span>New comment</span></button>`;
  }

  const fld = (key, label, input, opts) => `<div class="field" data-key="${key}"><label for="cg_${key}">${C.esc(label)}${opts && opts.optional ? '<span class="opt">optional</span>' : ''}</label>${input}${opts && opts.help ? `<p class="help">${opts.help}</p>` : ''}</div>`;
  const txt = (key, ph) => `<input id="cg_${key}" data-cg="${key}" type="text" value="${C.esc(S.f[key])}" placeholder="${C.esc(ph || '')}">`;
  const area = (key, rows, ph) => `<textarea id="cg_${key}" data-cg="${key}" rows="${rows}" placeholder="${C.esc(ph || '')}">${C.esc(S.f[key])}</textarea>`;
  const sel = (key, options) => `<select id="cg_${key}" data-cg="${key}">${options.map(([v, l]) => `<option value="${C.esc(v)}" ${String(S.f[key]) === String(v) ? 'selected' : ''}>${C.esc(l)}</option>`).join('')}</select>`;
  const chk = (key, label, sub) => `<label class="switch"><input type="checkbox" data-cg="${key}" ${S.f[key] ? 'checked' : ''}><span><b>${C.esc(label)}</b>${sub ? `<small>${C.esc(sub)}</small>` : ''}</span></label>`;

  function paintForm() {
    const form = document.getElementById('cgForm');
    if (!form) return;
    const f = S.f;
    const d = S.detected || {};
    const found = [['id', 'Work item'], ['title', 'Title'], ['partner', 'Partner'], ['caseRef', 'Case'], ['verdict', 'Verdict'], ['summary', 'Summary'], ['rootCause', 'Root cause'], ['files', 'Files'], ['fixes', 'Fix']];
    const names = allNames();
    const scroll = window.scrollY;
    const focusId = document.activeElement && document.activeElement.id;

    form.innerHTML = `
      <datalist id="cgPeople">${names.map((n) => `<option value="${C.esc(n)}">`).join('')}</datalist>

      <section class="cg-step" aria-labelledby="cgS1">
        <h2 id="cgS1"><span class="cg-n">1</span>QAgent report</h2>
        <label class="cg-drop ${S.busy ? 'is-busy' : ''}" id="cgDrop">
          <input type="file" id="cgFile" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
          ${C.icon('upload')}
          <span>${S.busy ? 'Reading the report…' : S.file ? `<b>${C.esc(S.file.name)}</b> ${S.file.pages ? `· ${S.file.pages} pages` : ''} · Choose another file` : '<b>Drop the PDF or Word file here</b> or select it'}</span>
        </label>
        ${S.error ? `<p class="form-error" role="alert">${C.esc(S.error)}</p>` : ''}
        ${S.file && !S.busy ? `<div class="cg-found"><span class="muted">Found in the report:</span>${found.map(([k, l]) => `<span class="cg-chip ${d[k] ? 'ok' : ''}">${d[k] ? C.icon('check', 'i-sm') : ''}${l}</span>`).join('')}</div>` : ''}
        ${S.phi.length ? `<p class="callout">${C.icon('shield')}<span>Possible PHI in the report: ${S.phi.map((p) => `${p.count} ${p.label.toLowerCase()}`).join(', ')}. Make sure none of it ends up in the comment.</span></p>` : ''}
        <p class="help">Without a file you can fill in the fields below by hand.</p>
      </section>

      <section class="cg-step" aria-labelledby="cgS2">
        <h2 id="cgS2"><span class="cg-n">2</span>Ticket</h2>
        <div class="two">
          ${fld('id', 'Work item ID', txt('id', '308614'))}
          ${fld('platform', 'Platform', sel('platform', [['', 'Choose']].concat(C.D.platforms.map((p) => [p.name, p.name]))))}
        </div>
        ${fld('title', 'Title', txt('title', 'Inactive employees showing in Admin Logging'))}
        <div class="two">
          ${fld('partner', 'Partner', txt('partner', 'SBMH'), { optional: true })}
          ${fld('caseRef', 'Case or CRM', txt('caseRef', 'Case 00575035, TECH-042566'), { optional: true })}
        </div>
        ${fld('adoBase', 'Azure DevOps project URL', txt('adoBase', DEFAULT_BASE), { help: 'Used to turn ticket numbers into links. Saved for next time.' })}
      </section>

      <section class="cg-step" aria-labelledby="cgS3">
        <h2 id="cgS3"><span class="cg-n">3</span>People</h2>
        ${fld('owner', 'Ticket owner', `<input id="cg_owner" data-cg="owner" type="text" list="cgPeople" value="${C.esc(f.owner)}" placeholder="Start typing a name">`,
          { help: f.owner && !known(f.owner) ? `<button type="button" class="link" data-act="cg-add-owner">Add ${C.esc(f.owner.replace(/^@+/, ''))} to my people</button>` : '' })}
        <div class="field">
          <label for="cg_ccInput">Copy (CC)</label>
          <div class="cg-chips">${f.cc.map((n, i) => `<span class="cg-person">@${C.esc(n)}<button type="button" class="icon-btn sm" data-act="cg-cc-remove" data-i="${i}" aria-label="Remove ${C.esc(n)} from CC">${C.icon('x', 'i-sm')}</button></span>`).join('') || '<span class="muted">Nobody in copy</span>'}</div>
          <div class="cg-row"><input id="cg_ccInput" type="text" list="cgPeople" placeholder="Add a person to CC"><button type="button" class="btn btn-sm" data-act="cg-cc-add">Add</button></div>
        </div>
        <div class="cg-row">
          <button type="button" class="btn btn-sm btn-ghost" data-act="cg-people">${C.icon('users', 'i-sm')}<span>Manage people (${names.length})</span></button>
        </div>
        ${fld('greeting', 'Greeting', sel('greeting', [['hi', `Hi @Owner,`], ['mention', '@Owner'], ['none', 'No greeting']]))}
        ${fld('signature', 'Signature', area('signature', 2, 'Your name\nRole, team'), { optional: true, help: 'Saved for next time.' })}
      </section>

      <section class="cg-step" aria-labelledby="cgS4">
        <h2 id="cgS4"><span class="cg-n">4</span>Decision</h2>
        <div class="cg-decisions" role="radiogroup" aria-label="Decision">
          ${DECISIONS.map(([v, l]) => `<label class="cg-radio ${f.decision === v ? 'on' : ''}"><input type="radio" name="cgDecision" data-cg="decision" value="${v}" ${f.decision === v ? 'checked' : ''}><span>${C.esc(l)}</span></label>`).join('')}
        </div>
        ${d.verdict ? `<p class="help">The report says: <b>${C.esc(d.verdict)}</b></p>` : ''}
        ${decisionFields()}
        <div class="two">
          ${fld('nextStep', 'Next step in ADO', sel('nextStep', NEXT_STEPS.map((k) => [k, NEXT_LABELS[k]])))}
          ${f.nextStep === 'custom' ? fld('nextCustom', 'Your next step', txt('nextCustom', 'Waiting for the partner’s confirmation')) : ''}
        </div>
      </section>

      <section class="cg-step" aria-labelledby="cgS5">
        <h2 id="cgS5"><span class="cg-n">5</span>Content</h2>
        <p class="help">Filled in from the report when possible. Edit anything; the preview updates as you type.</p>
        ${fld('summary', 'In short (plain language for Support)', area('summary', 3, 'Renaming a Custom Lookup Category saves the wrong employee in Admin Logging.'))}
        ${fld('whatNot', 'What it is not', area('whatNot', 2, 'Not caused by the partner’s setup. No setting fixes it.'), { optional: true, help: 'One statement per line.' })}
        ${chk('secPartner', 'Include "Tell the partner"')}
        ${f.secPartner ? fld('tellPartner', 'Tell the partner', area('tellPartner', 2, 'Category renames in the Admin Log are unreliable until the fix is released.')) : ''}
        ${chk('secWorkaround', 'Include the workaround')}
        ${f.secWorkaround ? fld('workaround', 'Workaround', area('workaround', 2, 'Leave empty to say there is no workaround yet.'), { optional: true }) : ''}
        ${chk('secTechnical', 'Include technical details for Dev and QA')}
        ${f.secTechnical ? `
          ${fld('rootCause', 'Root cause', area('rootCause', 4, 'psp_lookupcategory_update has no @emp_id parameter...'))}
          ${fld('files', 'Files involved', area('files', 3, 'One file per line'), { optional: true })}
          ${chk('secFix', 'Include the proposed fix')}
          ${f.secFix ? fld('fixes', 'Proposed fix', area('fixes', 3, 'One change per line'), { optional: true }) : ''}
          ${fld('verification', 'Verification', txt('verification', 'Read-only SQL in section 4 of the attached analysis.'), { optional: true })}` : ''}
        ${chk('attach', 'Mention the attached analysis', f.attachName ? f.attachName : 'Add a file to fill in its name')}
      </section>

      <section class="cg-step" aria-labelledby="cgS6">
        <h2 id="cgS6"><span class="cg-n">6</span>Format</h2>
        <div class="two">
          ${fld('model', 'Structure', sel('model', MODELS.map(([v, l]) => [v, `Model ${v}: ${l}`])))}
          ${fld('language', 'Language', sel('language', [['en', 'English'], ['es', 'Spanish']]), { help: f.language === 'es' ? 'Labels change to Spanish. Text taken from the report stays as written; Improve with QAgent can translate it.' : '' })}
        </div>
        <div class="cg-sub">
          <p class="field-label">For "Improve with QAgent"</p>
          <p class="help">Shared with the Options of every prompt. Here they only shape the prompt that "Improve with QAgent" copies; the comment itself does not change.</p>
          ${C.agentFieldHTML('cg')}
          ${C.fileFieldHTML()}
        </div>
      </section>`;
    window.scrollTo(0, scroll);
    if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus({ preventScroll: true }); if (el.setSelectionRange && typeof el.value === 'string') { try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* ignore */ } } } }
  }

  function decisionFields() {
    const f = S.f;
    const lang = INFO_LABELS[f.language] || INFO_LABELS.en;
    switch (f.decision) {
      case 'duplicate':
        return `<div class="cg-sub">
          <div class="two">${fld('dupId', 'Original ticket ID', txt('dupId', '301538'))}${fld('dupReason', 'Why it is a duplicate', sel('dupReason', [['cause', 'Same root cause'], ['steps', 'Same steps and result'], ['both', 'Both']]))}</div>
          ${fld('dupTitle', 'Original ticket title', txt('dupTitle', ''), { optional: true })}</div>`;
      case 'info':
        return `<div class="cg-sub"><p class="field-label">Ask the reporter for</p>
          <div class="cg-checks">${INFO_ITEMS.map(([k]) => `<label class="cg-check"><input type="checkbox" data-cg-info="${k}" ${f.infoItems.includes(k) ? 'checked' : ''}><span>${C.esc(INFO_LABELS.en[k])}</span></label>`).join('')}</div>
          ${fld('holdDays', 'Business days on hold before closing', `<input id="cg_holdDays" data-cg="holdDays" type="number" min="1" max="30" value="${C.esc(f.holdDays)}">`)}
          ${lang ? '' : ''}</div>`;
      case 'config':
        return `<div class="cg-sub">
          ${fld('configKind', 'What it is', sel('configKind', [['config', 'Configuration (a setting or permission)'], ['design', 'Working as designed']]))}
          ${fld('configSteps', 'Steps for the administrator', area('configSteps', 3, 'One step per line'), { optional: f.configKind === 'design' })}
          ${chk('relogin', 'Users must sign out and back in after the change')}</div>`;
      case 'cannot':
        return `<div class="cg-sub">
          <div class="two">${fld('cannotDomain', 'Domain where we tried', txt('cannotDomain', 'QA domain'))}${fld('cannotRole', 'User role', txt('cannotRole', 'Clinician'), { optional: true })}</div>
          ${fld('cannotTried', 'What we tried', area('cannotTried', 2, 'Saved a Telehealth note with the same service type'), { optional: true })}</div>`;
      default:
        return `<div class="cg-sub">
          <div class="two">${fld('confidence', 'Confidence', sel('confidence', [['', 'Not stated'], ['High', 'High'], ['Medium', 'Medium'], ['Low', 'Low']]))}
          ${fld('repro', 'Reproduction', sel('repro', [['code', 'Code analysis only'], ['reproduced', 'Reproduced'], ['pending', 'QA will reproduce it']]))}</div>
          ${f.repro !== 'code' ? `<div class="two">${fld('reproDomain', 'Domain', txt('reproDomain', 'SBMH QA domain'))}${f.repro === 'reproduced' ? fld('reproDate', 'Date', `<input id="cg_reproDate" data-cg="reproDate" type="date" value="${C.esc(f.reproDate)}">`) : ''}</div>` : ''}
          ${f.repro === 'reproduced' ? `${fld('reproRole', 'User role', txt('reproRole', 'Administrator'), { optional: true })}${fld('reproSteps', 'Steps used', area('reproSteps', 3, 'One step per line'), { optional: true })}` : ''}</div>`;
    }
  }

  function paintPreview() {
    const el = document.getElementById('cgPreview');
    if (!el) return;
    const doc = compose({ technical: true });
    const html = toHTML(doc);
    const text = toText(doc);
    const miss = missing();
    const phiOut = phiFindings(text);
    const words = text.split(/\s+/).filter(Boolean).length;
    el.innerHTML = `
      <div class="cg-preview-head">
        <h2>Comment</h2>
        <div class="segmented" role="group" aria-label="Preview mode">
          <button type="button" data-act="cg-view" data-view="rich" aria-pressed="${S.view === 'rich'}">Formatted</button>
          <button type="button" data-act="cg-view" data-view="plain" aria-pressed="${S.view === 'plain'}">Plain text</button>
        </div>
      </div>
      ${miss.length ? `<p class="cg-status warn">Still empty: ${C.esc(miss.join(', '))}</p>` : '<p class="cg-status ok">Ready to paste</p>'}
      ${mismatch() ? `<p class="cg-status warn">The report's verdict is "${C.esc(mismatch())}". Check that "In short", "What it is not" and "Tell the partner" match the decision you chose.</p>` : ''}
      ${phiOut.length ? `<p class="callout">${C.icon('shield')}<span>The comment may contain PHI: ${phiOut.map((p) => `${p.count} ${p.label.toLowerCase()}`).join(', ')}. Remove it before copying.</span></p>` : ''}
      <div class="cg-paper ${S.view === 'plain' ? 'plain' : ''}">${S.view === 'plain' ? `<pre>${C.esc(text)}</pre>` : html}</div>
      <div class="cg-actions">
        <button type="button" class="btn btn-primary" data-act="cg-copy" data-kind="rich">${C.icon('copy')}<span>Copy comment</span></button>
        <button type="button" class="btn" data-act="cg-copy" data-kind="plain">${C.icon('copy', 'i-sm')}<span>Copy as plain text</span></button>
        <button type="button" class="btn" data-act="cg-copy" data-kind="support">${C.icon('copy', 'i-sm')}<span>Copy Support part only</span></button>
        <button type="button" class="btn btn-ghost" data-act="cg-copy" data-kind="qagent" title="Copies a prompt that asks QAgent to polish this draft">${C.icon('message', 'i-sm')}<span>Improve with QAgent</span></button>
      </div>
      <p class="cg-note">${C.icon('info', 'i-sm')}<span>ADO notifies only the people you pick from its list. After pasting, retype <b>@</b> before each name and choose the person.</span></p>
      <p class="muted cg-words">${words} words</p>`;
  }

  /* ------------------------------------------------------------------ */
  /* Modals                                                              */
  /* ------------------------------------------------------------------ */
  function peopleModal() {
    const c = S.contacts;
    const dcc = new Set(S.prefs.defaultCc || []);
    const row = (p, scope) => `<li class="cg-prow">
      <span><b>${C.esc(p.name)}</b>${p.role ? `<small> · ${C.esc(p.role)}</small>` : ''}${p.email ? `<small> · ${C.esc(p.email)}</small>` : ''}</span>
      <label class="cg-check"><input type="checkbox" data-cg-defcc="${C.esc(p.name)}" ${dcc.has(p.name) ? 'checked' : ''}><span>Always CC</span></label>
      ${scope === 'mine' || c.canEditTeam ? `<button type="button" class="icon-btn sm" data-act="cg-del-person" data-id="${p.id}" data-scope="${scope}" aria-label="Remove ${C.esc(p.name)}">${C.icon('trash', 'i-sm')}</button>` : '<span></span>'}
    </li>`;
    C.openModal(`<h2 id="modalTitle">People for ticket comments</h2>
      <p class="muted">Pick owners and CC from these lists. "Always CC" adds the person to every new comment.</p>
      <form id="cgPersonForm" class="settings-form" novalidate>
        <div class="two">
          <div class="field"><label for="cgpName">Full name</label><input id="cgpName" name="name" placeholder="Brandon Tennyson" maxlength="80"></div>
          <div class="field"><label for="cgpRole">Role <span class="opt">optional</span></label><input id="cgpRole" name="role" placeholder="Support case owner" maxlength="80"></div>
        </div>
        <div class="two">
          <div class="field"><label for="cgpEmail">Email <span class="opt">optional</span></label><input id="cgpEmail" name="email" type="email" maxlength="160"></div>
          ${c.canEditTeam && !C.LOCAL ? `<div class="field"><label for="cgpScope">Add to</label><select id="cgpScope" name="scope"><option value="team">Team list (everyone sees it)</option><option value="mine">My list</option></select></div>` : '<div></div>'}
        </div>
        <p class="form-error" id="cgpError" role="alert" hidden></p>
        <div class="form-actions"><button class="btn btn-primary" type="submit">${C.icon('plus')}<span>Add person</span></button></div>
      </form>
      ${!C.LOCAL ? `<h3 class="cg-ph">Team list <span class="muted">· ${c.team.length}${c.canEditTeam ? '' : ', managed by the admin'}</span></h3>
      <ul class="cg-plist">${c.team.map((p) => row(p, 'team')).join('') || '<li class="muted">Nobody yet.</li>'}</ul>` : ''}
      <h3 class="cg-ph">My list <span class="muted">· ${c.mine.length}</span></h3>
      <ul class="cg-plist">${c.mine.map((p) => row(p, 'mine')).join('') || '<li class="muted">Nobody yet.</li>'}</ul>`, { wide: true });
  }

  function presetModal() {
    C.openModal(`<h2 id="modalTitle">Save as preset</h2>
      <p class="muted">Saves the decision, structure, language, sections, greeting, next step and CC, so you can start the next comment from it. Ticket details are not saved.</p>
      <form id="cgPresetForm" class="settings-form" novalidate>
        <div class="field"><label for="cgPresetName">Preset name</label><input id="cgPresetName" maxlength="60" placeholder="Duplicate, Sustainment"></div>
        <p class="form-error" id="cgPresetError" role="alert" hidden></p>
        <div class="form-actions"><button class="btn btn-primary" type="submit">${C.icon('check')}<span>Save preset</span></button></div>
      </form>`);
  }

  function managePresetsModal() {
    const ps = S.prefs.presets || [];
    C.openModal(`<h2 id="modalTitle">Presets</h2>
      <ul class="cg-plist">${ps.map((p, i) => `<li class="cg-prow"><span><b>${C.esc(p.name)}</b><small> · ${C.esc((DECISIONS.find((x) => x[0] === p.data.decision) || [])[1] || '')}, model ${C.esc(p.data.model)}</small></span><span></span>
        <button type="button" class="icon-btn sm" data-act="cg-del-preset" data-i="${i}" aria-label="Delete ${C.esc(p.name)}">${C.icon('trash', 'i-sm')}</button></li>`).join('') || '<li class="muted">No presets.</li>'}</ul>`);
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */
  const onPage = () => !!document.getElementById('cgForm');
  // Fields that show or hide other fields. Text fields are left out: redrawing on their change event would swallow a click on a button next to them.
  const STRUCTURAL = new Set(['decision', 'repro', 'nextStep', 'configKind', 'secPartner', 'secWorkaround', 'secTechnical', 'secFix', 'language']);

  function setField(key, value) {
    const f = S.f;
    if (key === 'model' || key === 'holdDays') value = Number(value) || (key === 'model' ? 5 : 5);
    f[key] = value;
    if (key === 'decision' && f.nextAuto) f.nextStep = DEFAULT_NEXT[value];
    if (key === 'nextStep') f.nextAuto = false;
    if (key === 'signature' || key === 'adoBase') saveLast();
  }

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!onPage() || !t.matches('[data-cg]') || t.type === 'checkbox' || t.type === 'radio' || t.tagName === 'SELECT') return;
    setField(t.dataset.cg, t.value);
    if (t.dataset.cg === 'owner') {
      // Show or hide the "add to my people" link without redrawing the field.
      const help = t.closest('.field').querySelector('.help');
      const need = t.value.trim() && !known(t.value);
      if (need && !help) t.insertAdjacentHTML('afterend', `<p class="help"><button type="button" class="link" data-act="cg-add-owner">Add ${C.esc(t.value.replace(/^@+/, ''))} to my people</button></p>`);
      else if (help && !need) help.remove();
      else if (help && need) help.innerHTML = `<button type="button" class="link" data-act="cg-add-owner">Add ${C.esc(t.value.replace(/^@+/, ''))} to my people</button>`;
    }
    paintPreview();
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!onPage()) return;
    if (t.id === 'cgFile' && t.files && t.files[0]) { readFile(t.files[0]); t.value = ''; return; }
    if (t.matches('[data-cg="preset"]')) {
      const p = (S.prefs.presets || [])[Number(t.value)];
      if (p) { applySnapshot(p.data); C.toast(`Preset "${p.name}" applied`); paintAll(); }
      return;
    }
    if (t.matches('[data-cg-info]')) {
      const k = t.dataset.cgInfo;
      S.f.infoItems = t.checked ? [...new Set([...S.f.infoItems, k])] : S.f.infoItems.filter((x) => x !== k);
      INFO_ITEMS.forEach(([key]) => { if (!S.f.infoItems.includes(key)) return; });
      S.f.infoItems = INFO_ITEMS.map(([key]) => key).filter((key) => S.f.infoItems.includes(key));
      return paintPreview();
    }
    if (t.matches('[data-cg-defcc]')) {
      const name = t.dataset.cgDefcc;
      const set = new Set(S.prefs.defaultCc || []);
      if (t.checked) { set.add(name); if (!S.f.cc.includes(name)) S.f.cc.push(name); } else set.delete(name);
      S.prefs.defaultCc = [...set];
      savePrefs();
      paintForm(); paintPreview();
      return;
    }
    if (!t.matches('[data-cg]')) return;
    const key = t.dataset.cg;
    const value = t.type === 'checkbox' ? t.checked : t.value;
    setField(key, value);
    if (t.type === 'checkbox' || t.type === 'radio' || t.tagName === 'SELECT' || STRUCTURAL.has(key)) paintForm();
    paintPreview();
  });

  // Drag and drop
  document.addEventListener('dragover', (e) => { const z = e.target.closest && e.target.closest('#cgDrop'); if (z) { e.preventDefault(); z.classList.add('is-over'); } });
  document.addEventListener('dragleave', (e) => { const z = e.target.closest && e.target.closest('#cgDrop'); if (z) z.classList.remove('is-over'); });
  document.addEventListener('drop', (e) => {
    const z = e.target.closest && e.target.closest('#cgDrop');
    if (!z) return;
    e.preventDefault();
    z.classList.remove('is-over');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) readFile(file);
  });

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act^="cg-"]');
    if (!el || !C) return;
    const act = el.dataset.act;
    switch (act) {
      case 'cg-copy': e.preventDefault(); doCopy(el.dataset.kind, el); break;
      case 'cg-view': S.view = el.dataset.view; paintPreview(); break;
      case 'cg-cc-add': {
        const input = document.getElementById('cg_ccInput');
        const name = String(input.value || '').replace(/^@+/, '').trim();
        if (!name) { input.focus(); return; }
        if (!known(name)) {
          try { await addContact({ name }); C.toast(`${name} added to your people`); } catch (err) { if (err.code !== 'exists') { C.toast(err.message, 'warn'); return; } }
        }
        if (!S.f.cc.includes(name)) S.f.cc.push(name);
        paintForm(); paintPreview();
        const again = document.getElementById('cg_ccInput'); if (again) again.focus();
        break;
      }
      case 'cg-cc-remove': S.f.cc.splice(Number(el.dataset.i), 1); paintForm(); paintPreview(); break;
      case 'cg-add-owner': {
        const name = S.f.owner.replace(/^@+/, '').trim();
        try { await addContact({ name }); S.f.owner = name; C.toast(`${name} added to your people`); paintForm(); paintPreview(); } catch (err) { C.toast(err.message, 'warn'); }
        break;
      }
      case 'cg-people': peopleModal(); break;
      case 'cg-del-person': {
        const id = Number(el.dataset.id);
        const list = el.dataset.scope === 'team' ? S.contacts.team : S.contacts.mine;
        const p = list.find((x) => x.id === id);
        if (!p || !window.confirm(`Remove ${p.name} from ${el.dataset.scope === 'team' ? 'the team list' : 'your list'}?`)) return;
        try {
          await C.api('DELETE', '/api/contacts/' + id);
          list.splice(list.indexOf(p), 1);
          peopleModal(); paintForm();
        } catch (err) { C.toast(err.message, 'warn'); }
        break;
      }
      case 'cg-save-preset': presetModal(); break;
      case 'cg-manage-presets': managePresetsModal(); break;
      case 'cg-del-preset': {
        S.prefs.presets.splice(Number(el.dataset.i), 1);
        await savePrefs();
        managePresetsModal(); paintPresets();
        break;
      }
      case 'cg-reset': {
        const keepCc = S.prefs.defaultCc || [];
        S.f = blankForm();
        if (S.prefs.last) applySnapshot(S.prefs.last);
        S.f.cc = keepCc.slice();
        S.f.signature = S.prefs.signature != null ? S.prefs.signature : defaultSignature();
        S.f.adoBase = S.prefs.adoBase || DEFAULT_BASE;
        S.file = null; S.blocks = []; S.text = ''; S.detected = {}; S.phi = []; S.error = '';
        paintAll();
        window.scrollTo(0, 0);
        break;
      }
      default: break;
    }
  });

  document.addEventListener('submit', async (e) => {
    const f = e.target;
    if (f.id === 'cgPersonForm') {
      e.preventDefault();
      const err = document.getElementById('cgpError');
      try {
        const contact = await addContact({ name: f.name.value, email: f.email.value, role: f.role.value, scope: f.scope ? f.scope.value : 'mine' });
        C.toast(`${contact.name} added`);
        peopleModal(); paintForm();
        const n = document.getElementById('cgpName'); if (n) n.focus();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    } else if (f.id === 'cgPresetForm') {
      e.preventDefault();
      const name = document.getElementById('cgPresetName').value.trim().slice(0, 60);
      const err = document.getElementById('cgPresetError');
      if (!name) { err.textContent = 'Give the preset a name.'; err.hidden = false; return; }
      const ps = S.prefs.presets || (S.prefs.presets = []);
      const i = ps.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
      const entry = { name, data: snapshot() };
      if (i >= 0) ps[i] = entry; else ps.push(entry);
      if (ps.length > 20) ps.shift();
      await savePrefs();
      C.closeModal();
      C.toast(`Preset "${name}" saved`);
      paintPresets();
    }
  });

  function reset() {
    Object.assign(S, { file: null, text: '', blocks: [], detected: {}, phi: [], busy: false, error: '', contacts: { team: [], mine: [], canEditTeam: false }, prefs: {}, loaded: false, f: null, view: 'rich' });
  }

  window.QPHComment = { render, reset, _test: { detect, compose: (o) => compose(o), toText, toHTML, phiFindings, state: S } };
})();

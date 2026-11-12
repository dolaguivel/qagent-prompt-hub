/* QAgent Prompt Hub — ticket comment generator.
 * Reads a QAgent report (PDF or Word) in the browser, detects the ticket
 * details and findings, and writes an Azure DevOps comment for the ticket
 * owner in one of six structures. Nothing from the file leaves the browser.
 * Rendered inside the app shell by app.js (route #/comment).
 */
(function () {
  'use strict';

  let C; // context from app.js
  const S = {
    auto: new Set(), found: new Set(), reverted: false, fromHeader: {}, decisionPending: false, undo: null,
    file: null, text: '', blocks: [], detected: {}, phi: [], busy: false, error: '',
    contacts: { team: [], mine: [], canEditTeam: false }, prefs: {}, loaded: false, f: null, view: 'rich'
  };

  /* ------------------------------------------------------------------ */
  /* Defaults and vocabulary                                             */
  /* ------------------------------------------------------------------ */
  const DEFAULT_BASE = 'https://dev.azure.com/CredibleBH/Sustainment';
  const MODELS = [
    [6, 'Root cause, solution, validation'],
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
    ['config', 'Configuration issue'],
    ['design', 'Working as designed'],
    ['cannot', 'Could not reproduce']
  ];
  const INFO_ITEMS = [
    ['domain', true], ['role', true], ['steps', true], ['expected', true], ['actual', true],
    ['screens', true], ['records', false], ['when', false], ['browser', false]
  ];
  const NEXT_STEPS = ['dev', 'qa', 'dup', 'hold', 'resolve', 'holdclose', 'custom'];
  // A configuration decision can be about configuration, security rights, data or the environment.
  const ISSUE_KINDS = [['', 'Configuration'], ['permissions', 'Permissions (security rights)'], ['data', 'Data'], ['environment', 'Environment']];
  const DEFAULT_NEXT = { defect: 'dev', duplicate: 'dup', info: 'hold', config: 'resolve', design: 'resolve', cannot: 'holdclose' };

  const T = {
    en: {
      hi: 'Hi', ownerPh: '[Ticket owner]', decision: 'Decision', reproducible: 'Reproducible', reproduction: 'Reproduction',
      forSupport: 'For Support', technical: 'Technical details (Dev and QA)', inShort: 'In short', whatNot: 'What it is not',
      tellPartner: 'Tell the partner', workaround: 'Workaround', yourAction: 'Your action', nextStep: 'Next step in ADO',
      whatHappening: 'What is happening', evidence: 'Evidence', rootCause: 'Root cause', files: 'Files involved', fix: 'Proposed fix',
      verification: 'Verification', attached: 'Full analysis attached', reviewOf: 'Review summary for', cc: 'CC:',
      decDefect: (c) => `Confirmed code defect${c ? ` (${c.toLowerCase()} confidence)` : ''}.`,
      decDuplicate: (id, t) => `Duplicate of ${id}${t ? ` – ${t}` : ''}.`,
      decInfo: 'We need more information to reproduce this issue.',
      decConfig: 'Not a code defect: the behavior comes from configuration.',
      decConfigKind: { permissions: 'Not a code defect: the behavior comes from the user’s security rights.', data: 'Not a code defect: the behavior comes from the data.', environment: 'Not a code defect: the behavior comes from the environment.' },
      setupYesKind: { permissions: 'Yes, it comes from the user’s security rights.', data: 'It comes from the data, not from the code or the partner’s settings.', environment: 'No, it comes from the environment (servers or hosting), not from the partner’s settings.' },
      actionKind: { data: 'Share the data correction above; it is done as described there.', environment: 'Share the steps above with the team that manages the environment.' },
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
      action: { defect: 'Update the partner. Nothing else is needed.', duplicate: 'Follow the original ticket; no further action on this one.', info: 'Send us the information listed above.', config: 'Share the steps above with the partner’s administrator.', design: 'Share the explanation and the options above with the partner.', cannot: 'Send us the details above if the issue happens again.' },
      next: { dev: 'Moving to Development.', qa: 'Keeping it open while QA reproduces it.', dup: 'Closing as Duplicate.', hold: 'On hold until we receive the information.', resolve: 'Resolving this ticket.', holdclose: 'On hold; it will be closed if there is no new information.' },
      situation: 'Situation', background: 'Background', assessment: 'Assessment', recommendation: 'Recommendation',
      reports: (p, t) => `${p || 'The partner'} reports: ${t || '[issue]'}.`,
      reviewed: (pl) => `We reviewed the ticket and the ${pl || 'platform'} code involved.`,
      qBug: 'Is it a bug?', qDup: 'Is it a duplicate?', qSetup: 'Is it the partner’s setup?', qRepro: 'Can it be reproduced?',
      qWork: 'Is there a workaround?', qTell: 'What do I tell the partner?', qNeed: 'What do you need from me?', qNext: 'What happens next?',
      yes: 'Yes.', no: 'No.', yesDefect: 'Yes, a confirmed code defect.', noBug: 'No.', setupYes: 'Yes, it comes from configuration.', setupNo: 'No.',
      tDecision: 'Decision', tDuplicate: 'Duplicate', tRepro: 'Reproducible', tWhat: 'What happens', tSetup: 'Caused by partner setup?',
      tWork: 'Workaround', tTell: 'Tell the partner', tEvidence: 'Evidence', tNext: 'Next step', nothing: 'Nothing else is needed.',
      evidenceAttached: (n) => `Analysis attached${n ? ` (${n})` : ''}`, code: 'Code',
      // Model 6: the team's "Root cause / Solution / Validation" format
      m6: {
        openKind: { permissions: 'This is a permissions issue.', data: 'This is a data issue.', environment: 'This is an environment issue.' },
        open: { defect: (c) => `This is a code defect${c ? ` (${c.toLowerCase()} confidence)` : ''}.`, duplicate: (id) => `This is a duplicate of ${id}.`, info: 'More information is needed to continue with this ticket.', config: 'This is a configuration issue.', design: 'This is working as designed.', cannot: 'We could not reproduce this issue.' },
        rootCause: 'Root Cause', expected: 'Expected Behavior', solution: 'Solution', validation: 'Validation', nextSteps: 'Next Steps',
        duplicateOf: 'Duplicate Of', checked: 'What We Checked', needed: 'Information Needed', tested: 'What We Tested', technical: 'Technical Details',
        devFix: 'The development team will fix this in the code.', proposedFix: 'Proposed fix:', files: 'Files involved:',
        workaround: 'Workaround:', tellPartner: 'Tell the partner:', original: 'Original ticket:', reason: 'Reason:',
        stepsUsed: 'Steps used:', suggested: 'Suggested Solution', techRootCause: 'Root Cause (Technical Explanation)',
        techExplanation: 'Technical explanation'
      }
    },
    es: {
      hi: 'Hola', ownerPh: '[Responsable del ticket]', decision: 'Decisión', reproducible: 'Reproducible', reproduction: 'Reproducción',
      forSupport: 'Para Soporte', technical: 'Detalle técnico (Dev y QA)', inShort: 'En resumen', whatNot: 'Lo que no es',
      tellPartner: 'Qué decirle al partner', workaround: 'Workaround', yourAction: 'Tu acción', nextStep: 'Siguiente paso en ADO',
      whatHappening: 'Qué está pasando', evidence: 'Evidencia', rootCause: 'Causa raíz', files: 'Archivos involucrados', fix: 'Fix propuesto',
      verification: 'Verificación', attached: 'Análisis completo adjunto', reviewOf: 'Resumen de la revisión de', cc: 'CC:',
      decDefect: (c) => `Defecto de código confirmado${c ? ` (confianza ${({ high: 'alta', medium: 'media', low: 'baja' })[c.toLowerCase()] || c})` : ''}.`,
      decDuplicate: (id, t) => `Duplicado de ${id}${t ? ` – ${t}` : ''}.`,
      decInfo: 'Necesitamos más información para reproducir este problema.',
      decConfig: 'No es un defecto de código: el comportamiento viene de la configuración.',
      decConfigKind: { permissions: 'No es un defecto de código: el comportamiento viene de los permisos del usuario.', data: 'No es un defecto de código: el comportamiento viene de los datos.', environment: 'No es un defecto de código: el comportamiento viene del entorno.' },
      setupYesKind: { permissions: 'Sí, viene de los permisos del usuario.', data: 'Viene de los datos, no del código ni de la configuración del partner.', environment: 'No, viene del entorno (servidores u hosting), no de la configuración del partner.' },
      actionKind: { data: 'Compartir la corrección de datos descrita arriba; se hace como se indica ahí.', environment: 'Compartir los pasos con el equipo que administra el entorno.' },
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
      action: { defect: 'Actualizar al partner. No se necesita nada más.', duplicate: 'Seguir el ticket original; no hay más acciones en este.', info: 'Enviarnos la información de la lista.', config: 'Compartir los pasos con el administrador del partner.', design: 'Compartir la explicación y las opciones con el partner.', cannot: 'Enviarnos los detalles si el problema vuelve a ocurrir.' },
      next: { dev: 'Pasa a Desarrollo.', qa: 'Queda abierto mientras QA lo reproduce.', dup: 'Se cierra como Duplicate.', hold: 'En espera hasta recibir la información.', resolve: 'Se resuelve este ticket.', holdclose: 'En espera; se cerrará si no hay información nueva.' },
      situation: 'Situación', background: 'Contexto', assessment: 'Evaluación', recommendation: 'Recomendación',
      reports: (p, t) => `${p || 'El partner'} reporta: ${t || '[problema]'}.`,
      reviewed: (pl) => `Revisamos el ticket y el código de ${pl || 'la plataforma'} involucrado.`,
      qBug: '¿Es un bug?', qDup: '¿Es un duplicado?', qSetup: '¿Es la configuración del partner?', qRepro: '¿Se puede reproducir?',
      qWork: '¿Hay workaround?', qTell: '¿Qué le digo al partner?', qNeed: '¿Qué necesitan de mí?', qNext: '¿Qué sigue?',
      yes: 'Sí.', no: 'No.', yesDefect: 'Sí, un defecto de código confirmado.', noBug: 'No.', setupYes: 'Sí, viene de la configuración.', setupNo: 'No.',
      tDecision: 'Decisión', tDuplicate: 'Duplicado', tRepro: 'Reproducible', tWhat: 'Qué pasa', tSetup: '¿Lo causa la configuración del partner?',
      tWork: 'Workaround', tTell: 'Qué decirle al partner', tEvidence: 'Evidencia', tNext: 'Siguiente paso', nothing: 'No se necesita nada más.',
      evidenceAttached: (n) => `Análisis adjunto${n ? ` (${n})` : ''}`, code: 'Código',
      m6: {
        openKind: { permissions: 'Es un problema de permisos.', data: 'Es un problema de datos.', environment: 'Es un problema del entorno.' },
        open: { defect: (c) => `Es un defecto de código${c ? ` (confianza ${({ high: 'alta', medium: 'media', low: 'baja' })[c.toLowerCase()] || c})` : ''}.`, duplicate: (id) => `Es un duplicado de ${id}.`, info: 'Necesitamos más información para continuar con este ticket.', config: 'Es un problema de configuración.', design: 'El sistema funciona según su diseño.', cannot: 'No pudimos reproducir este problema.' },
        rootCause: 'Causa raíz', expected: 'Comportamiento esperado', solution: 'Solución', validation: 'Validación', nextSteps: 'Siguientes pasos',
        duplicateOf: 'Duplicado de', checked: 'Lo que revisamos', needed: 'Información necesaria', tested: 'Lo que probamos', technical: 'Detalle técnico',
        devFix: 'El equipo de desarrollo lo corregirá en el código.', proposedFix: 'Fix propuesto:', files: 'Archivos involucrados:',
        workaround: 'Workaround:', tellPartner: 'Qué decirle al partner:', original: 'Ticket original:', reason: 'Motivo:',
        stepsUsed: 'Pasos usados:', suggested: 'Solución sugerida', techRootCause: 'Causa raíz (explicación técnica)',
        techExplanation: 'Explicación técnica'
      }
    }
  };
  const INFO_LABELS = {
    en: { domain: 'Domain and environment where it happens', role: 'User role or security profile', steps: 'Steps to reproduce, numbered, starting from login', expected: 'Expected result', actual: 'Actual result (exact error text or a screenshot)', screens: 'Screenshots or a short screen recording', records: 'Record IDs involved (no patient names)', when: 'When it started and how often it happens', browser: 'Browser and version' },
    es: { domain: 'Dominio y ambiente donde ocurre', role: 'Rol o perfil de seguridad del usuario', steps: 'Pasos para reproducirlo, numerados, desde el inicio de sesión', expected: 'Resultado esperado', actual: 'Resultado actual (texto exacto del error o una captura)', screens: 'Capturas de pantalla o un video corto', records: 'IDs de los registros involucrados (sin nombres de pacientes)', when: 'Cuándo empezó y con qué frecuencia ocurre', browser: 'Navegador y versión' }
  };
  // Quick inserts for recurring sentences. Text in [brackets] must be replaced before copying.
  const TEMPLATES = {
    en: {
      notRecent: 'This logic has been in place for a long time and has not been recently modified. No post-release change caused this behavior.',
      dba: 'If the partner wants [describe the result the partner wants], the data would need to be updated. Support can coordinate with the DBA team to assist with this update.',
      enhancement: 'If the partner wants [describe the behavior the partner wants], this would require a Product Idea / Enhancement Request for Product review.',
      adminSteps: 'If [describe what the partner wants], update the configuration:\n  Navigate to [describe the screen].\n  [describe the setting to change].\n  Click Save.\nAfter this change, [describe the result].',
      relogin: 'After the change, users must sign out and back in so the new settings load.'
    },
    es: {
      notRecent: 'Esta lógica existe desde hace tiempo y no se modificó recientemente. Ningún cambio de una versión reciente causó este comportamiento.',
      dba: 'Si el partner quiere [describe el resultado que quiere el partner], habría que actualizar los datos. Soporte puede coordinar con el equipo de DBA para hacer esta actualización.',
      enhancement: 'Si el partner quiere [describe el comportamiento que quiere el partner], se necesitaría un Product Idea / Enhancement Request para que Product lo revise.',
      adminSteps: 'Si [describe lo que quiere el partner], actualiza la configuración:\n  Ve a [describe la pantalla].\n  [describe el valor que hay que cambiar].\n  Haz clic en Save.\nDespués de este cambio, [describe el resultado].',
      relogin: 'Después del cambio, los usuarios deben cerrar sesión y volver a entrar para que se carguen los nuevos valores.'
    }
  };
  const TEMPLATE_LABELS = { notRecent: 'Not a recent change', dba: 'Data update with the DBA team', enhancement: 'Enhancement request', adminSteps: 'Steps for the administrator', relogin: 'Sign out and back in' };
  const PLACEHOLDER_RE = /\[describe\b[^\]]*\]/i;
  const RICH_HELP = 'One bullet per line. Start a line with two spaces to nest it under the bullet above. Put code between two lines with ```. Text pasted from an ADO comment keeps its bullets, nesting and code.';
  const NEXT_LABELS = { dev: 'Move to Development', qa: 'Keep open for QA to reproduce', dup: 'Close as Duplicate', hold: 'On hold until the information arrives', resolve: 'Resolve the ticket', holdclose: 'On hold; close if no new information', custom: 'Write my own' };

  function blankForm() {
    return {
      adoBase: DEFAULT_BASE, id: '', title: '', partner: '', caseRef: '', platform: '',
      owner: '', cc: [], greeting: 'cc', signature: '',
      decision: 'defect', confidence: '',
      repro: 'code', reproDomain: '', reproDate: '', reproRole: '', reproSteps: '',
      dupId: '', dupTitle: '', dupReason: 'cause', issueKind: '',
      infoItems: INFO_ITEMS.filter((x) => x[1]).map((x) => x[0]), holdDays: 5,
      cannotTried: '', cannotDomain: '', cannotRole: '',
      nextStep: 'dev', nextCustom: '', nextAuto: true,
      model: 6, language: 'en', secPartner: true, secWorkaround: true, secTechnical: true, secFix: true,
      attach: true, attachName: '',
      summary: '', whatNot: '', tellPartner: '', workaround: '', rootCause: '', files: '', fixes: '', verification: '',
      validation: '', solution: '', techDetail: '', infoExtra: ''
    };
  }
  // Settings a preset or the "last configuration" carries (not ticket content).
  // The ADO next step is only part of a preset: a step picked by hand belongs to
  // the comment being written, and a new comment starts from the decision's default.
  const SNAPSHOT_KEYS = ['greeting', 'decision', 'repro', 'dupReason', 'infoItems', 'holdDays', 'nextStep', 'nextCustom', 'nextAuto', 'model', 'language', 'secPartner', 'secWorkaround', 'secTechnical', 'secFix', 'attach', 'cc'];
  const NEXT_KEYS = ['nextStep', 'nextCustom', 'nextAuto'];
  const snapshotOf = (f, withNext) => {
    const o = {};
    SNAPSHOT_KEYS.forEach((k) => { if (withNext || !NEXT_KEYS.includes(k)) o[k] = Array.isArray(f[k]) ? f[k].slice() : f[k]; });
    return o;
  };
  const snapshot = () => snapshotOf(S.f, false);
  const decisionOf = (o) => (o && o.decision === 'config' && o.configKind === 'design' ? 'design' : o && o.decision);
  // Values come from storage, so each one is checked against the type of the form's default.
  // withNext: also take the next step (presets and the restored draft); the "last
  // configuration" never does, so a new comment starts from the decision's default.
  function applySnapshot(o, withNext, target) {
    const t = target || S.f;
    if (!o || typeof o !== 'object') return t;
    const defaults = blankForm();
    SNAPSHOT_KEYS.forEach((k) => {
      const v = o[k];
      if (v === undefined || (!withNext && NEXT_KEYS.includes(k))) return;
      if (Array.isArray(defaults[k])) { if (Array.isArray(v)) t[k] = v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()); return; }
      if (typeof v === typeof defaults[k]) t[k] = v;
    });
    // Presets saved before "Working as designed" became its own decision.
    t.decision = decisionOf(Object.assign({}, o, { decision: t.decision }));
    if (!DECISIONS.some((x) => x[0] === t.decision)) t.decision = 'defect';
    if (!MODELS.some((x) => x[0] === Number(t.model))) t.model = 6;
    if (!['en', 'es'].includes(t.language)) t.language = 'en';
    if (!['hi', 'mention', 'cc', 'none'].includes(t.greeting)) t.greeting = 'cc';
    if (!['code', 'reproduced', 'pending'].includes(t.repro)) t.repro = 'code';
    if (!['cause', 'steps', 'both'].includes(t.dupReason)) t.dupReason = 'cause';
    t.infoItems = t.infoItems.filter((k) => INFO_ITEMS.some((x) => x[0] === k));
    t.holdDays = Math.min(30, Math.max(1, Math.round(Number(t.holdDays) || 5)));
    if (!withNext || !NEXT_STEPS.includes(t.nextStep) || o.nextStep === undefined || t.nextAuto) { t.nextStep = DEFAULT_NEXT[t.decision]; t.nextAuto = true; t.nextCustom = ''; }
    return t;
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
  // Reads a PDF into blocks. `info.pages` gets the page count (the caller's own object, so a
  // file added meanwhile cannot receive it).
  async function pdfToBlocks(buf, info) {
    const lib = await loadPdfJs();
    const pdf = await lib.getDocument({ data: buf, isEvalSupported: false, disableFontFace: true }).promise;
    const lines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const ph = page.getViewport({ scale: 1 }).height;
      const tc = await page.getTextContent();
      let cur = null;
      const pageLines = [];
      const push = () => { if (cur) pageLines.push(cur); cur = null; };
      let space = false;
      for (const it of tc.items) {
        if (typeof it.str !== 'string') continue;
        // Spaces come as their own items; the gap is measured between the words around them.
        if (!it.str.trim()) { if (cur) space = true; if (it.hasEOL) { push(); space = false; } continue; }
        const y = it.transform[5];
        const x = it.transform[4];
        const h = Math.abs(it.transform[3]) || it.height || 10;
        if (cur && Math.abs(y - cur.y) > Math.max(cur.h, h) * 0.55) { push(); space = false; }
        if (!cur) cur = { page: p, ph, y, h, text: '', parts: [], endX: x, x };
        cur.parts.push({ str: it.str, gap: cur.parts.length ? x - cur.endX : 0, space, x });
        space = false;
        cur.h = Math.max(cur.h, h);
        cur.endX = x + (it.width || 0);
        if (it.hasEOL) push();
      }
      push();
      // Table cells: a wide gap whose next word starts where a wide gap starts on a nearby line
      // (a column). Justified prose has wide gaps too, but its words do not line up, and all the
      // gaps of a justified line are about as wide.
      const wideOf = (l) => Math.max(l.h, 8);
      const justified = (l) => { const g = l.parts.slice(1).map((q) => q.gap); return g.length >= 3 && Math.min(...g) > l.h * 0.15 && Math.max(...g) / Math.min(...g) < 1.5; };
      const starts = pageLines.map((l) => (justified(l) ? [] : l.parts.filter((q, k) => k && q.gap > wideOf(l)).map((q) => q.x)));
      const alignedWith = (js) => (x) => js.some((j) => (starts[j] || []).some((y) => Math.abs(x - y) < 2.5));
      // First the rows that line up with a row just above or below; then rows further away from a
      // known row (the row after a cell that wraps over several lines).
      const rowNear = pageLines.map((l, i) => starts[i].some(alignedWith([i - 2, i - 1, i + 1, i + 2])));
      pageLines.forEach((l, i) => {
        const rows = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5].map((dj) => i + dj).filter((j) => rowNear[j] || Math.abs(j - i) <= 2);
        const columns = alignedWith(rows);
        // A label cell ("Verdict", "Partner"…) followed by a wide gap is a cell too, even in a
        // one-row table or with centred values.
        const firstWide = l.parts.findIndex((q, k) => k && q.gap > wideOf(l));
        const labelCell = firstWide > 0 && !justified(l) && KNOWN_LABELS.test(l.parts.slice(0, firstWide).map((q) => q.str.trim()).join(' ').replace(/\s*:$/, ''));
        const aligned = (x) => columns(x) || (labelCell && x === l.parts[firstWide].x);
        l.text = l.parts.reduce((acc, q, k) => {
          if (!k) return q.str;
          const joint = q.gap > wideOf(l) && aligned(q.x) ? ' | ' : (q.space || q.gap > l.h * 0.15 || /\s$/.test(acc) || /^\s/.test(q.str)) ? ' ' : '';
          return joint ? acc.replace(/\s+$/, '') + joint + q.str.replace(/^\s+/, '') : acc + q.str;
        }, '').replace(/[\uE000-\uF8FF]/g, '');
        if (l.text.trim()) lines.push(l);
      });
    }
    if (info) info.pages = pdf.numPages;

    // Running headers and footers (in the top or bottom 10% of the page):
    // - the same short line on at least half of the pages, where only the page number may change;
    // - a browser's print header or footer (date and time, the page address, "1/1");
    // - "Page 2 of 5", "Confidential · Page 2".
    const zone = (l) => l.y > l.ph * 0.9 || l.y < l.ph * 0.1;
    const keyOf = (l) => l.text.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
    const byKey = new Map();
    lines.filter((l) => zone(l) && l.text.length < 120).forEach((l) => { const k = keyOf(l); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(l); });
    const repeated = (l) => {
      if (pdf.numPages < 2) return false;
      const group = byKey.get(keyOf(l)) || [];
      if (new Set(group.map((x) => x.page)).size < Math.max(2, Math.ceil(pdf.numPages / 2))) return false;
      // A sentence ("Click Save.") at the foot of several pages is content.
      if (/[.!?:]$/.test(l.text.trim()) && l.text.trim().split(/\s+/).length >= 2) return false;
      // Either the same text on every page, or the only change is the page number.
      return group.every((x) => x.text === group[0].text) || group.every((x) => new RegExp(`(?:^|\\D)${x.page}(?:\\D|$)`).test(x.text));
    };
    // (Browser print headers may draw ":" as an unmapped glyph, so it is optional.)
    const BROWSER_HEADER = /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4},?\s+\d{1,2}:?\d{2}(?::?\d{2})?(?:\s*[AP]\.?\s?M\.?)?(?=\s|$|\|)/i;
    const BROWSER_FOOTER = /^(?:(?:https?|file):\/\/\S+|about:blank)(?:\s*\|?\s*\d+\s*\/\s*\d+)?$|^\d+\s*\/\s*\d+$/i;
    const PAGE_MARK = /^(?:page\s+\d+(?:\s*(?:of|\/)\s*\d+)?|.{0,80}?\s[·|•—–]\s*page\s+\d+(?:\s*(?:of|\/)\s*\d+)?|.{0,80}?\bpage\s+\d+\s*(?:of|\/)\s*\d+)$/i;
    const running = (l) => zone(l) && (repeated(l) || BROWSER_HEADER.test(l.text.trim()) || BROWSER_FOOTER.test(l.text.trim()) || PAGE_MARK.test(l.text.trim()));

    // Body text size = the most common height among long lines.
    const sizes = {};
    lines.filter((l) => l.text.length > 40).forEach((l) => { const k = Math.round(l.h * 2) / 2; sizes[k] = (sizes[k] || 0) + 1; });
    const body = Number(Object.keys(sizes).sort((a, b) => sizes[b] - sizes[a])[0]) || 10;
    // The text column: where long lines start and end. A line that stops well before the right
    // edge and ends a sentence ended its paragraph or list item (list markers are often drawn,
    // not written as text). A line wrapped early because the next word is long (a path, inline
    // code) stops short too, but it does not end a sentence, so it stays in the paragraph.
    const pct = (arr, q) => { const a = arr.slice().sort((m, n) => m - n); return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : 0; };
    const longLines = lines.filter((l) => l.text.length > 40);
    const right = pct(longLines.map((l) => l.endX), 0.9);
    const left = pct(longLines.map((l) => l.x), 0.1);
    const endsShort = (l) => right > left && l.endX < right - (right - left) * 0.18 && /[.!?:]["'’”)\]]?\s*$/.test(l.text);
    const HYPHEN_JOIN = '\u0001';
    const blocks = [];
    let prev = null;
    for (const l of lines) {
      const text = l.text.replace(/­(?!$)/g, '').replace(/\s+/g, ' ').trim();
      if (/^\d+\s*\/\s*\d+$/.test(text) || /^page \d+( of \d+)?$/i.test(text) || running(l)) continue; // page numbers, headers, footers
      const heading = l.h >= body * 1.18 && text.length < 140;
      const bullet = /^([•·▪◦\-–*]|\d+[.)])\s+/.test(text);
      const gap = prev && prev.page === l.page ? prev.y - l.y : Infinity;
      const last = blocks[blocks.length - 1];
      const continues = last && !heading && !bullet && last.type !== 'heading' && prev && prev.page === l.page && gap > 0 && gap <= prev.h * 1.75 && Math.abs(prev.h - l.h) < 1 && !endsShort(prev);
      if (continues) {
        // A soft hyphen (U+00AD) is a typesetting break that disappears. A visible hyphen at the
        // end of a line is decided once the whole text is known (see below).
        const t = last.text;
        if (/­$/.test(t)) last.text = t.slice(0, -1) + text;
        else if (/\w[-‐]$/.test(t)) last.text = t.slice(0, -1) + '-' + HYPHEN_JOIN + text;
        else last.text = t + ' ' + text;
      }
      else if (heading && last && last.type === 'heading' && prev && prev.page === l.page && gap <= prev.h * 1.6) last.text += ' ' + text;
      // List markers are not kept: the comment makes its own bullets.
      else blocks.push({ type: heading ? 'heading' : bullet ? 'bullet' : 'para', text: bullet && !heading ? text.replace(/^(?:[•·▪◦\-–*]|\d+[.)])\s+/, '') : text, level: heading ? Math.round(l.h * 2) / 2 : 0 });
      prev = l;
    }
    // "multi-" + "program": the hyphen is part of the word ("multi-program") unless the document
    // writes the word without it elsewhere (an automatic hyphenation: "interna-" + "tional").
    const whole = blocks.map((x) => x.text).join('\n').replace(new RegExp(HYPHEN_JOIN, 'g'), '');
    const plain = new Set((whole.toLowerCase().match(/[a-zÀ-ɏ]+/g) || []));
    blocks.forEach((x) => {
      x.text = x.text.replace(/([A-Za-zÀ-ɏ]+)-\u0001([A-Za-zÀ-ɏ]+)/g, (m, a1, b1) => (plain.has((a1 + b1).toLowerCase()) ? a1 + b1 : `${a1}-${b1}`)).replace(/\u0001/g, '');
    });
    return blocks;
  }

  async function docxToBlocks(buf) {
    const mammoth = await loadMammoth();
    const out = await mammoth.convertToHtml({ arrayBuffer: buf }, { styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh"] });
    const doc = new DOMParser().parseFromString(`<div>${out.value}</div>`, 'text/html');
    const blocks = [];
    const walk = (node) => {
      for (const el of node.children) {
        const tag = el.tagName.toLowerCase();
        const text = el.textContent.replace(/\s+/g, ' ').trim();
        if (/^h[1-6]$/.test(tag)) { if (text) blocks.push({ type: 'heading', text, level: 7 - Number(tag[1]) }); }
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
  // Splits after . ! ? followed by a space and a new sentence, so file names
  // (lookup.asp), codes (V60.0) and decimals stay in one piece.
  // Abbreviations that do not end a sentence. "No." only counts before a number ("No. 308614").
  const keepsSentence = (prev, next) => /(?:^|\s)(?:e\.g|i\.e|vs|approx|cf|et al)\.$/i.test(prev)
    || /(?:^|\s)(?:Dr|Mr|Mrs|Ms|Fig|Ref|Dept|Ext)\.$/.test(prev)
    || (/(?:^|\s)(?:No|Nos|no|nos)\.$/.test(prev) && /^[\d#]/.test(next))
    // Initials: a lone "R." after "J.", or a name after two initials ("J. R. Smith").
    || (/(?:^|\s)[A-Z]\.$/.test(prev) && /^[A-Z]\.(?:\s|$)/.test(next))
    || /(?:^|\s)[A-Z]\. [A-Z]\.$/.test(prev);
  const sentences = (t) => {
    const parts = String(t || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z0-9"'“(\[@#])/);
    const out = [];
    for (const piece of parts) {
      if (out.length && keepsSentence(out[out.length - 1], piece)) out[out.length - 1] += ' ' + piece;
      else out.push(piece);
    }
    return out.map((x) => x.trim()).filter(Boolean);
  };
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  // Only a plain first word gets a capital: "cast to…" becomes "Cast to…", "psp_update…" and "lookup.asp…" stay.
  const capWord = (s) => (/^[a-z]+(?=[\s,;:)]|$)/.test(String(s || '')) ? cap(s) : s);
  const sectionAfter = (blocks, re) => {
    const i = blocks.findIndex((b) => b.type === 'heading' && re.test(b.text));
    if (i < 0) return null;
    const out = [];
    for (let j = i + 1; j < blocks.length && blocks[j].type !== 'heading'; j++) out.push(blocks[j]);
    return { heading: blocks[i], items: out };
  };

  /* What a QAgent report can tell us. Reports differ (PDF or Word, headings or
   * "Label: value" lines, tables, Markdown), so every value is looked for in
   * several ways and the work item number is chosen by context, not by the
   * first number that appears. */
  const HEAD_BLOCKS = 8; // the most the title area of a report can take
  const ID_PATTERNS = [
    [/_workitems\/edit\/(\d{4,8})\b/gi, 3],
    [/\b(?:work\s*item|wi)\s*(?:id|number|no\.?|#)?\s*[:#\-–—]?\s*#?\s*(\d{5,7})\b/gi, 3],
    [/\b(?:ADO|Azure\s*DevOps|DevOps)\s*(?:bug|item|ticket|work\s*item)?\s*(?:id|no\.?)?\s*[:#\-–—]?\s*#?\s*(\d{5,7})\b/gi, 2],
    [/\b(?:bug|pbi|defect|ticket|task|user\s*story|issue)\s*(?:id|no\.?|number)?\s*[:#\-–—]?\s*#?\s*(\d{5,7})\b/gi, 2],
    [/(?:^|[\s(\[])#(\d{5,7})\b/g, 1]
  ];
  // A number right after these words is another ticket (the original of a duplicate, the change
  // that introduced a regression, a related bug...), not the ticket the report is about.
  const RELATED_BEFORE = new RegExp('(?:' + [
    'duplicate[sd]?\\s+(?:of|by)', 'duplicates', 'dup\\s+of', 'same\\s+(?:issue\\s+|problem\\s+|bug\\s+|root\\s+cause\\s+|cause\\s+)?as',
    'original(?:\\s+(?:ticket|bug|item|work\\s*item))?(?:\\s+id)?', 'related(?:\\s+(?:to|ticket|bug|item|work\\s*items?))?', 'linked\\s+(?:to|ticket|bug|item|as)',
    'see(?:\\s+also)?', 'similar\\s+to', 'parent', 'child', 'regression\\s+(?:of|from|in)', '(?:re)?introduced\\s+(?:by|in|with)', 'caused\\s+by',
    'broken\\s+(?:by|in)', 'broke\\s+in', 'regressed\\s+(?:by|in)', '(?:fixed|resolved|addressed|covered|handled|tracked|reverted|superseded|replaced|blocked)\\s+(?:in|by)',
    'refers?\\s+to', 'reported\\s+(?:in|as)', 'already\\s+(?:reported|fixed|logged|tracked)\\s+(?:in|as)', 'follow\\s+(?:up\\s+)?(?:on|in)',
    'after', 'before', 'since', 'unlike', 'vs\\.?', 'versus', 'cloned\\s+from', 'split\\s+from', 'copy\\s+of', 'depends\\s+on', 'blocks'
  ].join('|') + ')\\s*[:(|]?\\s*(?:the\\s+)?(?:change\\s+(?:in|from)\\s+)?(?:ADO|bug|ticket|work\\s*item|item|pbi|story|task)?\\s*[:#\\-–—]?\\s*#?\\s*$', 'i');
  // "#250431" right after these words is an invoice, a claim, a client... not a work item.
  const NOT_TICKET_BEFORE = /\b(?:invoice|claim|order|client|service|case|authorization|auth|note|appointment|batch|po|line|row|account|employee|emp|staff|program|episode|record|bill|payment|check|receipt|encounter|visit|form|document|page|step|version|release|build|room|unit|item|lot)s?\s*$/i;
  // Sections that list other tickets.
  const RELATED_SECTION = /\b(?:related|linked|similar|previous|prior|other)\s+(?:work\s*items?|tickets?|bugs?|items?|issues?)\b|^(?:references?|see\s+also|history|links?)$/i;
  // Labels that end a title when they appear inside it. Strong ones always do ("… renames Partner: SBMH");
  // weak ones are common words in titles ("Client Status: Discharged…") and only count after a "|".
  const STRONG_INLINE = /\s+(?:\|\s*)?(?:Partner(?:\s+name)?|CRM|Case(?:\s*(?:ID|#|No\.?|Number))?|Customers?(?:\s+impacted)?|Platform|Area\s*Path|Iteration|Assigned\s+To|Reported\s+By|Work\s*item(?:\s*ID)?)\s*:/i;
  const WEAK_INLINE = /\s+\|\s*(?:Client|Product|Priority|Severity|State|Status|Created|Owner|Agency|Organization)\s*:/i;
  const KNOWN_LABELS = /^(work\s*item(?:\s*(?:id|title|#|number))?|wi|ado|bug|title|subject|partner(?:\s+name)?|customers?(?:\s+impacted)?|client|agency|organization|case(?:\s*(?:id|#|number))?|crm|platform|product|system|verdict|classification|decision|conclusion|determination|outcome|assessment|result|status|domain|environment|workaround|confidence|original\s+ticket|duplicate\s+of)$/i;
  // "Label: value" lines that describe the ticket (who, where, when, links), never prose for the comment.
  const META_LABELS = /^(?:work\s*item(?:\s*(?:id|title|#|number))?|wi|ado|bug|title|subject|partner(?:\s+name)?|customers?(?:\s+impacted)?|client|agency|organization|case(?:\s*(?:id|#|no\.?|number))?|crm|platform|product|system|application|domain|environment|tested\s+in|confidence|priority|severity|state|status|owner|assigned\s+to|reported\s+by|reporter|created|date|area\s*path|iteration|role|user\s+role|version|release|build|original(?:\s+(?:ticket|bug|item|work\s*item))?|duplicate\s+of|related(?:\s+(?:to|tickets?|bugs?|items?))?|links?|url|references?|see\s+also|customer\s+impact|impact)$/i;
  const isMetaLine = (t) => { const m = String(t || '').match(/^\s*([A-Za-z][A-Za-z #/.]{1,30}?)\s*:\s*\S/); return !!(m && META_LABELS.test(m[1].trim())); };
  const PLATFORMS = { credible: 'Credible', carelogic: 'CareLogic', insync: 'InSync' };
  const stripNumbering = (t) => String(t || '').replace(/^\s*(?:#{1,6}\s*|section\s+\d+[.:)]?\s*|\d+(?:\.\d+)*[.)]?\s+|[ivx]+[.)]\s+|[A-Z][.)]\s+)/i, '').replace(/[\s:–—-]+$/, '').trim();
  const cutAtLabel = (v) => {
    let t = String(v || '');
    const m = t.match(STRONG_INLINE) || t.match(WEAK_INLINE);
    // Only when something meaningful comes before it: "Client Status: …" stays whole.
    if (m && t.slice(0, m.index).trim().split(/\s+/).length >= 2) t = t.slice(0, m.index);
    return t.split(/\s+\|\s+/)[0].replace(/[\s|,;:—–-]+$/, '').trim();
  };
  // Markdown links from a report keep their address in view: "text (https://…)".
  const showLinks = (t) => String(t || '').replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) => (label.trim() === url ? url : `${label} (${url})`));

  // Turns a report into sections: { title, key, items: [{type, text}] }.
  // Section titles vary ("Root Cause", "2. Root cause (technical)", "Two-Sentence Ticket Summary"...).
  // The first match wins, so the more specific kinds come first.
  const SECTION_KEYS = [
    ['verdict', /^(?:(?:final|readiness|overall|qagent|our)\s+)?(?:verdict|classification|decision|conclusion|determination|outcome|bottom\s+line|assessment|result|status)$|^(?=[^?]*\b(?:design|defect|configuration|config|data|code|bug|expected)\b)[^?]*\bor\b[^?]*\?$/i],
    ['shouldNot', /\bshould\s+not\s+do\b|\bdo\s+not\s+do\b|\bwhat\s+not\s+to\s+do\b|^don'?t$/i],
    ['whatNot', /\bwhat\s+(?:it|this)\s+is\s+not\b|\bnot\s+the\s+cause\b|\bruled\s+out\b/i],
    ['partner', /\b(?:tell|inform)\s+the\s+(?:partner|customer|client)\b|\b(?:partner|customer|client)\s+(?:communication|message|update|response)\b|\bcustomer[\s-]facing\b|\bmessage\s+for\s+the\s+(?:partner|customer)\b/i],
    ['workaround', /\bworkarounds?\b/i],
    ['info', /\b(?:information|info|details|data)\s+(?:needed|required|missing|requested)\b|\bmissing\s+(?:information|info|details)\b|^(?:open\s+)?questions?\b|\bwhat\s+(?:we|i)\s+need\b/i],
    ['tested', /\bwhat\s+(?:we|i)\s+(?:tested|tried)\b|\bsteps?\s+(?:tried|taken)\b|\breproduction\s+attempts?\b|\battempts?\s+to\s+reproduce\b/i],
    ['steps', /\bsteps\s+to\s+reproduce\b|\breproduction(?:\s+steps)?$|\brepro(?:\s+steps)?$|\bhow\s+to\s+reproduce\b/i],
    ['rootCause', /\broot\s*causes?\b|\bthe\s+rule\s+that\s+produced\b|\bwhy\s+(?:the|this)\s+(?:outcome|result|behaviou?r)\b|\bwhat\s+(?:causes|produces)\s+(?:this|the)\b|^(?:the\s+)?cause$|\bwhy\s+(?:it|this)\s+happens\b|^(?:analysis|diagnosis|explanation)$|\bwhat\s+is\s+happening\b/i],
    ['solution', /\b(?:verdict|conclusion|classification)\s+and\s+(?:steps|options|solution|fix|next\s+steps|data\s+correction|correction|recommendations?)\b|\bsteps\s+for\s+(?:support|the\s+(?:partner|admin(?:istrator)?)|admins?)\b|\boptions\s+for\s+the\s+(?:partner|customer)\b|^(?:the\s+)?(?:(?:proposed|recommended|suggested|possible|required)\s+)?(?:fix(?:es)?|solution|resolution|remediation|recommendations?|corrective\s+actions?|actions?|next\s+steps?|how\s+to\s+(?:fix|resolve)(?:\s+it)?|what\s+to\s+do)$|\b(?:suggested|proposed|recommended)\s+(?:fix(?:es)?|solutions?|resolutions?|changes?)\b/i],
    ['validation', /^(?:validation|verification|testing|tests?\s+(?:performed|done|results?)|tested|how\s+(?:we|i|it\s+was)\s+(?:verified|tested)|evidence\s+of\s+testing)$/i],
    ['files', /^(?:files?(?:\s+(?:involved|reviewed|changed|affected))?|code\s+(?:references?|locations?|paths?)|where\s+in\s+the\s+code|source\s+files?)$/i],
    ['related', RELATED_SECTION],
    ['summary', /\b(?:summary|tl;?\s*dr|overview|in\s+short|short\s+answer|key\s+findings?)\b|^findings?$/i]
  ];
  const WEAK_VERDICT_LABEL = /^(?:result|status|outcome)$/i;
  // Sub-headings that belong to a section come in series: "Option A — …", "Change 2", "Step 3", "Layer 1".
  const SERIES = /^(?:option|alternative|approach|change|step|part|phase|layer|fix|scenario|method|path|case|variant)\s+(?:\d+|[A-Z]|[ivx]+)\b/i;
  const NOT_SUB = /\b(?:risks?|impact|notes?|appendix|references?|attachments?|sql|quer(?:y|ies)|evidence|logs?|screenshots?|timeline|history|background|context|scope|assumptions?|dependencies|conclusion|summary|questions?|testing|tests?|validation|verification|next\s+steps?|follow[\s-]?up|owners?|contacts?|glossary|metadata)\b/i;
  const SUB_SECTIONS = ['solution', 'rootCause', 'workaround', 'validation', 'info', 'tested', 'steps', 'partner', 'whatNot', 'shouldNot', 'files'];
  function buildSections(blocks) {
    const sections = [];
    let cur = null;
    blocks.forEach((b, i) => {
      // "Verdict: Code defect" (a heading or a paragraph) opens a section and carries its first item.
      const label = stripNumbering(b.text).match(/^([A-Za-z][A-Za-z ;'’/()-]{1,40}?)\s*:\s*(.*)$/);
      const labelKey = label ? (SECTION_KEYS.find(([, re]) => re.test(label[1].trim())) || [])[0] || '' : '';
      // "Result: error shown" inside reproduction steps is a step result, not the verdict.
      if (labelKey === 'verdict' && WEAK_VERDICT_LABEL.test(label[1].trim()) && cur && (['steps', 'tested', 'validation'].includes(cur.key) || /reproduc|\bsteps?\b|\btest|\btried\b|attempt|validat|verif/i.test(cur.title))) { cur.items.push(b); return; }
      if (labelKey) {
        cur = { title: label[1].trim(), key: labelKey, index: i, items: [], inline: true };
        sections.push(cur);
        if (label[2].trim()) cur.items.push({ type: 'para', text: label[2].trim(), inline: true });
        return;
      }
      // Another "Label: value" line ends a section that a label opened ("Tell the partner: …" then "Customer impact: …").
      if (label && cur && cur.inline && /^[A-Z]/.test(label[1]) && label[2].trim()) {
        cur = { title: label[1].trim(), key: '', index: i, items: [{ type: 'para', text: label[2].trim(), inline: true }], inline: true };
        sections.push(cur);
        return;
      }
      if (b.type === 'heading') {
        const title = stripNumbering(b.text);
        const key = (SECTION_KEYS.find(([, re]) => re.test(title)) || [])[0] || '';
        // A sub-heading stays in its section ("Solution" > "Option A — …", "Change 1", "Change 2"):
        // it is smaller than the section's heading, or the section has no text yet, or it repeats
        // the first word of the section's first sub-heading.
        if (!key && cur && cur.key && SUB_SECTIONS.includes(cur.key) && !cur.inline && cur.index > 0 && !NOT_SUB.test(title)) {
          const first = title.toLowerCase().split(/\s+/)[0];
          const series = SERIES.test(title);
          const smaller = b.level && cur.level && b.level < cur.level - 0.4;
          if (!cur.items.length || (smaller && series) || (cur.sub && cur.sub === first && series)) {
            cur.items.push(Object.assign({}, b, { type: 'heading', sub: true }));
            if (!cur.sub) cur.sub = first;
            return;
          }
        }
        cur = { title, key, index: i, items: [], level: b.level || 0 };
        sections.push(cur);
        return;
      }
      if (cur) cur.items.push(b);
    });
    return sections;
  }

  // SQL and other code from the report never goes into the comment: the comment points to the attached analysis.
  const SQL_START = /^\s*(?:SELECT|UPDATE|DELETE|INSERT|MERGE|EXEC(?:UTE)?|DECLARE|SET|FROM|WHERE|AND|OR|JOIN|INNER|LEFT|RIGHT|FULL|OUTER|CROSS|ON|ORDER\s+BY|GROUP\s+BY|HAVING|UNION|VALUES|INTO|BEGIN|END|IF|ELSE|CREATE|ALTER|DROP|TRUNCATE|RETURN|WITH|CASE|WHEN|THEN|GO|USE|PRINT|OPEN|FETCH|CLOSE|DEALLOCATE|WHILE|COMMIT|ROLLBACK|TOP|AS|OUTPUT|RAISERROR|THROW)\b/;
  const SQL_INLINE = /\b(?:SELECT\s+(?:DISTINCT\s+)?(?:TOP\s+\(?\d+\)?\s+)?[\w*@\[\]., ()]+?\s+FROM\s+[\w\[#@]|DELETE\s+(?:FROM\s+)?[\w\[][\w.\[\]]*\s+WHERE\s|DELETE\s+FROM\s+[\w\[]|INSERT\s+INTO\s+[\w\[]|UPDATE\s+[\w\[][\w.\[\]]*\s+SET\s+\w|EXEC(?:UTE)?\s+(?:dbo\.)?[\w\[]|TRUNCATE\s+TABLE\b|DROP\s+(?:TABLE|PROCEDURE|VIEW|INDEX)\b|(?:CREATE|ALTER)\s+(?:OR\s+ALTER\s+)?(?:PROCEDURE|PROC|TABLE|VIEW|TRIGGER|FUNCTION|INDEX)\b)/;
  // SQL in lower case only counts with its tell-tale parts ("… from x where y = 1"), so admin steps
  // such as "Select the program from the list" stay.
  const SQL_INLINE_LC = /\b(?:select\s+[\w*@.,() ]+?\s+from\s+[\w.\[\]]+\s+where\s+[\w.\[\]]+\s*(?:=|<>|!=|<=|>=|<|>|\bin\s*\(|\blike\b|\bis\s+(?:not\s+)?null)|delete\s+from\s+[\w.\[\]]+\s+where\s+[\w.\[\]]+\s*(?:=|<>|\bin\b)|insert\s+into\s+[\w.\[\]]+\s*\([^)]*\)\s*values|update\s+[\w.\[\]]+\s+set\s+[\w.\[\]]+\s*=)/i;
  const CODE_START = /^\s*(?:<\/?[a-z][\w-]*(?:\s|>|\/>)|[{}]|\/\/|--\s|\/\*|\*\/|#include|(?:var|let|const|function|public|private|protected|static|Dim|Sub|Function|End\s+(?:If|Sub|Function))\s|If\s.+\sThen\b|@\w+\s+(?:int|varchar|nvarchar|bit|datetime|date|decimal|money|char)\b|\w+\s*\([^)]*\)\s*;$)/;
  const ASSIGNMENT = /^\s*[\w.\[\]@]+\s*=\s*[\w"'@(\[]/;
  const looksLikeCode = (t) => {
    const s0 = String(t || '').trim();
    if (!s0) return false;
    if (SQL_START.test(s0) && (/[=;(),@*'_<>]/.test(s0) || /^[A-Z][A-Z\s]*$/.test(s0))) return true;
    if (/^\s*(?:SELECT|UPDATE|DELETE|INSERT|MERGE|EXEC(?:UTE)?|DECLARE|CREATE|ALTER|DROP|TRUNCATE)\s+\S/.test(s0) && !/[.!?]$/.test(s0)) return true; // "UPDATE Employees"
    if (CODE_START.test(s0)) return true;
    if (ASSIGNMENT.test(s0) && !/[.!?]$/.test(s0)) return true;
    return /^\s*(?:select|update|delete|insert|exec)\b/i.test(s0) && SQL_INLINE_LC.test(s0);
  };
  const containsSql = (t) => SQL_INLINE.test(t) || SQL_INLINE_LC.test(t);
  // Where SQL that starts inside a sentence ends. A lower-case word is part of the SQL when it stands where SQL expects a name (after a keyword,
  // a comma, an operator or "(") or when SQL follows it ("name, …", "active = 1"). The first plain
  // word after a complete condition ends it ("… = 0 in QA", "… = 0, so every …").
  const SQL_KW = /^(?:SELECT|FROM|WHERE|AND|OR|NOT|IN|IS|NULL|AS|ON|JOIN|INNER|LEFT|RIGHT|FULL|OUTER|CROSS|ORDER|GROUP|BY|HAVING|TOP|DISTINCT|SET|UPDATE|DELETE|INSERT|INTO|VALUES|LIKE|BETWEEN|EXISTS|CASE|WHEN|THEN|ELSE|END|UNION|ALL|ASC|DESC|COUNT|SUM|MIN|MAX|AVG|ISNULL|COALESCE|GETDATE|CAST|CONVERT|EXEC|EXECUTE|WITH|NOLOCK|OUTPUT|DECLARE|INT|VARCHAR|NVARCHAR|BIT|DATETIME)$/;
  const SQL_OP = /^(?:=|<>|!=|<=|>=|<|>|\(|\)|,|\.|\*|\+|-|\/|%)$/;
  function sqlSpanEnd(t, start) {
    const re = /\s*('(?:[^']|'')*'|"[^"]*"|\[[^\]]*\]|[\w.@#$]+|<>|!=|<=|>=|[=<>*(),;+\-\/%])/y;
    re.lastIndex = start;
    const toks = [];
    let m;
    while ((m = re.exec(t))) toks.push({ w: m[1], end: re.lastIndex });
    // SQL written in capitals has its keywords in capitals ("… = 'X' in QA": "in" is English there).
    const upper = toks.length && /^[A-Z]+$/.test(toks[0].w);
    const kw = (w) => (upper ? SQL_KW.test(w || '') : /^[a-z]+$/.test(w || '') && SQL_KW.test(String(w).toUpperCase()));
    const plain = (w) => /^[a-z]+$/.test(w || '') && !kw(w);
    const op = (w) => !!w && (SQL_OP.test(w) || (upper ? /^(?:IN|IS|LIKE|BETWEEN|NOT)$/ : /^(?:in|is|like|between|not)$/).test(w));
    const structural = (w) => !!w && (SQL_OP.test(w) || kw(w));
    let end = start;
    let depth = 0;
    let between = false;
    for (let i = 0; i < toks.length; i++) {
      const { w } = toks[i];
      const prev = i ? toks[i - 1].w : '';
      const next = toks[i + 1] ? toks[i + 1].w : '';
      const after = toks[i + 2] ? toks[i + 2].w : '';
      if (w === ';') return toks[i].end;
      // "IN (…)", "IS [NOT] NULL", "LIKE '…'", "BETWEEN 1 AND 5": otherwise the word is English ("in the QA domain").
      if (kw(w) && /^in$/i.test(w) && next !== '(') return end;
      if (kw(w) && /^is$/i.test(w) && !/^(?:null|not)$/i.test(next)) return end;
      if (kw(w) && /^like$/i.test(w) && !/^['"]/.test(next)) return end;
      if (kw(w) && /^between$/i.test(w)) between = true;
      if (between && /^and$/i.test(w)) { between = false; end = toks[i].end; continue; }
      if (w === '(') { depth++; end = toks[i].end; continue; }
      if (w === ')') { if (!depth) return end; depth--; end = toks[i].end; continue; } // "(it runs SELECT … FROM Inserted) and …"
      if (w === ',') {
        // "name, status FROM" continues; "…= 0, so every …" ends before the comma.
        if (!next || (plain(next) && !structural(after))) return end;
        end = toks[i].end;
        continue;
      }
      // AND / OR go on only when a condition follows ("AND deleted = 0"), not "and saw 3 rows".
      if (/^(?:and|or)$/i.test(w)) { if (!(next && !SQL_OP.test(next) && op(after))) return end; end = toks[i].end; continue; }
      if (kw(w)) { end = toks[i].end; continue; }
      if (plain(w)) {
        // (After a value such as NULL or DESC the condition is complete: "… IS NULL returned 12 rows".)
        const expected = (kw(prev) && !/^(?:NULL|ASC|DESC|END|ALL|NOLOCK)$/i.test(prev)) || (SQL_OP.test(prev) && prev !== ')');
        if (!expected && !structural(next)) return end;
        end = toks[i].end;
        continue;
      }
      const sqlish = /^['"\[]/.test(w) || /^\d/.test(w) || /[_.@#$]/.test(w) || /^[A-Z]/.test(w) || SQL_OP.test(w) || /^[=<>!]+$/.test(w);
      if (!sqlish) return end;
      end = toks[i].end;
    }
    return end;
  }
  // Turns report lines into lines for the comment: code lines are left out, SQL inside a sentence
  // is replaced by a pointer to the attached analysis, and a sentence that introduced the code
  // ("the DBA team would run:", "the script below") is reworded to point there.
  const SQL_NOTE = '(SQL in the attached analysis)';
  function proseLines(texts) {
    const out = [];
    let afterCode = false;
    for (const raw of texts) {
      let t = tidy(showLinks(raw));
      if (!t || /^[-=_*|]{3,}$/.test(t)) continue;
      if (looksLikeCode(t)) {
        const last = out[out.length - 1];
        if (!afterCode && last !== undefined) {
          if (/:$/.test(last)) out[out.length - 1] = last.replace(/\s*:$/, ': see the attached analysis.');
          else if (/\b(?:script|query|queries|statements?|sql|commands?|code)\s+below\b/i.test(last)) out[out.length - 1] = last.replace(/\bbelow\b/i, 'in the attached analysis');
        }
        afterCode = true;
        continue;
      }
      let guard = 0;
      let m;
      while (guard++ < 5 && (m = t.match(SQL_INLINE) || t.match(SQL_INLINE_LC))) {
        const end = sqlSpanEnd(t, m.index);
        const before = t.slice(0, m.index).replace(/\s+$/, '');
        const after = t.slice(end).replace(/^\s*;?\s*/, '');
        if (!after && /:$/.test(before)) t = `${before} see the attached analysis.`; // "Run this once: DELETE …"
        else t = [before, SQL_NOTE].filter(Boolean).join(' ') + (after ? (/^[,.;:!?)]/.test(after) ? '' : ' ') + after : '.');
        t = capWord(t.replace(/\s+([,.;:])/g, "$1"));
      }
      afterCode = false;
      out.push(t);
    }
    return out;
  }
  const sectionText = (sec, maxItems = 12, maxChars = 1800) => {
    if (!sec) return '';
    const out = [];
    let size = 0;
    for (const t of proseLines(sec.items.slice(0, maxItems).map((it) => it.text))) {
      if (size + t.length > maxChars) break;
      out.push(t);
      size += t.length;
    }
    return out.join('\n');
  };

  // Which decision a verdict line means. The earliest category in the text wins
  // ("Configuration issue — not a code defect" is a configuration issue), and a category
  // right after "not" is what it is not ("Code defect (it is not working as designed)").
  const VERDICT_KINDS = [
    ['duplicate', /\bduplicate\b(?!\s+(?:records?|rows?|entries|data|clients?|services?|charges?|notes?|payments?|claims?|lines?|appointments?|episodes?|keys?|values?|ids?|transactions?|invoices?|bills?))|\bdup\s+of\b/g],
    ['info', /\bneeds?\s+(?:a\s+)?(?:clarification|more\s+details)\b|\bnot\s+ready\b|\binsufficient\b|\bmore\s+info(?:rmation)?\b|\bneed(?:s|ed)?\s+(?:more\s+)?info|\bmissing\s+info|\bcannot\s+(?:be\s+)?determined?|\bunable\s+to\s+determine|\binconclusive\b|\bawaiting\s+(?:information|details)/g],
    ['cannot', /\b(?:could\s+not|couldn['’]t|cannot|can['’]t|unable\s+to|not)\s+(?:be\s+)?(?:reproduc|replicat)|\bnot\s+reproducible\b|\bno\s+repro\b/g],
    ['design', /\bneeds?\s+(?:a\s+)?product\s+decision\b|\benhancement\s+request\b|\bexpected\s+(?:validation|result|outcome)\b|\bthe\s+(?:message|validation|warning|error)\s+is\s+(?:correct|expected|valid)\b|\bwork(?:ing|s)?\s+as\s+(?:designed|intended|expected)|\bby\s+design\b|\bexpected\s+behaviou?r|\bintended\s+behaviou?r|\bas\s+designed\b/g],
    ['permissions', /\bpermissions?\b(?!\s+change)|\bsecurity\s+(?:rights?|roles?|profiles?)\b|\buser\s+rights?\b|\baccess\s+rights?\b|\bmissing\s+(?:right|role)\b/g],
    ['data', /^\W*data\b|\bdata\s+(?:issue|problem|error|corruption|integrity|quality|fix|correction|inconsistency|condition)\b|^\W*(?:bad|corrupt(?:ed)?|orphan(?:ed)?|invalid|inconsistent|stale)\s+(?:data|records?|rows?)\b(?![^.;]*\b(?:code|defect|bug)\b)/g],
    ['environment', /^\W*environment(?:al)?\b|\benvironment(?:al)?\s+(?:issue|problem|difference|specific|setting|configuration)\b|\bbrowser\s+(?:issue|setting|configuration|cache)\b|\b(?:server|hosting|network|infrastructure)\s+(?:issue|problem|setting|configuration)\b/g],
    ['config', /\bconfiguration\b|\bconfig\b|\bmis-?configur|\bset\s*-?up\s+(?:issue|problem|error)|\b(?:settings?|permissions?|security|rights?|access)\s+(?:issue|problem|error|gap)|\b(?:missing|wrong|incorrect|incomplete)\s+(?:settings?|permissions?|rights?|access|security)\b|\bsecurity\s+profile|\buser\s+rights?\b/g],
    ['defect', /\bdefect\b|\bbug\b|\bcode\s+(?:issue|error|problem|change|fix)\b|\bregression\b|^\W*code\W*(?:[.—–:;-]|$)|\bthe\s+(?:code|procedure|stored\s+procedure|query|handler|trigger|routine|logic|screen|page)\s+(?:mishandles|ignores|drops|loses|skips|overwrites|breaks|fails\s+to|does\s+not\s+(?:handle|check|save|pass|send|apply)|doesn['’]t\s+(?:handle|check|save|pass|send|apply)|uses\s+the\s+wrong|reads\s+the\s+wrong|checks\s+the\s+wrong|passes\s+the\s+wrong)\b/g]
  ];
  // A category word is negated when a negation stands just before it in the same clause, with no
  // verb in between ("Not a configuration or permissions issue", "No duplicate found"), or when it
  // is ruled out right after it ("Configuration ruled out", "… were verified and are correct").
  // "No Show fees are a configuration issue" and "without a configuration change it is still a
  // defect" are not negations of the last category.
  const NEG_WORD = /\b(?:not|no|neither|nor|never|without|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|doesn['’]t|don['’]t|didn['’]t|rather\s+than|instead\s+of|looked\s+like|seemed\s+(?:like|to\s+be)|appeared\s+to\s+be|initially|no\s+longer)\b/gi;
  const NEG_BLOCK = /\b(?:is|are|was|were|be|been|being|has|have|had|so|because|but|then|still|after|which|that|it|this|therefore|thus|hence|makes?)\b/i;
  const POST_NEG = /^[^.;:—–()]{0,45}?\b(?:(?:is\s+|are\s+)?not\s+(?:needed|required|necessary)|unnecessary|(?:would|will|does|did|could)\s+not\s+(?:fix|help|solve|resolve|change)|(?:wouldn|won|doesn|didn|couldn)['’]t\s+(?:fix|help|solve|resolve|change)|ruled\s+out|excluded|eliminated|verified\s+(?:and\s+(?:is|are|was|were)\s+)?(?:as\s+)?(?:correct|fine|ok)|checked\s+and\s+(?:is|are|was|were)\s+(?:correct|fine|ok)|(?:is|are|was|were)\s+(?:correct|fine|ok|not\s+the\s+(?:cause|issue|problem))|not\s+the\s+(?:cause|issue|problem))\b/i;
  const negatedAt = (text, index, len = 0) => {
    const t = String(text);
    const clause = t.slice(Math.max(0, index - 160), index).split(/[.;:!?—–()]|\s-\s|\b(?:but|however|yet|so|therefore|thus|hence)\b/i).pop();
    let last = null;
    let m;
    NEG_WORD.lastIndex = 0;
    while ((m = NEG_WORD.exec(clause))) last = m;
    if (last) {
      const between = clause.slice(last.index + last[0].length);
      if (between.trim().split(/\s+/).filter(Boolean).length <= 5 && !NEG_BLOCK.test(between)) return true;
    }
    return POST_NEG.test(t.slice(index + len, index + len + 90));
  };
  // A category stated about this ticket is a conclusion ("…, so this is a code defect", "the behavior is
  // a code defect"). "…, which is a configuration issue" or "the workaround is a configuration change"
  // say something about something else.
  const CONCLUDES = /(?:\b(?:this|it)\s+(?:is|was)|\bit['’]s|\b(?:so|therefore|thus|hence)|\bconfirm(?:s|ed)?(?:\s+(?:as|that\s+(?:this|it)\s+is))?|\bthe\s+(?:reported\s+)?(?:behaviou?r|issue|problem)\s+is|\bthe\s+(?:root\s+)?cause\s+is|\bverdict\s+is|\bmakes?\s+(?:it|this)|\b(?:fees?|settings?|rules?|options?)\s+(?:is|are))\s+(?:(?:a|an|the|still|really|clearly|actually|indeed|definitely|also|just|simply|now|code|confirmed|true|genuine|real|likely|new|separate|different|distinct|legitimate|valid|actual|clear|single|simple)\s+){0,3}$/i;
  const HEDGE = /\b(?:possible|possibly|might|may\s+be|maybe|likely|probably|suspected|at\s+first\s+glance|preliminary|tentative|initial(?:ly)?)\b/i;
  const SUB_KINDS = ['permissions', 'data', 'environment'];
  function classifyVerdict(text) { const k = (verdictHit(text) || {}).kind || ''; return SUB_KINDS.includes(k) ? 'config' : k; }
  const issueKindOf = (text) => { const k = (verdictHit(text) || {}).kind || ''; return SUB_KINDS.includes(k) ? k : ''; };
  function verdictHit(text) {
    const v = String(text || '').toLowerCase().replace(/\s+/g, ' ');
    const hits = [];
    for (const [kind, re] of VERDICT_KINDS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(v))) {
        if (m[0].length === 0) { re.lastIndex++; continue; }
        if (kind === 'cannot' || !negatedAt(v, m.index, m[0].length)) hits.push({ kind, at: m.index, concl: CONCLUDES.test(v.slice(Math.max(0, m.index - 50), m.index)) });
      }
    }
    const found = new Set(hits.map((x) => x.kind));
    // The last conclusion stated about this ticket wins ("…; after code review, this is a code defect");
    // without one, the category named first ("Duplicate of ADO 301596, which is a code defect…").
    hits.sort((x, y) => x.at - y.at);
    const concl = hits.filter((x) => x.concl).sort((x, y) => y.at - x.at)[0];
    let best = concl || hits[0] || null;
    // "Not reproducible in QA; code analysis confirms a defect": the confirmed defect decides.
    if (best && best.kind === 'cannot' && found.has('defect') && /\bconfirm(?:s|ed)?\b[^.;]*\b(?:defect|bug)\b|\b(?:defect|bug)\b[^.;]*\bconfirmed\b/.test(v)) best = { kind: 'defect', at: v.search(/\b(?:defect|bug)\b/), concl: true };
    if (best) return Object.assign({ hedged: HEDGE.test(v) }, best);
    // "Not a bug" with nothing else: working as designed.
    return /\bnot\s+a\s+(?:code\s+)?(?:bug|defect)\b|\bno\s+defect\b/.test(v) ? { kind: 'design', at: 0 } : null;
  }

  function detect(blocks, fileName, headerId) {
    // Table rows ("Label | value", Markdown "| Label | value |") read like "Label: value";
    // Markdown headings ("## Root cause") printed as text are headings.
    const norm = [];
    for (const b of blocks) {
      let text = String(b.text || '');
      let type = b.type;
      const md = text.match(/^\s*\|(.+?)\|?\s*$/);
      if (md) {
        const cells = md[1].split('|').map((c) => c.trim());
        if (cells.every((c) => !c || /^:?-{2,}:?$/.test(c))) continue; // |---|---|
        text = cells.filter(Boolean).join(' | ');
      }
      const h = text.match(/^\s*#{1,6}\s+(\S.*)$/);
      if (h) { text = h[1]; type = 'heading'; }
      const kv = text.match(/^\s*([A-Za-z][A-Za-z #/]{1,30}?)\s*:?\s*\|\s*(.+)$/);
      // Other columns (a "Source" column…) are not part of the value.
      if (kv && KNOWN_LABELS.test(kv[1].trim())) text = `${kv[1].trim()}: ${kv[2].split(/\s*\|\s*/)[0].trim()}`;
      if (/^(?:field|name|item|label)\s*\|\s*(?:value|details?|description)$/i.test(text.trim())) continue; // a table's header row
      norm.push(Object.assign({}, b, { type, text }));
    }
    const texts = norm.map((b) => b.text);
    const all = texts.join('\n');
    const offsets = [];
    texts.reduce((pos, t) => { offsets.push(pos); return pos + t.length + 1; }, 0);
    const blockAt = (pos) => { let i = 0; while (i + 1 < offsets.length && offsets[i + 1] <= pos) i++; return i; };
    const sections = buildSections(norm);
    // The title area: the blocks before the first section heading (or label) after the first block.
    const firstSection = sections.find((x) => x.index > 0 && x.key);
    const headEnd = Math.min(HEAD_BLOCKS, firstSection ? firstSection.index : norm.length);
    const headText = texts.slice(0, Math.max(headEnd, 3)).join('\n');
    // Blocks inside a "Related work items" section.
    const relatedBlock = new Set();
    // ("This ticket: Bug 316330" or "Work item | 316260" inside such a section is the ticket itself.)
    // A "Work item: N" line counts as the ticket only under a heading that is also about this ticket
    // ("Ticket and related work items") and when the line does not describe another ticket.
    const THIS_TICKET = /^\s*(?:this|current|our)\s+(?:ticket|bug|work\s*item|item|issue)\b/i;
    const ID_LINE = /^\s*(?:work\s*item|wi|ticket)(?:\s*(?:id|#|number|no\.?))?\s*[:|]/i;
    const OTHER_TICKET = /introduc|caus|regress|relat|duplicat|original|parent|child|fixed|linked|similar|closed|same\b|previous|prior|older/i;
    const aboutThis = (title) => /\b(?:this|current|our)\b|^\s*ticket\s+(?:and|&)\b/i.test(title);
    const ownLine = (sec, t) => THIS_TICKET.test(t) || (ID_LINE.test(t) && aboutThis(sec.title) && !OTHER_TICKET.test(t.replace(ID_LINE, '')));
    sections.filter((x) => x.key === 'related').forEach((x) => {
      if (!ownLine(x, norm[x.index] ? norm[x.index].text : '')) relatedBlock.add(x.index);
      x.items.forEach((it) => { const k = norm.indexOf(it); if (k >= 0 && !ownLine(x, it.text)) relatedBlock.add(k); });
    });
    const d = { id: '', title: '', partner: '', caseRef: '', platform: '', dupId: '', dupTitle: '', verdict: '', decision: '', confidence: '', notes: [] };
    const firstMatch = (res, src = all) => { for (const re of res) { const m = src.match(re); if (m) return m[1].trim(); } return ''; };

    // --- Work item: every number gets the points of its best mention, plus a little for repeats
    const fname = String(fileName || '');
    const fileNum = (fname.match(/(?:ado|wi|bug|work[\s_-]?item|ticket|pbi)[\s_#-]*(\d{5,7})(?![A-Za-z0-9])/i) || fname.match(/(?<![A-Za-z0-9]|[A-Za-z]-)(\d{5,7})(?![A-Za-z0-9])/) || [])[1] || '';
    const cand = new Map();
    for (const [re, weight] of ID_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(all))) {
        const num = m[1];
        const lead = m[0].length - m[0].trimStart().length;
        // Only the words before it on the same line count ("Ticket and related work items" is a heading above it).
        const before = all.slice(Math.max(0, m.index - 120), m.index + lead).split('\n').pop().replace(/https?:\/\/\S*$/, '');
        if (RELATED_BEFORE.test(before.slice(-90))) { continue; }
        if (weight === 1 && NOT_TICKET_BEFORE.test(before)) continue;
        const bi = blockAt(m.index);
        if (relatedBlock.has(bi)) continue;
        let pts = weight;
        if (bi < headEnd) pts += 3;
        if (norm[bi] && norm[bi].type === 'heading') pts += 2;
        if (/^\s*(?:work\s*item|wi|ado|bug|ticket)(?:\s*(?:id|#|number|no\.?))?\s*[:#|]/i.test(norm[bi] ? norm[bi].text : '') && norm[bi].text.indexOf(num) < 60) pts += 4; // "Work item: 316490"
        const c = cand.get(num) || { num, best: 0, count: 0, first: m.index };
        c.best = Math.max(c.best, pts);
        c.count += 1;
        c.first = Math.min(c.first, m.index);
        cand.set(num, c);
      }
    }
    if (fileNum) { const c = cand.get(fileNum) || { num: fileNum, best: 0, count: 0, first: Infinity }; c.file = true; cand.set(fileNum, c); }
    const score = (c) => c.best + Math.min(Math.max(c.count - 1, 0), 2) * 0.5 + (c.file ? 6 : 0) + (headerId && c.num === headerId ? 2 : 0);
    const ranked = [...cand.values()].filter((c) => score(c) > 0).sort((x, y) => score(y) - score(x) || (y.file ? 1 : 0) - (x.file ? 1 : 0) || x.first - y.first);
    d.id = ranked.length ? ranked[0].num : '';

    // --- Duplicate of (a negation such as "not a duplicate of" does not count)
    const dupRe = /(?:duplicate[sd]?\s+of|dup\s+of|duplicates|same\s+(?:issue\s+|problem\s+|bug\s+|root\s+cause\s+|cause\s+)?as|original\s+(?:ticket|bug|item|work\s*item)(?:\s+id)?\s*[:#-]?)\s*(?:the\s+)?(?:ADO|bug|ticket|work\s*item|item|pbi)?\s*[:#\-–—]?\s*#?\s*(?:https?:\/\/\S*?_workitems\/edit\/)?(\d{5,7})\b([^\n]{0,160})/gi;
    let dm;
    while ((dm = dupRe.exec(all))) {
      if (dm[1] === d.id || (d.dupId && dm[1] !== d.dupId)) continue;
      if (negatedAt(all, dm.index)) continue;
      d.dupId = dm[1];
      const after = dm[2];
      const t = after.match(/^\s*\(([^)]{4,120})\)/) || after.match(/^\s*[—–:-]\s*["“]?([^"”.;|]{4,120})/);
      if (t && !/confidence|^\s*(?:high|medium|low)\b/i.test(t[1])) { d.dupTitle = tidy(t[1]); break; }
    }

    // --- Title
    const GENERIC_WORDS = new Set('qagent root cause analysis rca report review investigation notes meeting findings summary configuration code ticket bug defect sustainment triage assessment document internal ado work item wi the of and for a an on'.split(' '));
    const junkTitle = (t) => {
      const w = String(t || '').toLowerCase().match(/[a-z]+/g) || [];
      return !w.length || w.every((x) => GENERIC_WORDS.has(x))
        || /\bconfidential\b|\binternal\s+use\b|^generated\b|\bgenerated\s+(?:by|on|with|at)\b|^prepared\s+(?:by|for)\b|^draft\b|^copyright\b|©|^page\s+\d/i.test(t)
        || /^\W*\d{1,4}[-\/.]\d{1,2}[-\/.]\d{1,4}/.test(t);
    };
    const headBlocks = norm.slice(0, HEAD_BLOCKS + 4);
    // "Title:" first, then "Bug:", "Issue:"… A status ("Reproduced in QA on …", "Confirmed — High Confidence") is not a title.
    // ("New services default to a retired program" is a title; "New" alone is a status.)
    const STATUS_VALUE = /^(?:(?:not\s+(?:yet\s+)?)?reproduced|could\s+not\s+reproduce|confirmed|unconfirmed)\b(?=\s*(?:[—–\-,(:;]|in\b|on\b|by\b|with\b|$))|^(?:open|closed|new|active|resolved|fixed|in\s+progress|pending|on\s+hold|yes|no|n\/a|none|tbd|unknown|high|medium|low|critical|p[0-4]|sev(?:erity)?\s*\d)\s*$|^\W*(?:high|medium|low)\s+confidence\W*$|^\W*\d{1,4}[-\/.]\d{1,2}[-\/.]\d{1,4}\W*$/i;
    for (const re of [/^\s*(?:title|work\s*item\s*title|ticket\s*title|subject|summary\s*line)\s*:\s*(.{4,})$/i, /^\s*(?:bug|issue|problem)\s*:\s*(.{4,})$/i]) {
      for (const b of headBlocks) {
        const m = b.text.match(re);
        const v = m ? cutAtLabel(m[1]) : '';
        if (v && /\w/.test(v) && !(STATUS_VALUE.test(v) && v.split(/\s+/).length <= 7)) { d.title = v; d.titleLabelled = true; break; }
      }
      if (d.title) break;
    }
    if (!d.title && d.id) {
      // "ADO 316610: Scheduler hides…" or "Bug 316210 — …" (a table cell after "|" is not the title).
      const re = new RegExp(`(?:ADO|bug|ticket|work\\s*item|wi|pbi|#)\\s*[:#\\-–—]?\\s*#?\\s*${d.id}\\s*(?:[:—–]|\\s-)\\s*(.{4,})`, 'i');
      for (const b of headBlocks) { const m = b.text.match(re); if (m && !junkTitle(cutAtLabel(m[1]))) { d.title = cutAtLabel(m[1]); break; } }
    }
    const GENERIC_TITLE = /^(?:qagent\s+)?(?:root\s+cause\s+analysis|rca|analysis|report|investigation|review|configuration\s+review|code\s+review|notes|meeting\s+notes|findings|summary|ticket\s+(?:analysis|review)|bug\s+(?:analysis|review))\b/i;
    if (!d.title) {
      // A heading at the top that names the problem ("Scheduler hides recurring appointments after DST"),
      // or the first line when it reads like a title. The first acceptable one wins.
      const tops = norm.slice(0, Math.max(headEnd, 2)).filter((b, i) => b.type === 'heading' || (i === 0 && b.text.length < 140 && !/[.!?:]$/.test(b.text.trim()) && !/^[^:]{1,30}:\s/.test(b.text)));
      for (const hb of tops) {
        const t = stripNumbering(hb.text).replace(/\s*[—–-]\s*(?:ADO|bug|work\s*item)?\s*#?\d{5,7}\s*$/i, '').replace(/^(?:ADO|bug|work\s*item|wi)\s*#?\s*\d{5,7}\s*[:—–-]?\s*/i, '').trim();
        if (SECTION_KEYS.some(([, re]) => re.test(stripNumbering(hb.text)))) continue;
        if (t && !GENERIC_TITLE.test(t) && !junkTitle(t) && !/\s\|\s/.test(t) && !/^\W*(?:ADO|bug|work\s*item)?\s*#?\d{5,7}\W*$/i.test(t) && t.split(/\s+/).length >= 3) { d.title = t; break; }
      }
    }
    if (d.title && !d.titleLabelled && (GENERIC_TITLE.test(d.title) && d.title.split(/\s+/).length <= 3 || d.title.length < 4)) d.title = '';
    delete d.titleLabelled;
    if (d.title.length > 200) d.title = d.title.slice(0, 200).replace(/\s+\S*$/, '') + '…';

    // --- Partner, case, platform
    // "Tell the partner: …" is a message, not the partner's name. "Client:" is never used:
    // in Credible a client is a person receiving services.
    const partnerFrom = (labels) => {
      const re = new RegExp(`\\b(?:${labels})\\s*:\\s*([^|\\n;]+)`, 'gi');
      let m;
      while ((m = re.exec(all))) {
        const pre = all.slice(Math.max(0, m.index - 40), m.index);
        if (/\b(?:tell|inform|notify|let|update|message|note|reply|email|for|to|with|from)\s+(?:the\s+)?$/i.test(pre)) continue;
        const v = cutAtLabel(m[1].split(/\s+\/\s+(?:CRM|Case)\b/i)[0]).slice(0, 60);
        if (v && /[A-Za-z]/.test(v)) return v;
      }
      return '';
    };
    d.partner = partnerFrom('partner(?:\\s+name)?|customers?(?:\\s+impacted)?|agency|organization');
    const kase = firstMatch([/\b(?:SF\s*|Salesforce\s*)?Case(?:\s*(?:ID|#|No\.?|Number))?\s*[:#]?\s*#?\s*(\d{5,10})\b/i]);
    const crm = firstMatch([/\bCRM\s*(?:ID|#|ticket)?\s*[:#]?\s*([A-Z]{2,}-\d{3,})\b/, /\b(TECH-\d{3,})\b/], headText) || firstMatch([/\bCRM\s*(?:ID|#|ticket)?\s*[:#]?\s*([A-Z]{2,}-\d{3,})\b/]);
    d.caseRef = [kase ? `Case ${kase}` : '', crm].filter(Boolean).join(', ');
    const labelled = all.match(/\b(?:platform|product|system|application)\s*:\s*(credible|carelogic|insync)\b/i);
    if (labelled) d.platform = PLATFORMS[labelled[1].toLowerCase()];
    else {
      const counts = Object.keys(PLATFORMS).map((k) => [PLATFORMS[k], (all.match(new RegExp(k, 'gi')) || []).length]).sort((x, y) => y[1] - x[1]);
      d.platform = counts[0][1] ? counts[0][0] : '';
    }

    // --- Verdict and decision. A verdict, classification or conclusion is preferred to an
    // assessment, and both to a "Result:" or "Status:" line.
    const secs = (key) => sections.filter((x) => x.key === key);
    const sec = (key) => secs(key).find((x) => x.items.length) || null;
    const verdictText = (x) => (x.items[0] ? (x.items[0].inline ? x.items[0].text : sentences(x.items[0].text)[0] || '') : '');
    const vRank = (x) => (/^final\b/i.test(x.title) ? 4 : /^(?:readiness|overall|qagent|our)\s+verdict$/i.test(x.title) ? 3 : /^(?:verdict|classification|conclusion|determination|decision|bottom\s+line)$/i.test(x.title) || /\bor\b[^?]*\?$/.test(x.title) ? 3 : /^(?:assessment|outcome)$/i.test(x.title) ? 2 : 1);
    // A labelled line whose category comes late ("Decision: Support asks the partner to confirm…") is an action, not a verdict.
    // A hedge ("Possible configuration issue at first glance") is weaker than a stated conclusion.
    const vScore = (x) => { const hit = verdictHit(verdictText(x)); return hit ? vRank(x) * 10 - (hit.at > 40 && !hit.concl ? 12 : 0) - (hit.hedged ? 8 : 0) : -1; };
    let vSec = secs('verdict').filter((x) => vScore(x) > 0).sort((x, y) => vScore(y) - vScore(x) || x.index - y.index)[0] || null;
    // Sentences that state the verdict without a label: "This is a code defect", "The behavior is by design",
    // "The fix is configuration", "The defect occurs because…".
    const PROSE_VERDICTS = [
      /\b(?:this|it|the\s+(?:issue|behaviou?r|ticket|problem|bug|reported\s+behaviou?r|outcome))\s+is\s+(?:a\s+|an\s+)?((?:configuration|config|setup|permissions?|data|environment)\s+(?:issue|problem)|(?:confirmed\s+)?(?:code\s+)?defect|duplicate(?:\s+of\s+[^.\n]+)?|working\s+as\s+(?:designed|intended|expected)|by\s+design|expected\s+behaviou?r|not\s+a\s+(?:bug|defect))/i,
      /\bthe\s+(?:fix|solution|resolution)\s+is\s+(?:a\s+)?(?:configuration|config|setup|permissions?|security|data)\b(?:\s+(?:change|fix|update|correction))?/i,
      /\bthe\s+(?:defect|bug)\s+(?:occurs|happens|is\s+caused|exists|is\s+in|comes\s+from)\b/i,
      /\b(?:is|are)\s+the\s+expected\s+result\s+of\b[^.\n]*|,\s*as\s+designed\b/i
    ];
    const proseVerdict = (() => {
      for (const re of PROSE_VERDICTS) { const m = all.match(re); if (m && !negatedAt(all, m.index)) return m[0]; }
      return '';
    })();
    // A weak "Result:" or "Status:" line loses to a sentence such as "This is a code defect".
    if (vSec && vScore(vSec) < 20 && proseVerdict) vSec = null;
    const verdictIdx = vSec ? vSec.index : -1;
    let verdict = vSec ? verdictText(vSec) : '';
    if (!verdict) verdict = proseVerdict;
    d.verdict = tidy(verdict).slice(0, 160);
    d.decision = classifyVerdict(d.verdict) || (d.dupId ? 'duplicate' : '');
    d.issueKind = d.decision === 'config' ? issueKindOf(d.verdict) : '';
    const conf = (d.verdict.match(/\b(high|medium|low)\b\s*confidence/i) || all.match(/\b(high|medium|low)\s+confidence\b/i) || all.match(/\bconfidence\s*:\s*(high|medium|low)\b/i) || [])[1] || '';
    d.confidence = conf ? cap(conf.toLowerCase()) : '';

    // --- Plain-language summary: the paragraph after the verdict, or a summary section.
    // Lines such as "Domain: QA" or "Original ticket: …" under the verdict are details, not the summary.
    let verdictPara = '';
    if (vSec && vSec.items.length) {
      const head = vSec.items[0];
      const next = vSec.items.slice(1).find((it) => it.type !== 'heading' && !isMetaLine(it.text) && !looksLikeCode(it.text));
      if (head.inline) verdictPara = next ? next.text : '';
      else verdictPara = sentences(head.text).slice(1).join(' ') || (next ? next.text : '');
    }
    const vs = sentences(proseLines([verdictPara]).join(' '));
    const isNot = (x) => /^(?:this|it)\s+(?:is|was)\s+not\b|^this\s+isn['’]t\b|^not\s+caused\b|^it\s+isn['’]t\b/i.test(x);
    const notSentences = vs.filter(isNot);
    const restV = vs.filter((x) => !isNot(x));
    let summary = restV[0] && restV[0].length < 90 ? restV.slice(0, 2).join(' ') : (restV[0] || '');
    if (!summary) { const sm = sec('summary'); if (sm) summary = sentences(proseLines(sm.items.filter((it) => it.type !== 'heading').map((it) => it.text)).join(' ')).slice(0, 2).join(' '); }
    d.summary = tidy(summary);

    // --- What it is not, what to tell the partner, workaround
    const notLines = notSentences.slice();
    const wn = sec('whatNot');
    if (wn) proseLines(wn.items.map((it) => it.text)).forEach((t) => notLines.push(t));
    let partnerNote = '';
    const sn = sec('shouldNot');
    if (sn) {
      for (const t of proseLines(sn.items.map((it) => it.text))) {
        if (/^no\s/i.test(t)) notLines.push(t.split(/\s[—–-]\s/)[0].replace(/[.;]?$/, '.'));
        const m = t.match(/(?:inform|tell|let)\s+the\s+(?:partner|customer|client)(?:\s+know)?(?:\s+that)?\s+(.+?)(?:\.(?=\s|$)|$)/i);
        if (m && !partnerNote) partnerNote = capWord(m[1].trim()) + '.';
      }
    }
    const ps = sec('partner');
    if (!partnerNote && ps) partnerNote = capWord(sectionText(ps, ps.inline ? 1 : 3, 500).replace(/\n/g, ' '));
    if (!partnerNote) {
      const m = all.match(/(?:inform|tell|let)\s+the\s+(?:partner|customer|client)(?:\s+know)?(?:\s+that)?\s*:?\s+((?:[^.\n]|\.(?=\S))+)/i);
      if (m) partnerNote = capWord(m[1].trim()) + '.';
    }
    d.whatNot = [...new Set(notLines.map(tidy).filter(Boolean))].join('\n');
    d.tellPartner = tidy(showLinks(partnerNote));
    const ws = sec('workaround');
    if (ws) d.workaround = sentences(sectionText(ws, 3, 600).replace(/\n/g, ' ')).slice(0, 2).join(' ');
    else { const wa = all.match(/\bworkaround\b(?:[^.\n]|\.(?=\S))*(?:\.|\n|$)/i); d.workaround = wa && !containsSql(wa[0]) ? capWord(wa[0].trim()) : ''; }

    // --- Root cause (and the fix sentences inside it)
    const rcSec = sections.find((x) => x.key === 'rootCause' && x.items.length && !/\d{5,7}/.test(x.title))
      || (['info', 'cannot'].includes(d.decision) ? null : sections.find((x) => x.key === 'summary' && x.items.length && x.index > verdictIdx))
      // Otherwise the explanation under the verdict ("By design. Users without the right cannot…").
      || (vSec ? (() => {
        const rest = (vSec.items[0] && !vSec.items[0].inline ? [{ type: 'para', text: sentences(vSec.items[0].text).slice(1).join(' ') }] : []).concat(vSec.items.slice(1));
        const items = rest.filter((it) => it.text && it.type !== 'heading' && !isMetaLine(it.text));
        return items.length ? { title: vSec.title, key: 'rootCause', index: vSec.index, items } : null;
      })() : null);
    const isFix = (x) => /^(?:the\s+)?(?:fix|solution|resolution)\s+(?:requires|is|needs|would|will|consists)\b/i.test(x);
    let causeLines = [];
    const RC_MAX_LINES = 20;
    const RC_MAX_CHARS = 3000;
    let rcBullets = false;
    if (rcSec) {
      const raw = rcSec.items.filter((it) => it.type !== 'heading');
      rcBullets = raw.length > 0 && raw.every((it) => it.type === 'bullet');
      const prose = proseLines(raw.map((it) => it.text));
      causeLines = (rcBullets ? prose : sentences(prose.join(' '))).filter(Boolean);
      const total = causeLines.length;
      let size = 0;
      causeLines = causeLines.slice(0, RC_MAX_LINES).filter((x) => (size += x.length) <= RC_MAX_CHARS);
      if (causeLines.length < total) d.notes.push(`Root cause: the first ${causeLines.length} of ${total} ${rcBullets ? 'points' : 'sentences'} were taken; the rest is in the attached analysis.`);
    }
    const fixSentences = causeLines.filter(isFix);
    d.rootCause = capWord(rcBullets ? causeLines.filter((x) => !isFix(x)).join('\n') : causeLines.filter((x) => !isFix(x)).join(' '));

    // --- Solution, fixes and validation
    let solSec = sec('solution');
    // "5. Verdict and Steps for Support" > "Classification: …" > steps: what follows the classification line
    // up to the next heading is the solution.
    if (!solSec) {
      for (let k = 0; k + 1 < sections.length && !solSec; k++) {
        const container = sections[k];
        const cls = sections[k + 1];
        if (container.key !== 'solution' || container.items.length || cls.key !== 'verdict' || cls.index !== container.index + 1) continue;
        const after = [];
        for (let j = cls.index + 1; j < norm.length && norm[j].type !== 'heading'; j++) after.push(norm[j]);
        if (after.length) solSec = { title: container.title, key: 'solution', index: container.index, items: after };
      }
    }
    // Only lines about the ticket itself ("Move the fix to Development") or a message for the partner;
    // "Update the client's program" and "Move the item … to the Inactive list" are admin steps.
    const PROCESS_LINE = /^(?:tell|inform|let|notify)\s+the\s+(?:partner|customer)\b|^(?:move|send|assign|route|transfer|return|hand)\s+(?:the\s+|this\s+)?(?:fix|ticket|bug|work\s*item)\s+(?:back\s+)?(?:to|into)\s+(?:the\s+)?(?:development|dev|qa|testing|sustainment|engineering|backlog|(?:dev|development|qa|engineering)\s+team)\b|^(?:close|resolve)\s+(?:the\s+|this\s+)?(?:ticket|bug|work\s*item)\b/i;
    // Steps after "Steps for the partner's administrator:" or under "Option A — …" are nested under it,
    // as in the team's format ("* If …:" then "   * Navigate to …").
    const solLines = [];
    if (solSec) {
      const bullets = new Set(solSec.items.filter((it) => it.type === 'bullet').map((it) => tidy(showLinks(it.text))));
      const subs = new Set(solSec.items.filter((it) => it.sub).map((it) => tidy(it.text)));
      let nest = false;
      sectionText(solSec, 16, 2000).split('\n').filter((x) => x && !PROCESS_LINE.test(x)).map(capWord).forEach((x) => {
        const isBullet = bullets.has(x) || bullets.has(x.charAt(0).toLowerCase() + x.slice(1));
        if (nest && isBullet) { solLines.push('  ' + x); return; }
        nest = /:$/.test(x) || subs.has(x);
        solLines.push(x);
      });
    }
    const fixes = [];
    for (const b of norm) {
      const m = b.text.match(/^\s*(?:\d+[.)]\s*)?Fix(?:\s+Layer)?\s*\d*\s*(?:\([^)]*\))?\s*:\s*(.+)$/i);
      if (m && (b.type === 'heading' || b.type === 'para') && !looksLikeCode(m[1]) && !containsSql(m[1])) fixes.push(tidy(m[1]));
    }
    if (d.decision === 'defect' || !d.decision) d.solution = [...fixSentences, ...solLines].join('\n');
    else if (d.decision === 'config' || d.decision === 'design') {
      d.solution = solLines.join('\n');
      // No solution section: instructions in the explanation ("Configuration. Add a modifier rule for…")
      // are the solution, the rest stays the root cause.
      const IMPERATIVE = /^(?:add|remove|set|grant|navigate|open|uncheck|check|enable|disable|assign|update|change|create|delete|select|clear|mark|unmark|go\s+to|click|save|turn\s+(?:on|off)|re-?enter|re-?run)\b/i;
      if (!d.solution && !rcBullets && causeLines.some((x) => IMPERATIVE.test(x))) {
        d.solution = causeLines.filter((x) => IMPERATIVE.test(x)).join('\n');
        d.rootCause = causeLines.filter((x) => !IMPERATIVE.test(x) && !isFix(x)).join(' ');
      }
      // …or in the sentences right after the verdict.
      if (!d.solution && vs.some((x) => IMPERATIVE.test(x))) d.solution = vs.filter((x) => IMPERATIVE.test(x)).map(capWord).join('\n');
    }
    else d.solution = '';
    const flat = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const solFlat = flat(d.solution + '\n' + d.rootCause);
    d.fixes = [...new Set(fixes)].map(capWord).filter((x) => !solFlat.includes(flat(x))).join('\n');
    const valSec = sec('validation');
    d.validation = valSec ? sectionText(valSec, 6, 800) : '';

    // --- Files (Windows or web paths)
    const files = [];
    const addFile = (f) => { const t = String(f || '').replace(/[),.;:]+$/, ''); if (t && !files.includes(t) && files.length < 10) files.push(t); };
    for (const b of norm) { const m = b.text.match(/^\s*File\s+\d+\s*[—–:-]\s*([^\s(]+)/i); if (m) addFile(m[1]); }
    const PATH_RE = /\b[\w.-]+(?:[\/\\][\w.-]+)+\.(?:aspx?|vb|cs|cshtml|vbhtml|sql|js|jsx|ts|tsx|py|java|config|xml|json|html?|asmx|ashx|ascx|master)\b/g;
    const fs = sec('files');
    if (fs) fs.items.forEach((it) => (it.text.match(PATH_RE) || []).forEach(addFile));
    if (!files.length) (all.match(PATH_RE) || []).forEach(addFile);
    d.files = files.join('\n');

    // --- Verification (read-only SQL is referenced, never copied)
    const sqlHead = norm.find((b) => b.type === 'heading' && /read-only\s+sql|diagnostic\s+quer|sql\s+to\s+confirm|verification\s+quer|queries\s+to\s+(?:confirm|verify)/i.test(b.text));
    if (sqlHead) {
      const num = (sqlHead.text.match(/^\s*(\d+)[.)]/) || [])[1];
      d.verification = `Read-only SQL to confirm it is in ${num ? `section ${num}` : 'the SQL section'} of the attached analysis.`;
    }

    // --- More information / could not reproduce
    const infoSec = sec('info');
    d.infoExtra = infoSec ? sectionText(infoSec, 10, 1200) : '';
    const testedSec = sec('tested');
    if (d.decision === 'cannot' && testedSec) d.cannotTried = sectionText(testedSec, 4, 600).replace(/\n/g, ' ');
    const domain = all.match(/\b(?:domain|environment|tested\s+in)\s*:\s*([^\n|;]{2,60})/i);
    if (domain) {
      const dv = cutAtLabel(domain[1]);
      if (d.decision === 'cannot') d.cannotDomain = dv;
      else if (d.decision === 'defect' && /\breproduced\b/i.test(all) && !/\bnot\s+(?:yet\s+)?reproduced\b/i.test(all)) { d.repro = 'reproduced'; d.reproDomain = dv; }
    }
    // Every text field: links keep their address in view, and no field is left undefined.
    Object.keys(d).forEach((k) => { if (typeof d[k] === 'string') d[k] = showLinks(d[k]); });
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

  // Messages for files that cannot be read. Our own messages pass through; library errors are reworded.
  function readError(err, ext) {
    if (err && err.own) return err.message;
    const name = (err && err.name) || '';
    const msg = String((err && err.message) || '');
    if (name === 'PasswordException' || /password/i.test(msg)) return 'This PDF is protected with a password. Open it, save or export it without a password, then add it again.';
    if (ext === 'pdf') return 'This file could not be read as a PDF. Export the analysis from QAgent again, then add it.';
    return 'This file could not be read as a Word document (.docx). Save it again as .docx or export it as PDF, then add it.';
  }
  const ownError = (message) => Object.assign(new Error(message), { own: true });

  async function readFile(file) {
    const name = file.name || 'report';
    const ext = (name.split('.').pop() || '').toLowerCase();
    S.error = '';
    if (ext === 'doc') { S.error = 'Old Word files (.doc) cannot be read. Save it as .docx or export it as PDF, then add it again.'; return paintAll(); }
    if (!['pdf', 'docx'].includes(ext)) { S.error = 'Add a PDF or a Word (.docx) file.'; return paintAll(); }
    if (file.size > 15 * 1024 * 1024) { S.error = 'The file is larger than 15 MB. Export only the analysis and try again.'; return paintAll(); }
    // Only the last file added counts: a slower file that finishes later is ignored.
    const seq = (S.readSeq = (S.readSeq || 0) + 1);
    // If this file cannot be read, the report that was already there stays as it was.
    const prev = { file: S.file, blocks: S.blocks, text: S.text, detected: S.detected, phi: S.phi, decisionPending: S.decisionPending };
    const info = { name, size: file.size, kind: ext, pages: null };
    S.busy = true;
    S.file = info;
    paintAll();
    try {
      const buf = await file.arrayBuffer();
      const blocks = ext === 'pdf' ? await pdfToBlocks(buf, info) : await docxToBlocks(buf);
      if (seq !== S.readSeq) return;
      const text = blocks.map((b) => b.text).join('\n');
      if (!text.trim()) throw ownError('No text was found in this file. If it is a scanned image, export the analysis from QAgent as text or PDF again.');
      const detected = detect(blocks, name, C.varValue('WORK_ITEM_ID'));
      Object.assign(S, { blocks, text, detected, phi: phiFindings(text) });
      applyDetected(detected, name);
      saveDraft();
      const n = S.found.size;
      C.toast(n ? `Filled ${n} field${n === 1 ? '' : 's'} from the report. Check the highlighted fields.` : 'The report was read, but no ticket details were found in it. Fill in the fields by hand.', n ? undefined : 'warn');
    } catch (err) {
      if (seq !== S.readSeq) return;
      S.error = `${name}: ${readError(err, ext)}${prev.file ? ` The fields still come from ${prev.file.name}.` : ''}`;
      Object.assign(S, prev);
    } finally {
      if (seq === S.readSeq) { S.busy = false; paintAll(); }
    }
  }

  // Everything that belongs to one ticket. Loading a report replaces all of it, so
  // nothing from the previous ticket stays behind; people, format and options stay.
  const REPORT_KEYS = ['id', 'title', 'partner', 'caseRef', 'platform', 'dupId', 'dupTitle', 'issueKind', 'summary', 'whatNot', 'tellPartner', 'workaround',
    'rootCause', 'solution', 'techDetail', 'files', 'fixes', 'verification', 'validation', 'confidence', 'reproDomain', 'reproDate', 'reproRole',
    'reproSteps', 'cannotTried', 'cannotDomain', 'cannotRole', 'infoExtra'];
  function applyDetected(d, fileName) {
    const before = JSON.parse(JSON.stringify(S.f));
    const hadContent = REPORT_KEYS.some((k) => String(before[k] || '').trim() && String(before[k]).trim() !== String(d[k] || '').trim());
    const blank = blankForm();
    REPORT_KEYS.forEach((k) => { S.f[k] = blank[k]; });
    S.f.repro = d.repro || 'code';
    S.auto = new Set();
    REPORT_KEYS.forEach((k) => { if (d[k]) { S.f[k] = d[k]; S.auto.add(k); } });
    setField('decision', d.decision || blank.decision);
    S.decisionPending = !d.decision;
    if (d.decision) S.auto.add('decision');
    // What the report had. Unlike the highlight (S.auto), it does not change when a field is edited.
    S.found = new Set(S.auto);
    S.reverted = false;
    // Nothing in the report: use the work item and platform set in the page header, and say so.
    S.fromHeader = {};
    if (!S.f.platform && C.varValue('PLATFORM')) { S.f.platform = C.varValue('PLATFORM'); S.fromHeader.platform = S.f.platform; }
    if (!S.f.id && C.varValue('WORK_ITEM_ID')) { S.f.id = C.varValue('WORK_ITEM_ID'); S.fromHeader.id = S.f.id; }
    S.f.attachName = fileName;
    S.undo = hadContent ? before : null;
  }
  const FOUND_LABELS = [['id', 'Work item'], ['title', 'Title'], ['partner', 'Partner'], ['caseRef', 'Case'], ['platform', 'Platform'], ['decision', 'Decision'],
    ['rootCause', 'Root cause'], ['summary', 'In short'], ['solution', 'Solution'], ['fixes', 'Proposed fix'], ['files', 'Files'], ['validation', 'Validation'],
    ['tellPartner', 'Tell the partner'], ['workaround', 'Workaround'], ['whatNot', 'What it is not'], ['dupId', 'Original ticket'], ['infoExtra', 'Questions'],
    ['verification', 'Verification'], ['dupTitle', 'Original title'], ['confidence', 'Confidence'], ['techDetail', 'Technical explanation'],
    ['reproDomain', 'Domain'], ['reproDate', 'Date'], ['reproRole', 'User role'], ['reproSteps', 'Steps'], ['cannotDomain', 'Domain where we tried'],
    ['cannotTried', 'What we tried'], ['cannotRole', 'User role'], ['issueKind', 'Kind of issue']];
  const CORE_FOUND = ['id', 'title', 'partner', 'caseRef', 'platform', 'decision', 'rootCause'];

  /* ------------------------------------------------------------------ */
  /* Composing the comment                                               */
  /* ------------------------------------------------------------------ */
  const lines = (t) => String(t || '').split(/\r?\n/).map((s) => s.trim().replace(/^(?:[-•*·▪◦]\s+|\d{1,2}[.)]\s+(?=\D))/, '').trim()).filter((s) => s && !/^[-•*·▪◦]$/.test(s));

  /* Rich fields (root cause, solution, technical explanation, validation):
   * one bullet per line, a line indented with two spaces or a tab nests under
   * the bullet above, and lines between ``` fences form a code block. Returns
   * entries: { parts, sub } for bullets and { code, lang } for code blocks. */
  function dedent(rows) {
    const indents = rows.filter((r) => r.trim()).map((r) => r.replace(/\t/g, '    ').match(/^ */)[0].length);
    const cut = indents.length ? Math.min(...indents) : 0;
    const out = rows.map((r) => r.replace(/\t/g, '    ').slice(cut).replace(/\s+$/, ''));
    while (out.length && !out[0].trim()) out.shift();
    while (out.length && !out[out.length - 1].trim()) out.pop();
    return out.join('\n');
  }
  // A list marker: a bullet, or a number like "1." that is not followed by another number ("2. 5 is..." is text).
  const BULLET_RE = /^(?:[-*•·▪◦]\s+|\d{1,2}[.)]\s+(?=\D))/;
  function parseRich(text) {
    const entries = [];
    let code = null;
    let stack = []; // open bullets: { indent, item }
    const rows = String(text || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
    // Text copied from inside a list keeps its indentation: measure nesting from the least indented line.
    const base = Math.min(...rows.filter((r) => r.trim()).map((r) => r.match(/^ */)[0].length), 1e9);
    for (const raw of rows.map((r) => (base < 1e9 ? r.slice(Math.min(base, r.match(/^ */)[0].length)) : r))) {
      if (code) {
        if (new RegExp('^\\s*`{' + code.fence + ',}\\s*$').test(raw)) { entries.push({ code: dedent(code.rows), lang: code.lang }); code = null; stack = []; } else code.rows.push(raw);
        continue;
      }
      const fence = raw.match(/^\s*(`{3,})\s*([\w#+.-]*)\s*$/);
      if (fence) { code = { fence: fence[1].length, lang: fence[2] || '', rows: [] }; continue; }
      const trimmed = raw.trim();
      if (!trimmed || /^[-*•·▪◦]$/.test(trimmed)) continue;
      // ADO's Markdown sometimes turns the rest of a code block into lines of inline code: put them back.
      const inline = trimmed.match(/^`([^`]*)`$/);
      const prev = entries[entries.length - 1];
      if (inline && prev && prev.code !== undefined && !stack.length) { prev.code += '\n' + inline[1].replace(/\s+$/, ''); continue; }
      const indent = raw.match(/^ */)[0].length;
      const body = trimmed.replace(BULLET_RE, '');
      if (!body) continue;
      const item = { parts: [body] };
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      if (indent >= 2 && stack.length) {
        const parent = stack[stack.length - 1].item;
        (parent.sub = parent.sub || []).push(item);
      } else {
        stack = [];
        entries.push(item);
      }
      stack.push({ indent: stack.length > 0 || indent >= 2 ? indent : 0, item });
    }
    if (code) entries.push({ code: dedent(code.rows), lang: code.lang }); // fence left open
    return entries.filter((e) => e.code === undefined || e.code.trim());
  }
  // A single paragraph becomes one bullet per sentence; anything with line breaks is parsed as rich text.
  const richOrSentences = (text) => {
    const t = String(text || '').trim();
    if (!t) return [];
    return /\n|```/.test(t) ? parseRich(t) : sentences(t.replace(BULLET_RE, '')).map((x) => ({ parts: [x] }));
  };
  // Rich text inline (for table cells and one-line answers): bullets joined, code left out.
  const richInline = (text) => {
    const flat = [];
    const walk = (items) => items.forEach((e) => { if (e.code === undefined) { flat.push(e.parts.join('')); if (e.sub) walk(e.sub); } });
    walk(richOrSentences(text));
    return flat.join(' ');
  };
  // Adds entries to a document: runs of bullets become one list, code entries become code blocks.
  function emitEntries(doc, entries) {
    let run = null;
    for (const e of entries) {
      if (e && e.code !== undefined) { run = null; doc.push({ k: 'code', text: e.code, lang: e.lang || '' }); continue; }
      const item = typeof e === 'string' ? [e] : e;
      if (!run) { run = { k: 'ul', items: [] }; doc.push(run); }
      run.items.push(item);
    }
  }
  const hasContent = (e) => (typeof e === 'string' ? !!e.trim() : !!e && (e.code !== undefined ? !!e.code.trim() : Array.isArray(e) ? e.length > 0 : (e.parts || []).length > 0));
  const mention = (n) => '@' + String(n || '').trim().replace(/^@+/, '').trim();

  // Only http(s) links become ticket links (a typed "javascript:" URL must never be clickable).
  const safeBase = (u) => {
    const v = String(u || '').trim().replace(/\/+$/, '');
    return /^https?:\/\/[^\s"'<>`]+$/i.test(v) ? v : '';
  };
  const ownerName = (f) => String(f.owner || '').trim().replace(/^@+/, '').trim();

  function compose(opts) {
    const f = S.f;
    const L = T[f.language] || T.en;
    const kind = f.decision;
    const technical = opts.technical && f.secTechnical;
    const doc = [];
    const P = (...parts) => doc.push({ k: 'p', parts: parts.flat().filter((x) => x !== '' && x != null) });
    const H = (text) => doc.push({ k: 'h', text });
    const UL = (items) => { const it = items.filter(Boolean); if (it.length) doc.push({ k: 'ul', items: it.map((x) => (Array.isArray(x) ? x : [x])) }); };
    const B = (t) => ({ b: t });
    const base = safeBase(f.adoBase);
    const ticket = (id) => {
      const clean = String(id || '').replace(/\D/g, '');
      if (!clean) return '#[ID]';
      return base ? { a: `${base}/_workitems/edit/${clean}`, text: `#${clean}` } : `#${clean}`;
    };
    const ticketText = (id) => { const t = ticket(id); return typeof t === 'string' ? t : t.text; };
    const owner = ownerName(f) ? mention(f.owner) : '@' + L.ownerPh;

    const decisionText = () => ({
      duplicate: L.decDuplicate(ticketText(f.dupId), f.dupTitle), info: L.decInfo, config: (L.decConfigKind || {})[f.issueKind] || L.decConfig, design: L.decDesign, cannot: L.decCannot
    })[kind] || L.decDefect(f.confidence);
    const reproText = () => {
      if (kind === 'cannot') return L.cannotTried(f.cannotDomain.trim(), f.cannotRole.trim());
      if (kind !== 'defect') return '';
      if (f.repro === 'reproduced') return L.reproDone(f.reproDomain.trim(), f.reproDate, f.reproRole.trim());
      if (f.repro === 'pending') return L.reproPending(f.reproDomain.trim());
      return L.reproCode;
    };
    const nextText = () => (f.nextStep === 'custom' ? f.nextCustom.trim() : L.next[f.nextStep] || '');
    // A workaround only makes sense for a defect or a duplicate, unless one was written.
    const showWorkaround = f.secWorkaround && (kind === 'defect' || kind === 'duplicate' || !!f.workaround.trim());
    const workaroundText = () => f.workaround.trim() || L.noWorkaround;
    const whatNot = lines(f.whatNot);
    const solution = parseRich(f.solution);
    const validation = parseRich(f.validation);
    const validationInline = richInline(f.validation);
    const fixes = lines(f.fixes);
    const richParagraph = (text) => {
      const t = String(text || '').trim();
      if (!t) return;
      if (/\n|```/.test(t)) emitEntries(doc, parseRich(t)); else P(t);
    };

    const decisionBlock = () => {
      if (kind === 'duplicate') {
        P(B(L.why + ':'), ' ', ({ cause: L.dupCause, steps: L.dupSteps, both: L.dupBoth })[f.dupReason] || L.dupCause);
        P(L.dupLinked(ticketText(f.dupId)));
      } else if (kind === 'info') {
        P(B(L.replyWith));
        UL([...f.infoItems.map((k) => (INFO_LABELS[f.language] || INFO_LABELS.en)[k]), ...lines(f.infoExtra)]);
        P(L.hold(Math.max(1, Number(f.holdDays) || 5)));
      } else if (kind === 'config') {
        if (solution.length) { H(L.m6.solution); emitEntries(doc, solution); }
      } else if (kind === 'design') {
        if (solution.length) { H(L.m6.suggested); emitEntries(doc, solution); }
      } else if (kind === 'cannot') {
        if (f.cannotTried.trim()) P(B(L.tried + ':'), ' ', f.cannotTried.trim());
        P(L.cannotNext);
        UL(lines(f.infoExtra));
      } else if (kind === 'defect') {
        if (f.repro === 'reproduced' && lines(f.reproSteps).length) { H(L.stepsUsed); doc.push({ k: 'ol', items: lines(f.reproSteps).map((t) => [t]) }); }
        if (solution.length) { H(L.m6.solution); emitEntries(doc, solution); }
      }
    };
    const technicalBlock = () => {
      const flatText = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (f.rootCause.trim() && !(flatText(f.summary) && flatText(f.summary).includes(flatText(f.rootCause)))) { H(L.rootCause); richParagraph(f.rootCause); }
      const tech = parseRich(f.techDetail);
      if (tech.length) { H(L.m6.techExplanation); emitEntries(doc, tech); }
      const files = lines(f.files);
      if (files.length) { H(L.files); UL(files); }
      if (kind === 'defect' && f.secFix && fixes.length) { H(L.fix); UL(fixes); }
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
    // The signature goes before the CC line, so CC is always the last line.
    const closing = () => {
      const sig = lines(f.signature);
      if (sig.length) doc.push({ k: 'p', parts: [sig.join('\n')] });
      const people = f.cc.map((n) => String(n).trim().replace(/^@+/, '').trim()).filter(Boolean);
      const o = ownerName(f);
      if (f.greeting === 'cc' && o && !people.some((n) => n.toLowerCase() === o.toLowerCase())) people.unshift(o);
      if (people.length) P(L.cc + ' ' + people.map(mention).join(' '));
    };
    const header = () => {
      const meta = [f.partner, f.caseRef].filter(Boolean).join(', ');
      P(B(`${L.reviewOf} `), B(ticket(f.id)), f.title ? `: ${f.title}` : '', meta ? ` (${meta})` : '');
    };
    const partnerSetup = () => (kind === 'config' ? (L.setupYesKind || {})[f.issueKind] || L.setupYes : kind === 'design' ? L.no : (whatNot[0] || L.setupNo));
    const repro = reproText();
    const action = (kind === 'config' && (L.actionKind || {})[f.issueKind]) || L.action[kind] || '';

    greeting();
    const model = Number(f.model) || 6;
    if (model === 6) {
      composeTeamFormat({ f, L, P, H, doc, kind, ticket, ticketText, repro, whatNot, technical, nextText, showWorkaround, workaroundText, solution, validation, fixes });
    } else if (model === 1) {
      P(B(L.decision + ':'), ' ', decisionText(), ' ', nextText());
      if (repro) P(B((kind === 'defect' ? L.reproducible : L.reproduction) + ':'), ' ', repro);
      if (validation.length) { H(L.m6.validation); emitEntries(doc, validation); }
      if (f.summary.trim()) { H(L.whatHappening); P(f.summary.trim()); }
      if (whatNot.length) { H(L.whatNot); P(whatNot.join(' ')); }
      if (f.secPartner && f.tellPartner.trim()) { H(L.tellPartner); P(f.tellPartner.trim(), showWorkaround ? ' ' + workaroundText() : ''); }
      else if (showWorkaround) { H(L.workaround); P(workaroundText()); }
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
        [L.tDuplicate, kind === 'duplicate' ? ticketText(f.dupId) : L.no.replace('.', '')],
        [L.tRepro, repro || '—'],
        ...(validationInline ? [[L.m6.validation, validationInline]] : []),
        [L.tWhat, f.summary.trim() || f.title || '—'],
        [L.tSetup, partnerSetup()]
      ];
      if (showWorkaround) rows.push([L.tWork, workaroundText()]);
      if (f.secPartner && f.tellPartner.trim()) rows.push([L.tTell, f.tellPartner.trim()]);
      if (f.attach && f.attachName) rows.push([L.tEvidence, L.evidenceAttached(f.attachName)]);
      rows.push([L.tNext, nextText()]);
      doc.push({ k: 'table', rows });
      decisionBlock();
      addTechnical();
    } else if (model === 3) {
      H(L.situation); P(L.reports(f.partner, f.title));
      H(L.background); P(L.reviewed(f.platform), f.attach && f.attachName ? ' ' + L.evidenceAttached(f.attachName) + '.' : '');
      H(L.assessment); P(decisionText(), f.summary.trim() ? ' ' + f.summary.trim() : '', whatNot.length ? ' ' + whatNot.join(' ') : '', repro ? ' ' + repro : '', validationInline ? ' ' + validationInline : '');
      decisionBlock();
      H(L.recommendation);
      UL([nextText(), action, f.secPartner && f.tellPartner.trim() ? `${L.tellPartner}: ${f.tellPartner.trim()}` : '', showWorkaround ? `${L.workaround}: ${workaroundText()}` : '']);
      addTechnical();
    } else if (model === 4) {
      header();
      const qa = (q, a) => { if (a) P(B(q), ' ', a); };
      qa(L.qBug, kind === 'defect' ? L.yes + ' ' + L.decDefect(f.confidence) : decisionText());
      qa(L.qDup, kind === 'duplicate' ? L.yes + ' ' + ticketText(f.dupId) : L.no);
      qa(L.qSetup, partnerSetup());
      qa(L.qRepro, [repro, validationInline].filter(Boolean).join(' ') || '—');
      if (showWorkaround) qa(L.qWork, workaroundText());
      if (f.secPartner && f.tellPartner.trim()) qa(L.qTell, f.tellPartner.trim());
      qa(L.qNeed, kind === 'info' ? L.replyWith.replace(/:$/, ' the list below.') : action);
      decisionBlock();
      qa(L.qNext, nextText());
      addTechnical();
    } else {
      H(L.forSupport);
      P(B(L.decision + ':'), ' ', decisionText());
      if (repro) P(B((kind === 'defect' ? L.reproducible : L.reproduction) + ':'), ' ', repro);
      if (validation.length === 1 && !validation[0].sub && validation[0].code === undefined) P(B(L.m6.validation + ':'), ' ', validation[0].parts[0]);
      else if (validation.length) { P(B(L.m6.validation + ':')); emitEntries(doc, validation); }
      if (f.summary.trim()) P(B(L.inShort + ':'), ' ', f.summary.trim());
      if (whatNot.length) P(B(L.whatNot + ':'), ' ', whatNot.join(' '));
      if (f.secPartner && f.tellPartner.trim()) P(B(L.tellPartner + ':'), ' ', f.tellPartner.trim());
      if (showWorkaround) P(B(L.workaround + ':'), ' ', workaroundText());
      decisionBlock();
      P(B(L.yourAction + ':'), ' ', action);
      if (nextText()) P(B(L.nextStep + ':'), ' ', nextText());
      addTechnical();
    }
    closing();
    return doc;
  }

  /* Model 6: the Sustainment team's format. An opening verdict, then bullet
   * sections in this order: Root Cause (or what was checked and tested),
   * Solution, Validation, Root Cause (Technical Explanation) and Next Steps.
   * Which sections appear, and their names, depend on the decision; empty
   * sections are left out. */
  const causeEntries = (f) => richOrSentences(f.rootCause.trim() ? f.rootCause : f.summary);
  const normSentence = (t) => String(t || '').trim().replace(/[.!\s]+$/, '').toLowerCase();
  function composeTeamFormat(x) {
    const { f, L, P, H, doc, kind, ticket, ticketText, repro, whatNot, technical, nextText, showWorkaround, workaroundText, solution, validation, fixes } = x;
    const M = L.m6;
    const openerFor = (lang, withDetail) => {
      const o = (kind === 'config' && (T[lang].m6.openKind || {})[f.issueKind]) || T[lang].m6.open[kind];
      if (typeof o !== 'function') return o;
      return kind === 'duplicate' ? o(ticketText(f.dupId)) : o(withDetail ? f.confidence : '');
    };
    const opener = openerFor(f.language in T ? f.language : 'en', true);
    // A pasted section may already start with the verdict (in either language, with or without a period): do not repeat it.
    const openers = new Set(['en', 'es'].flatMap((lang) => [openerFor(lang, true), openerFor(lang, false)]).map(normSentence));
    const isOpener = (e) => !!e && Array.isArray(e.parts) && !e.sub && typeof e.parts[0] === 'string' && openers.has(normSentence(e.parts[0]));
    const section = (title, entries) => {
      const list = entries.filter(hasContent).map((e) => (typeof e === 'string' ? e.trim() : e));
      if (!list.length) return;
      H(title);
      emitEntries(doc, list);
    };
    const partner = f.secPartner && f.tellPartner.trim() ? `${M.tellPartner} ${f.tellPartner.trim()}` : '';
    // The ADO next step is written when it is the usual step for the decision, or when someone picked one.
    const chosenNext = kind === 'defect' || kind === 'duplicate' || kind === 'cannot' || !f.nextAuto ? nextText() : '';
    const filesList = lines(f.files);
    const fixEntry = kind === 'defect' && f.secFix && fixes.length ? { parts: [M.proposedFix], sub: fixes.map((t) => ({ parts: [t] })) } : null;
    const cause = causeEntries(f).filter((e) => !isOpener(e));

    P(opener);

    // 1. Root Cause, or what was checked and tested
    if (kind === 'info') section(M.checked, cause);
    else if (kind === 'cannot') { section(M.checked, cause); section(M.tested, [repro, f.cannotTried.trim(), ...validation]); }
    else section(M.rootCause, [opener, ...cause, ...(kind === 'defect' || kind === 'duplicate' ? whatNot : [])]);

    // 2. Solution, or what is needed to continue
    if (kind === 'defect') {
      section(M.solution, [...solution, fixEntry || (solution.length ? '' : M.devFix), showWorkaround ? `${M.workaround} ${workaroundText()}` : '']);
    } else if (kind === 'duplicate') {
      const reason = ({ cause: L.dupCause, steps: L.dupSteps, both: L.dupBoth })[f.dupReason] || L.dupCause;
      section(M.duplicateOf, [
        [M.original + ' ', ticket(f.dupId), f.dupTitle ? ` – ${f.dupTitle}` : ''],
        `${M.reason} ${reason.charAt(0).toUpperCase() + reason.slice(1)}`,
        L.dupLinked(ticketText(f.dupId))
      ]);
    } else if (kind === 'config') {
      section(M.solution, solution);
    } else if (kind === 'design') {
      section(M.suggested, solution);
    } else if (kind === 'info') {
      section(M.needed, [...f.infoItems.map((k) => (INFO_LABELS[f.language] || INFO_LABELS.en)[k]), ...lines(f.infoExtra)]);
    } else if (kind === 'cannot') {
      section(M.needed, [L.cannotNext, ...lines(f.infoExtra)]);
    }

    // 3. Validation (for "could not reproduce" it is part of What We Tested)
    if (kind === 'defect') {
      const reproItem = f.repro === 'reproduced' && lines(f.reproSteps).length ? { parts: [repro], sub: lines(f.reproSteps).map((t) => ({ parts: [t] })) } : repro;
      section(M.validation, [reproItem, ...validation]);
    } else if (kind !== 'cannot') {
      section(M.validation, validation);
    }

    // 4. Technical explanation for Dev and QA
    if (technical) {
      section(kind === 'info' || kind === 'cannot' ? M.technical : M.techRootCause, [
        ...parseRich(f.techDetail),
        filesList.length ? { parts: [M.files], sub: filesList.map((t) => ({ parts: [t] })) } : '',
        f.verification.trim() ? `${L.verification}: ${f.verification.trim()}` : '',
        f.attach && f.attachName ? `${L.attached}: ${f.attachName}` : ''
      ]);
    }

    // 5. Next Steps
    if (kind === 'info') section(M.nextSteps, [L.hold(Math.max(1, Number(f.holdDays) || 5)), f.nextStep !== 'hold' ? chosenNext : '', partner]);
    else if (kind === 'duplicate') section(M.nextSteps, [chosenNext, partner, showWorkaround && f.workaround.trim() ? `${M.workaround} ${f.workaround.trim()}` : '']);
    else section(M.nextSteps, [chosenNext, partner]);
  }

  const CODE_STYLE = 'font-family:Consolas,Menlo,monospace;background:#f3f4f6;padding:0 3px;border-radius:3px';
  // Markdown-style inline formatting for the formatted copy: `code`, ```code```, **bold** and [text](https://link).
  function inlineHTML(text) {
    // Code spans are set aside first, so **bold** can wrap them and nothing inside code is formatted.
    const codes = [];
    const marked = String(text).replace(/```([^`\n]+)```|`([^`\n]+)`/g, (m, a, b) => { codes.push(a !== undefined ? a : b); return `\u0000${codes.length - 1}\u0000`; });
    return C.esc(marked)
      .replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)\u0000]+)\)/g, (m, label, url) => (label === url ? `<a href="${url}">${url}</a>` : `${label} (<a href="${url}">${url}</a>)`))
      .replace(/\u0000(\d+)\u0000/g, (m, i) => `<code style="${CODE_STYLE}">${C.esc(codes[Number(i)])}</code>`)
      .replace(/\n/g, '<br>');
  }
  function partHTML(p) {
    if (typeof p === 'string') return inlineHTML(p);
    if (p.b !== undefined) return `<b>${partHTML(p.b)}</b>`;
    if (p.a) return `<a href="${C.esc(p.a)}">${C.esc(p.text)}</a>`;
    return '';
  }
  const partText = (p) => (typeof p === 'string' ? p : p.b !== undefined ? partText(p.b) : p.a ? p.text : '');
  // List items are arrays of parts, or { parts, sub } for a bullet with nested steps.
  const itemParts = (it) => (Array.isArray(it) ? it : it.parts);
  function listHTML(kind, items) {
    return `<${kind}>${items.map((it) => `<li>${itemParts(it).map(partHTML).join('')}${it.sub && it.sub.length ? listHTML('ul', it.sub) : ''}</li>`).join('')}</${kind}>`;
  }
  function listText(kind, items, indent) {
    return items.map((it, i) => {
      const head = `${indent}${kind === 'ol' ? `${i + 1}.` : '*'} ${itemParts(it).map(partText).join('')}`;
      return it.sub && it.sub.length ? head + '\n' + listText('ul', it.sub, indent + '   ') : head;
    }).join('\n');
  }
  function toHTML(doc) {
    return doc.map((n) => {
      if (n.k === 'p') return `<p>${n.parts.map(partHTML).join('')}</p>`;
      if (n.k === 'h') return `<p><b>${C.esc(n.text)}</b></p>`;
      if (n.k === 'ul' || n.k === 'ol') return listHTML(n.k, n.items);
      if (n.k === 'hr') return '<hr>';
      if (n.k === 'code') return `<pre style="background:#f3f4f6;border:1px solid #d9dee7;border-radius:4px;padding:8px 10px;margin:0 0 10px;white-space:pre-wrap;font-family:Consolas,Menlo,monospace;font-size:12.5px"><code>${C.esc(n.text)}</code></pre>`;
      if (n.k === 'table') return `<table style="border-collapse:collapse">${n.rows.map(([l, v]) => `<tr><td style="border:1px solid #c3cad7;padding:4px 8px;vertical-align:top"><b>${C.esc(l)}</b></td><td style="border:1px solid #c3cad7;padding:4px 8px;vertical-align:top">${C.esc(v)}</td></tr>`).join('')}</table>`;
      return '';
    }).join('\n');
  }
  function toText(doc) {
    return doc.map((n) => {
      if (n.k === 'p') return n.parts.map(partText).join('');
      if (n.k === 'h') return n.text;
      if (n.k === 'ul' || n.k === 'ol') return listText(n.k, n.items, '');
      if (n.k === 'hr') return '----------------------------------------';
      if (n.k === 'code') return '```' + (n.lang || '') + '\n' + n.text + '\n```';
      if (n.k === 'table') return n.rows.map(([l, v]) => `${l}: ${v}`).join('\n');
      return '';
    }).join('\n\n');
  }

  function missing() {
    const f = S.f;
    const kind = f.decision;
    const m = [];
    if (!ownerName(f) && f.greeting !== 'none') m.push('Ticket owner');
    if (!f.id.trim() && [2, 4].includes(Number(f.model))) m.push('Work item ID'); // only these structures print it
    if (Number(f.model) === 6 && !f.rootCause.trim() && !f.summary.trim() && ['defect', 'duplicate', 'config', 'design'].includes(kind)) m.push('Root cause');
    if (kind === 'duplicate' && !f.dupId.trim()) m.push('Original ticket ID');
    if (kind === 'defect' && f.repro === 'reproduced' && !f.reproDomain.trim()) m.push('Domain where it was reproduced');
    if (kind === 'cannot' && !f.cannotDomain.trim()) m.push('Domain where we tried');
    if (kind === 'info' && !f.infoItems.length && !f.infoExtra.trim()) m.push('Information to request');
    if (kind === 'config' && !f.solution.trim()) m.push('Solution');
    if (f.nextStep === 'custom' && !f.nextCustom.trim()) m.push('Next step');
    return m;
  }

  // Inserted sentences carry [describe ...] text that has to be replaced.
  const badUrl = () => !!(S.f.adoBase.trim() && !safeBase(S.f.adoBase));
  function usedFields() {
    const f = S.f;
    const k = f.decision;
    const six = Number(f.model) === 6;
    const used = ['rootCause', 'summary', 'validation'];
    if (['defect', 'config', 'design'].includes(k)) used.push('solution');
    if (f.secTechnical) used.push('techDetail');
    if (f.secPartner) used.push('tellPartner');
    if (f.secWorkaround) used.push('workaround');
    if (!six || k === 'defect' || k === 'duplicate') used.push('whatNot');
    if (k === 'cannot') used.push('cannotTried');
    if (k === 'info' || k === 'cannot') used.push('infoExtra');
    if (f.nextStep === 'custom') used.push('nextCustom');
    return used;
  }
  const hasPlaceholder = () => usedFields().some((k) => PLACEHOLDER_RE.test(S.f[k] || ''));

  function mismatch() {
    const d = S.detected || {};
    if (!d.decision) return '';
    const theirs = d.decision;
    if (S.f.decision === theirs) return '';
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
    const base = safeBase(f.adoBase);
    const url = id ? (base ? `${base}/_workitems/edit/${id}` : '#' + id) : '';
    const cmd = C.agentCommand();
    const linkOnCommand = !!(cmd && url && base && (C.agentDef(cmd) || {}).takesWorkItem);
    if (cmd) head.push(linkOnCommand ? `${cmd} ${url}` : cmd);
    if (f.platform) head.push(`Platform: ${f.platform}`);
    if (url && !linkOnCommand) head.push(`Work item: ${url}`);
    const fileText = C.fileRequestText();
    return `${head.join('\n')}${head.length ? '\n\n' : ''}Improve the Azure DevOps comment below, written for the support case owner of this ticket.

Rules:
- Keep the structure, the decision, the next step and every fact. Do not add facts that are not in the analysis or the ticket.
- Keep the section headings, their order and the bullet nesting. Keep code blocks (between \`\`\` lines) exactly as written.
${Number(f.model) === 6
  ? '- Keep the names of screens, settings, tables, fields and IDs that the draft uses. Stored procedures, code and file references go only in the technical section.'
  : '- Make the support part plain language: no code, file names, tables or procedure names. Keep those only in the technical part.'}
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
    C.track('comment', null, { platform: f.platform || null, meta: { decision: f.decision, model: Number(f.model), language: f.language, technical: kind !== 'support' && f.secTechnical, via: kind === 'qagent' ? 'qagent' : kind, agent: kind === 'qagent' ? C.agentCommand() : '', file: kind === 'qagent' ? (C.state.settings.fileOut || '') : '' } });
    const miss = missing();
    if (kind === 'qagent') C.toast('Prompt copied. Paste it into QAgent, then copy its answer into ADO.');
    else if (S.decisionPending) C.toast(`Copied, but the report does not state a decision: the comment says "${(DECISIONS.find((x) => x[0] === f.decision) || [])[1] || f.decision}". Pick the decision in step 4 if that is not right.`, 'warn');
    else if (hasPlaceholder()) C.toast('Copied, but replace the text in [brackets] before posting.', 'warn');
    else if (badUrl()) C.toast('Copied. Fix the Azure DevOps project URL so ticket numbers become links.', 'warn');
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

  // The comment being written survives a reload of this tab (sessionStorage is per
  // tab and is emptied when the tab closes); "New comment" and signing out clear it.
  const draftKey = () => `qph:cg:draft:${S.userId != null ? S.userId : ((C.state.user && C.state.user.id) || 0)}`;
  let draftTimer = null;
  function writeDraft() {
    clearTimeout(draftTimer);
    draftTimer = null;
    if (!S.f || S.userId == null) return;
    try { sessionStorage.setItem(draftKey(), JSON.stringify({ f: S.f, detected: S.detected, file: S.file, phi: S.phi, auto: [...S.auto], found: [...S.found], reverted: S.reverted, fromHeader: S.fromHeader, decisionPending: !!S.decisionPending })); } catch (e) { /* storage unavailable */ }
  }
  function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(writeDraft, 400);
  }
  // A reload right after typing must not lose the last keystrokes.
  window.addEventListener('pagehide', () => { if (draftTimer) writeDraft(); });
  function loadDraft() {
    try { const d = JSON.parse(sessionStorage.getItem(draftKey()) || 'null'); return d && d.f ? d : null; } catch (e) { return null; }
  }
  function clearDraft() {
    clearTimeout(draftTimer);
    try { sessionStorage.removeItem(draftKey()); } catch (e) { /* ignore */ }
  }

  async function loadData() {
    S.userId = (C.state.user && C.state.user.id) || 0;
    const [contacts, prefs] = await Promise.all([
      C.api('GET', '/api/contacts').catch(() => ({ team: [], mine: [], canEditTeam: false })),
      C.api('GET', '/api/me/prefs/comment').catch(() => ({ data: {} }))
    ]);
    S.contacts = contacts;
    S.prefs = Object.assign({ presets: [], defaultCc: [] }, prefs.data || {});
    S.f = blankForm();
    if (S.prefs.last) applySnapshot(S.prefs.last);
    S.f.signature = typeof S.prefs.signature === 'string' ? S.prefs.signature : '';
    S.f.adoBase = S.prefs.adoBase || DEFAULT_BASE;
    (S.prefs.defaultCc || []).forEach((n) => { if (!S.f.cc.includes(n)) S.f.cc.push(n); });
    S.f.id = C.varValue('WORK_ITEM_ID');
    S.f.platform = C.varValue('PLATFORM');
    const draft = loadDraft();
    if (draft) {
      const f = blankForm();
      Object.keys(f).forEach((k) => { if (draft.f[k] !== undefined && typeof draft.f[k] === typeof f[k]) f[k] = draft.f[k]; });
      S.f = f;
      applySnapshot(snapshotOf(f, true), true); // repairs values saved by an older version
      S.detected = draft.detected || {};
      S.file = draft.file ? Object.assign({}, draft.file, { restored: true }) : null;
      S.phi = draft.phi || [];
      S.auto = new Set((draft.auto || []).filter((k) => typeof k === 'string'));
      S.found = new Set((draft.found || draft.auto || []).filter((k) => typeof k === 'string'));
      S.reverted = draft.reverted === true;
      S.fromHeader = draft.fromHeader && typeof draft.fromHeader === 'object' ? draft.fromHeader : {};
      S.decisionPending = draft.decisionPending === true;
    }
    S.loaded = true;
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

  // The work item in the page header (shared by every prompt) can differ from the report's.
  function headerNote() {
    const hid = String(C.varValue('WORK_ITEM_ID') || '').replace(/\D/g, '');
    const id = String(S.f.id || '').replace(/\D/g, '');
    return hid && id && hid !== id ? { help: `The work item in the page header is #${hid}; this comment is for #${id}.` } : undefined;
  }
  function foundHTML() {
    const d = S.detected || {};
    // The values the report has (what was filled), even if a field was edited afterwards.
    const short = (k) => {
      if (k === 'id') return `#${d.id}`;
      if (k === 'decision') return (DECISIONS.find((x) => x[0] === d.decision) || [])[1] || '';
      if (k === 'partner' || k === 'platform') return d[k] || '';
      if (k === 'files') return String(lines(d.files).length);
      return '';
    };
    const got = FOUND_LABELS.filter(([k]) => S.found.has(k));
    // For "more information" and "could not reproduce" the root cause is optional ("What we checked").
    const fromHeader = S.reverted ? {} : (S.fromHeader || {});
    const missingCore = FOUND_LABELS.filter(([k]) => CORE_FOUND.includes(k) && !S.found.has(k) && !fromHeader[k] && !(k === 'rootCause' && ['info', 'cannot'].includes(S.f.decision)));
    const headerUsed = [fromHeader.id ? `work item #${C.esc(fromHeader.id)}` : '', fromHeader.platform ? `platform ${C.esc(fromHeader.platform)}` : ''].filter(Boolean);
    const notes = Array.isArray(d.notes) ? d.notes : [];
    const head = !got.length ? 'Nothing could be filled from this report.' : S.reverted ? `In the report (${got.length}), not applied:` : `Filled from the report (${got.length}):`;
    return `<div class="cg-found${S.reverted ? ' is-reverted' : ''}" aria-live="polite">
        <span class="muted">${head}</span>
        ${got.map(([k, l]) => `<span class="cg-chip ok" data-found-key="${k}">${C.icon('check', 'i-sm')}${C.esc(l)}${short(k) ? `: ${C.esc(short(k))}` : ''}</span>`).join('')}
      </div>
      ${missingCore.length ? `<p class="help">Not in the report: ${missingCore.map(([, l]) => C.esc(l)).join(', ')}. Fill ${missingCore.length === 1 ? 'it' : 'them'} in by hand.</p>` : ''}
      ${headerUsed.length ? `<p class="help">The report does not say its ${headerUsed.length === 1 ? (fromHeader.id ? 'work item' : 'platform') : 'work item or platform'}, so the page header's ${headerUsed.join(' and ')} ${headerUsed.length === 1 ? 'is' : 'are'} used. Check that ${headerUsed.length === 1 ? 'it belongs' : 'they belong'} to this ticket.</p>` : ''}
      ${notes.map((n) => `<p class="help">${C.esc(n)}</p>`).join('')}
      ${S.undo ? `<p class="help">The fields of the previous ticket were replaced. <button type="button" class="link" data-act="cg-undo-fill">Undo</button></p>` : ''}
      ${S.reverted && got.length ? `<p class="help">The fields are as they were before this report was added. <button type="button" class="link" data-act="cg-refill">Fill from the report again</button></p>` : ''}`;
  }
  const inserts = (field, keys) => `<div class="cg-inserts" role="group" aria-label="Insert a sentence">${keys.map((k) => `<button type="button" class="btn btn-sm btn-ghost" data-act="cg-insert" data-field="${field}" data-tpl="${k}">${C.icon('plus', 'i-sm')}<span>${C.esc(TEMPLATE_LABELS[k])}</span></button>`).join('')}</div>`;
  const fld = (key, label, input, opts) => `<div class="field${S.auto.has(key) ? ' is-auto' : ''}" data-key="${key}"><label for="cg_${key}">${C.esc(label)}${opts && opts.optional ? '<span class="opt">optional</span>' : ''}${S.auto.has(key) ? '<span class="cg-auto-tag">from the report</span>' : ''}</label>${input}${opts && opts.help ? `<p class="help${opts.helpError ? ' is-error' : ''}">${opts.help}</p>` : ''}</div>`;
  const txt = (key, ph) => `<input id="cg_${key}" data-cg="${key}" type="text" value="${C.esc(S.f[key])}" placeholder="${C.esc(ph || '')}">`;
  const area = (key, rows, ph) => `<textarea id="cg_${key}" data-cg="${key}" rows="${rows}" placeholder="${C.esc(ph || '')}">${C.esc(S.f[key])}</textarea>`;
  const sel = (key, options) => `<select id="cg_${key}" data-cg="${key}">${options.map(([v, l]) => `<option value="${C.esc(v)}" ${String(S.f[key]) === String(v) ? 'selected' : ''}>${C.esc(l)}</option>`).join('')}</select>`;
  const chk = (key, label, sub) => `<label class="switch"><input type="checkbox" id="cg_${key}" data-cg="${key}" ${S.f[key] ? 'checked' : ''}><span><b>${C.esc(label)}</b>${sub ? `<small>${C.esc(sub)}</small>` : ''}</span></label>`;

  function paintForm() {
    const form = document.getElementById('cgForm');
    if (!form) return;
    const f = S.f;
    const d = S.detected || {};
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
          <span>${S.busy ? 'Reading the report…' : S.file ? `<b>${C.esc(S.file.name)}</b> ${S.file.pages ? `· ${S.file.pages} page${S.file.pages === 1 ? '' : 's'}` : ''} · ${S.file.restored ? 'Restored after a reload; add the file again to use it in Improve with QAgent' : 'Choose another file'}` : '<b>Drop the PDF or Word file here</b> or select it'}</span>
        </label>
        ${S.error ? `<p class="form-error" role="alert">${C.esc(S.error)}</p>` : ''}
        ${S.file && !S.busy && !S.file.restored ? foundHTML() : ''}
        ${S.phi.length ? `<p class="callout">${C.icon('shield')}<span>Possible PHI in the report: ${S.phi.map((p) => `${p.count} ${p.label.toLowerCase()}`).join(', ')}. Make sure none of it ends up in the comment.</span></p>` : ''}
        <p class="help">Without a file you can fill in the fields below by hand.</p>
      </section>

      <section class="cg-step" aria-labelledby="cgS2">
        <h2 id="cgS2"><span class="cg-n">2</span>Ticket</h2>
        <div class="two">
          ${fld('id', 'Work item ID', txt('id', '308614'), headerNote())}
          ${fld('platform', 'Platform', sel('platform', [['', 'Choose']].concat(C.D.platforms.map((p) => [p.name, p.name]))))}
        </div>
        ${fld('title', 'Title', txt('title', 'Inactive employees showing in Admin Logging'))}
        <div class="two">
          ${fld('partner', 'Partner', txt('partner', 'SBMH'), { optional: true })}
          ${fld('caseRef', 'Case or CRM', txt('caseRef', 'Case 00575035, TECH-042566'), { optional: true })}
        </div>
        ${fld('adoBase', 'Azure DevOps project URL', txt('adoBase', DEFAULT_BASE), { help: f.adoBase.trim() && !safeBase(f.adoBase) ? 'Use a link that starts with https://, for example https://dev.azure.com/CredibleBH/Sustainment.' : 'Used to turn ticket numbers into links. Saved for next time.', helpError: !!(f.adoBase.trim() && !safeBase(f.adoBase)) })}
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
        ${fld('greeting', 'How to mention the owner', sel('greeting', [['cc', 'In the CC line (team format)'], ['hi', 'Greeting: Hi @Owner,'], ['mention', 'First line: @Owner'], ['none', 'Do not mention the owner']]))}
        ${fld('signature', 'Signature', area('signature', 2, 'Your name\nRole, team'), { optional: true, help: 'Goes just before the CC line. Saved for next time.' })}
      </section>

      <section class="cg-step" aria-labelledby="cgS4">
        <h2 id="cgS4"><span class="cg-n">4</span>Decision</h2>
        <div class="cg-decisions" role="radiogroup" aria-label="Decision">
          ${DECISIONS.map(([v, l]) => `<label class="cg-radio ${f.decision === v ? 'on' : ''}"><input type="radio" id="cg_decision_${v}" name="cgDecision" data-cg="decision" value="${v}" ${f.decision === v ? 'checked' : ''}><span>${C.esc(l)}</span></label>`).join('')}
        </div>
        ${d.verdict ? `<p class="help">The report says: <b>${C.esc(d.verdict)}</b></p>` : ''}
        ${S.decisionPending ? '<p class="help cg-pick">The report does not say which decision it is. Pick one.</p>' : ''}
        ${decisionFields()}
        <div class="two">
          ${fld('nextStep', 'Next step in ADO', sel('nextStep', NEXT_STEPS.map((k) => [k, NEXT_LABELS[k]])), { help: Number(f.model) === 6 && ['config', 'design', 'info'].includes(f.decision) && f.nextAuto ? 'The team format leaves it out for this decision unless you pick a different step.' : '' })}
          ${f.nextStep === 'custom' ? fld('nextCustom', 'Your next step', txt('nextCustom', 'Waiting for the partner’s confirmation')) : ''}
        </div>
      </section>

      <section class="cg-step" aria-labelledby="cgS5">
        <h2 id="cgS5"><span class="cg-n">5</span>Content</h2>
        <p class="help">Filled in from the report when possible. Edit anything; the preview updates as you type.</p>
        ${fld('summary', 'In short (plain language for Support)', area('summary', 3, 'Renaming a Custom Lookup Category saves the wrong employee in Admin Logging.'), { optional: Number(f.model) === 6, help: Number(f.model) === 6 ? 'Used by structures 1 to 5. Root cause, solution, validation uses it only when Root cause is empty.' : '' })}
        ${fld('rootCause', ['info', 'cannot'].includes(f.decision) ? 'What we checked' : 'Root cause', area('rootCause', 5, 'For Client ID 2008, the diagnosis is set as the default for the Adult Outpatient program...'), { help: Number(f.model) === 6 ? `Explained for Support. A single paragraph becomes one bullet per sentence. ${RICH_HELP}` : 'Shown in the technical part.' })}
        ${['config', 'design', 'defect'].includes(f.decision) ? inserts('rootCause', ['notRecent']) : ''}
        ${fld('validation', 'Validation', area('validation', 2, 'Tested in the partner’s test domain and confirmed that new services no longer default to that diagnosis.'), { optional: true, help: `What you tested and confirmed. ${RICH_HELP}` })}
        ${Number(f.model) !== 6 || ['defect', 'duplicate'].includes(f.decision) ? fld('whatNot', 'What it is not', area('whatNot', 2, 'Not caused by the partner’s setup. No setting fixes it.'), { optional: true, help: 'One statement per line.' }) : ''}
        ${chk('secPartner', 'Include "Tell the partner"')}
        ${f.secPartner ? fld('tellPartner', 'Tell the partner', area('tellPartner', 2, 'Category renames in the Admin Log are unreliable until the fix is released.')) : ''}
        ${chk('secWorkaround', 'Include the workaround')}
        ${f.secWorkaround ? fld('workaround', 'Workaround', area('workaround', 2, 'Leave empty to say there is no workaround yet.'), { optional: true }) : ''}
        ${chk('secTechnical', 'Include technical details for Dev and QA')}
        ${f.secTechnical ? `
          ${fld('techDetail', 'Technical explanation', area('techDetail', 6, 'The following stored procedure fills the dropdown:\n```\nEXEC dbo.psp_snomed_by_axis_id\n    @axis_id = 12936\n```\nThe code is in adminActions.aspx.vb, around line 542.'), { optional: true, help: `For Dev and QA: procedures, queries, code and file references. ${RICH_HELP}` })}
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
    // A value kept for another decision (questions while the decision is "Confirmed defect"...) has no field on screen right now.
    form.querySelectorAll('[data-found-key]').forEach((chip) => {
      const k = chip.dataset.foundKey;
      if (S.reverted) { chip.classList.remove('ok'); chip.classList.add('is-kept'); chip.title = 'Not applied. Use "Fill from the report again".'; return; }
      if (k === 'decision' || form.querySelector(`#cg_${k}`)) return;
      chip.classList.remove('ok');
      chip.classList.add('is-kept');
      chip.title = 'Kept from the report. Its field shows when you pick the decision that uses it.';
    });
    window.scrollTo(0, scroll);
    if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus({ preventScroll: true }); if (el.setSelectionRange && typeof el.value === 'string') { try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* ignore */ } } } }
  }

  function decisionFields() {
    const f = S.f;
    switch (f.decision) {
      case 'duplicate':
        return `<div class="cg-sub">
          <div class="two">${fld('dupId', 'Original ticket ID', txt('dupId', '301538'))}${fld('dupReason', 'Why it is a duplicate', sel('dupReason', [['cause', 'Same root cause'], ['steps', 'Same steps and result'], ['both', 'Both']]))}</div>
          ${fld('dupTitle', 'Original ticket title', txt('dupTitle', ''), { optional: true })}</div>`;
      case 'info':
        return `<div class="cg-sub"><p class="field-label">Ask the reporter for</p>
          <div class="cg-checks">${INFO_ITEMS.map(([k]) => ` <label class="cg-check"><input type="checkbox" id="cg_info_${k}" data-cg-info="${k}" ${f.infoItems.includes(k) ? 'checked' : ''}><span>${C.esc(INFO_LABELS.en[k])}</span></label>`).join('')}</div>
          ${fld('infoExtra', 'Other questions for the reporter', area('infoExtra', 3, 'Which billing report and date range shows the doubled totals?'), { optional: true, help: 'One question per line. Questions found in the report are filled in here.' })}
          ${fld('holdDays', 'Business days on hold before closing', `<input id="cg_holdDays" data-cg="holdDays" type="number" min="1" max="30" value="${C.esc(f.holdDays)}">`)}
</div>`;
      case 'config':
        return `<div class="cg-sub">
          ${fld('issueKind', 'Kind of issue', sel('issueKind', ISSUE_KINDS), { help: 'Changes the first line: "This is a configuration issue", "a permissions issue", "a data issue" or "an environment issue".' })}
          ${fld('solution', 'Solution', area('solution', 7, 'If the diagnosis should not be selected by default, remove the program assignment from the diagnosis configuration:\n  Navigate to Client Profile.\n  Open the Diagnosis tab.\n  Under Default for Programs, unselect the program.\n  Click Save.\nAfter this change, newly created services for that program will no longer default to this diagnosis.'), { help: `What to change, with the administrator's steps nested under it, then the result. ${RICH_HELP}` })}
          ${inserts('solution', ['adminSteps', 'relogin'])}</div>`;
      case 'design':
        return `<div class="cg-sub">
          ${fld('solution', 'Suggested solution', area('solution', 5, 'If the partner wants the field to stay empty, the value would need to be set to NULL.\nSupport can coordinate with the DBA team to assist with this update.'), { optional: true, help: `The options the partner has. ${RICH_HELP}` })}
          ${inserts('solution', ['dba', 'enhancement'])}</div>`;
      case 'cannot':
        return `<div class="cg-sub">
          <div class="two">${fld('cannotDomain', 'Domain where we tried', txt('cannotDomain', 'QA domain'))}${fld('cannotRole', 'User role', txt('cannotRole', 'Clinician'), { optional: true })}</div>
          ${fld('cannotTried', 'What we tried', area('cannotTried', 2, 'Saved a Telehealth note with the same service type'), { optional: true })}
          ${fld('infoExtra', 'Questions for the reporter', area('infoExtra', 2, 'Which note type was used when the service type was lost?'), { optional: true, help: 'One question per line, added after the request for steps. Questions found in the report are filled in here.' })}</div>`;
      default:
        return `<div class="cg-sub">
          <div class="two">${fld('confidence', 'Confidence', sel('confidence', [['', 'Not stated'], ['High', 'High'], ['Medium', 'Medium'], ['Low', 'Low']]))}
          ${fld('repro', 'Reproduction', sel('repro', [['code', 'Code analysis only'], ['reproduced', 'Reproduced'], ['pending', 'QA will reproduce it']]))}</div>
          ${f.repro !== 'code' ? `<div class="two">${fld('reproDomain', 'Domain', txt('reproDomain', 'SBMH QA domain'))}${f.repro === 'reproduced' ? fld('reproDate', 'Date', `<input id="cg_reproDate" data-cg="reproDate" type="date" value="${C.esc(f.reproDate)}">`) : ''}</div>` : ''}
          ${f.repro === 'reproduced' ? `${fld('reproRole', 'User role', txt('reproRole', 'Administrator'), { optional: true })}${fld('reproSteps', 'Steps used', area('reproSteps', 3, 'One step per line'), { optional: true })}` : ''}
          ${fld('solution', 'Solution', area('solution', 3, 'Fix requires adding @emp_id to the stored procedure and passing it from lookup.asp.'), { optional: true, help: `What has to change, before the proposed fix list. ${RICH_HELP}` })}</div>`;
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
      ${miss.length ? `<p class="cg-status warn">Still empty: ${C.esc(miss.join(', '))}</p>` : ''}
      ${hasPlaceholder() ? '<p class="cg-status warn">Replace the text in [brackets] before copying.</p>' : ''}
      ${badUrl() ? '<p class="cg-status warn">The Azure DevOps project URL must start with https://, so ticket numbers are not links yet.</p>' : ''}
      ${S.decisionPending ? '<p class="cg-status warn">The report does not state a decision. Pick one in step 4 (the comment shows "Confirmed code defect" until you do).</p>' : ''}
      ${!miss.length && !hasPlaceholder() && !badUrl() && !S.decisionPending ? '<p class="cg-status ok">Ready to paste</p>' : ''}
      ${mismatch() ? `<p class="cg-status warn">The report's verdict is "${C.esc(mismatch())}". Check that Root cause, In short, What it is not, Solution and Tell the partner match the decision you chose.</p>` : ''}
      ${phiOut.length ? `<p class="callout">${C.icon('shield')}<span>The comment may contain PHI: ${phiOut.map((p) => `${p.count} ${p.label.toLowerCase()}`).join(', ')}. Remove it before copying.</span></p>` : ''}
      <div class="cg-paper ${S.view === 'plain' ? 'plain' : ''}">${S.view === 'plain' ? `<pre>${C.esc(text)}</pre>` : html}</div>
      <div class="cg-actions">
        <button type="button" class="btn btn-primary" data-act="cg-copy" data-kind="rich">${C.icon('copy')}<span>Copy comment</span></button>
        <button type="button" class="btn" data-act="cg-copy" data-kind="plain">${C.icon('copy', 'i-sm')}<span>Copy as plain text</span></button>
        <button type="button" class="btn" data-act="cg-copy" data-kind="support">${C.icon('copy', 'i-sm')}<span>Copy Support part only</span></button>
        <button type="button" class="btn btn-ghost" data-act="cg-copy" data-kind="qagent" title="Copies a prompt that asks QAgent to polish this draft">${C.icon('message', 'i-sm')}<span>Improve with QAgent</span></button>
      </div>
      <p class="cg-note">${C.icon('info', 'i-sm')}<span>ADO notifies only the people you pick from its list. After pasting, retype <b>@</b> before each name and choose the person.</span></p>
      <p class="cg-note">${C.icon('info', 'i-sm')}<span>Plain text uses <code>*</code> bullets and <code>\`\`\`</code> code blocks, so ADO's Markdown editor shows it as lists and code. The formatted copy suits the rich text editor.</span></p>
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
      <ul class="cg-plist">${ps.map((p, i) => `<li class="cg-prow"><span><b>${C.esc(p.name)}</b><small> · ${C.esc((DECISIONS.find((x) => x[0] === applySnapshot(p.data, true, blankForm()).decision) || [])[1])}, model ${C.esc(applySnapshot(p.data, true, blankForm()).model)}</small></span><span></span>
        <button type="button" class="icon-btn sm" data-act="cg-del-preset" data-i="${i}" aria-label="Delete ${C.esc(p.name)}">${C.icon('trash', 'i-sm')}</button></li>`).join('') || '<li class="muted">No presets.</li>'}</ul>`);
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */
  const onPage = () => !!document.getElementById('cgForm');

  function setField(key, value) {
    const f = S.f;
    if (key === 'model' || key === 'holdDays') value = Number(value) || (key === 'model' ? 6 : 5);
    f[key] = value;
    // A new decision brings its own default next step.
    if (key === 'decision') { f.nextStep = DEFAULT_NEXT[value]; f.nextAuto = true; f.nextCustom = ''; S.decisionPending = false; }
    if (key === 'nextStep') f.nextAuto = value === DEFAULT_NEXT[f.decision];
    if (key === 'signature' || key === 'adoBase') saveLast();
  }

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!onPage() || !t.matches('[data-cg]') || t.type === 'checkbox' || t.type === 'radio' || t.tagName === 'SELECT') return;
    setField(t.dataset.cg, t.value);
    saveDraft();
    if (S.auto.has(t.dataset.cg)) {
      // Edited by hand: no longer marked as coming from the report.
      S.auto.delete(t.dataset.cg);
      const field = t.closest('.field');
      if (field) { field.classList.remove('is-auto'); const tag = field.querySelector('.cg-auto-tag'); if (tag) tag.remove(); }
    }
    if (t.dataset.cg === 'adoBase') {
      const help = t.closest('.field').querySelector('.help');
      const bad = t.value.trim() && !safeBase(t.value);
      if (help) { help.textContent = bad ? 'Use a link that starts with https://, for example https://dev.azure.com/CredibleBH/Sustainment.' : 'Used to turn ticket numbers into links. Saved for next time.'; help.classList.toggle('is-error', !!bad); }
    }
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
      if (p) { applySnapshot(p.data, true); saveDraft(); C.toast(`Preset "${p.name}" applied`); paintAll(); }
      return;
    }
    if (t.matches('[data-cg-info]')) {
      const k = t.dataset.cgInfo;
      S.f.infoItems = t.checked ? [...new Set([...S.f.infoItems, k])] : S.f.infoItems.filter((x) => x !== k);
      INFO_ITEMS.forEach(([key]) => { if (!S.f.infoItems.includes(key)) return; });
      S.f.infoItems = INFO_ITEMS.map(([key]) => key).filter((key) => S.f.infoItems.includes(key));
      saveDraft(); saveLast();
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
    // Text fields were already handled by the input event. Redrawing here, when the
    // field loses focus, would replace the button the person is clicking.
    if (t.type !== 'checkbox' && t.type !== 'radio' && t.tagName !== 'SELECT') return;
    const key = t.dataset.cg;
    const value = t.type === 'checkbox' ? t.checked : t.value;
    setField(key, value);
    S.auto.delete(key);
    saveDraft();
    saveLast(); // remember the configuration for the next comment
    paintForm();
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

  // Space on the decision that is already selected confirms it too (a checked radio sends no click then).
  document.addEventListener('keydown', (e) => {
    const radio = e.target && e.target.matches && e.target.matches('input[name="cgDecision"]') ? e.target : null;
    if (radio && (e.key === ' ' || e.key === 'Enter') && S.decisionPending && radio.value === S.f.decision) { e.preventDefault(); S.decisionPending = false; saveDraft(); paintAll(); }
  });
  document.addEventListener('click', async (e) => {
    // Clicking the decision that is already selected confirms it when the report did not state one.
    const radio = e.target.closest && e.target.closest('input[name="cgDecision"]');
    if (radio && S.decisionPending && radio.value === S.f.decision) { S.decisionPending = false; saveDraft(); paintAll(); return; }
    const el = e.target.closest('[data-act^="cg-"]');
    if (!el || !C) return;
    const act = el.dataset.act;
    switch (act) {
      case 'cg-copy': e.preventDefault(); doCopy(el.dataset.kind, el); break;
      case 'cg-view': S.view = el.dataset.view; paintPreview(); break;
      case 'cg-undo-fill': {
        if (!S.undo) return;
        S.f = Object.assign(blankForm(), S.undo);
        S.undo = null;
        S.auto = new Set();
        S.fromHeader = {};
        S.reverted = true;
        S.decisionPending = false;
        saveDraft();
        paintAll();
        C.toast('The fields are back as they were before the report was added.');
        break;
      }
      case 'cg-refill': {
        if (!S.file || !S.detected) return;
        applyDetected(S.detected, S.file.name);
        saveDraft();
        paintAll();
        C.toast(`Filled ${S.found.size} field${S.found.size === 1 ? '' : 's'} from the report again.`);
        break;
      }
      case 'cg-insert': {
        const field = el.dataset.field;
        const tpl = (TEMPLATES[S.f.language] || TEMPLATES.en)[el.dataset.tpl];
        if (!tpl || !(field in S.f)) return;
        let current = String(S.f[field] || '').replace(/\s+$/, '');
        const flat = (t) => t.replace(/^[ \t]*([-*•]|\d{1,2}[.)])[ \t]+/gm, '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (current && flat(current).includes(flat(tpl))) { C.toast('That text is already there.'); return; }
        // Root cause shows a paragraph one sentence per bullet; keep that when a line is added.
        if (field === 'rootCause' && current && !/\n|```/.test(current)) current = sentences(current).join('\n');
        const value = current ? `${current}\n${tpl}` : tpl;
        setField(field, value);
        saveDraft();
        paintForm(); paintPreview();
        const ta = document.getElementById('cg_' + field);
        if (ta) {
          ta.focus();
          const at = ta.value.search(PLACEHOLDER_RE);
          if (at >= 0) { const close = ta.value.indexOf(']', at); ta.setSelectionRange(at, close + 1); } else ta.setSelectionRange(ta.value.length, ta.value.length);
        }
        break;
      }
      case 'cg-cc-add': {
        const input = document.getElementById('cg_ccInput');
        const name = String(input.value || '').replace(/^@+/, '').trim();
        if (!name) { input.focus(); return; }
        if (!known(name)) {
          try { await addContact({ name }); C.toast(`${name} added to your people`); } catch (err) { if (err.code !== 'exists') { C.toast(err.message, 'warn'); return; } }
        }
        if (!S.f.cc.some((n) => n.toLowerCase() === name.toLowerCase())) S.f.cc.push(name);
        saveDraft();
        paintForm(); paintPreview();
        const again = document.getElementById('cg_ccInput'); if (again) again.focus();
        break;
      }
      case 'cg-cc-remove': S.f.cc.splice(Number(el.dataset.i), 1); saveDraft(); paintForm(); paintPreview(); break;
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
        S.f = blankForm();
        if (S.prefs.last) applySnapshot(S.prefs.last);
        (S.prefs.defaultCc || []).forEach((n) => { if (!S.f.cc.includes(n)) S.f.cc.push(n); }); // same start as opening the page
        S.f.id = C.varValue('WORK_ITEM_ID');
        S.f.platform = C.varValue('PLATFORM');
        S.f.signature = typeof S.prefs.signature === 'string' ? S.prefs.signature : '';
        S.f.adoBase = S.prefs.adoBase || DEFAULT_BASE;
        S.file = null; S.blocks = []; S.text = ''; S.detected = {}; S.phi = []; S.error = '';
        S.auto = new Set(); S.found = new Set(); S.reverted = false; S.fromHeader = {}; S.undo = null; S.decisionPending = false;
        clearDraft();
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
      const entry = { name, data: snapshotOf(S.f, true) };
      if (i >= 0) ps[i] = entry; else ps.push(entry);
      if (ps.length > 20) ps.shift();
      await savePrefs();
      C.closeModal();
      C.toast(`Preset "${name}" saved`);
      paintPresets();
    }
  });

  function reset() {
    clearTimeout(draftTimer);
    draftTimer = null;
    try { Object.keys(sessionStorage).filter((k) => k.startsWith('qph:cg:draft:')).forEach((k) => sessionStorage.removeItem(k)); } catch (e) { /* storage unavailable */ }
    Object.assign(S, { userId: null, auto: new Set(), found: new Set(), reverted: false, fromHeader: {}, decisionPending: false, undo: null, file: null, text: '', blocks: [], detected: {}, phi: [], busy: false, error: '', contacts: { team: [], mine: [], canEditTeam: false }, prefs: {}, loaded: false, f: null, view: 'rich' });
  }

  window.QPHComment = { render, reset, _test: { detect, buildSections, compose: (o) => compose(o), toText, toHTML, phiFindings, state: S } };
})();

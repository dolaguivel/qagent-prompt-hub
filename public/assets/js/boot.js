/* Applies the saved theme before first paint to avoid a flash. */
(function () {
  try {
    var t = localStorage.getItem('qph:theme') || 'system';
    if (t === 'system') t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: keep the default */ }
})();

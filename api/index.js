'use strict';
/*
 * Vercel entry point. vercel.json sends every /api/* request (and /healthz)
 * here; the static app in public/ is served by Vercel's CDN.
 * Requires DATABASE_URL (Postgres), for example from Neon in the Vercel Marketplace.
 */
const app = require('../server/app');

// vercel.json also passes the original path as ?__path=..., so routing works
// whether or not the platform keeps the original URL in req.url after the rewrite.
function restoreUrl(req) {
  const u = new URL(req.url || '/', 'http://localhost');
  const original = u.searchParams.get('__path');
  if (original === null) return;
  u.searchParams.delete('__path');
  const query = u.searchParams.toString();
  const rewritten = /^\/api\/index(\.js)?\/?$/.test(u.pathname) || u.pathname === '/api';
  const valid = /^\/(api\/[A-Za-z0-9._\-/]*|healthz)$/.test(original);
  req.url = (rewritten && valid ? original : u.pathname) + (query ? '?' + query : '');
}

module.exports = (req, res) => {
  restoreUrl(req);
  return app.handle(req, res);
};

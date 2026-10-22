'use strict';
/*
 * Standalone server: serves the web app from public/ and the API from
 * server/app.js. Use it on a company server, a VM, Docker or a PC.
 * (On Vercel, public/ is served by the CDN and api/index.js runs the API.)
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const app = require('./app');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};

function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (e) { return app.send(res, 400, 'Bad request', { 'Content-Type': 'text/plain' }); }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(config.PUBLIC_DIR, rel));
  if (!file.startsWith(config.PUBLIC_DIR + path.sep)) return app.send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain' });
  let stat;
  try { stat = fs.statSync(file); } catch (e) { stat = null; }
  if (!stat || !stat.isFile()) return app.send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
  const ext = path.extname(file).toLowerCase();
  const lastModified = stat.mtime.toUTCString();
  const vendor = rel.startsWith('/assets/vendor/');
  const headers = {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Last-Modified': lastModified,
    'Cache-Control': ext === '.png' || vendor ? 'public, max-age=604800' : 'no-cache'
  };
  if (req.headers['if-modified-since'] === lastModified) return app.send(res, 304, '', headers);
  res.writeHead(200, Object.assign({}, app.SECURITY_HEADERS, headers, { 'Content-Length': stat.size }));
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

async function start() {
  await app.ready;
  if (app.getInitError()) {
    console.error('The hub could not start. Fix the problem above and try again.');
    process.exit(1);
  }
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname.startsWith('/api/') || pathname === '/healthz') return app.handle(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return app.send(res, 405, 'Method not allowed');
    return serveStatic(req, res, pathname);
  });
  server.listen(config.port, config.host, () => {
    console.log(`QAgent Prompt Hub running at http://localhost:${config.port}`);
    console.log(`Database: ${app.getDb().describe}${config.demo ? ' (demo data)' : ''}`);
  });
  const shutdown = () => {
    server.close(async () => { try { await app.getDb().close(); } catch (e) { /* ignore */ } process.exit(0); });
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) start();

module.exports = { start };

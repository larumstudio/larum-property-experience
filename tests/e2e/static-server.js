'use strict';
/* ── LPE-12 · Static file server for Playwright / Lighthouse ──────────
   Zero-dependency Node.js static server.  Strips query strings so
   cache-busted URLs (script.js?v=14) resolve to the bare file.
   Used by playwright.config.js webServer and lpe-12-lighthouse.js.
   ──────────────────────────────────────────────────────────────────── */
const http = require('node:http');
const fs   = require('node:fs');
const path = require('node:path');

const PORT = parseInt(process.env.LPE_PORT || '4173', 10);
const ROOT = path.resolve(__dirname, '..', '..');

const MIME = {
  '.html':  'text/html; charset=utf-8',
  '.js':    'application/javascript; charset=utf-8',
  '.mjs':   'application/javascript; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.json':  'application/json; charset=utf-8',
  '.svg':   'image/svg+xml',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.webp':  'image/webp',
  '.ico':   'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff':  'font/woff',
  '.ttf':   'font/ttf',
  '.mp4':   'video/mp4',
  '.txt':   'text/plain',
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0].split('#')[0] || '/';
  let filePath  = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);

  // Prevent path traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  // Directory → index.html
  try {
    if (fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch { /* file doesn't exist — will 404 below */ }

  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Not found: ${urlPath}`);
      return;
    }
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () =>
    console.log(`LPE-12 static server: http://localhost:${PORT}`)
  );
  process.on('SIGTERM', () => server.close());
  process.on('SIGINT',  () => server.close());
}

module.exports = { server, PORT, ROOT };

// A tiny static file server with no dependencies, so the game can run where a tool expects
// `npm run dev` / `npm start` (e.g. Google AI Studio). The real site needs none of this:
// GitHub Pages and workers.dev serve the files as they are.
// Only the game's own files are served: no dotfiles, no android/, test/, docs/, tools/,
// node_modules/, and only the public pages at the root.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = +process.env.PORT || 3000;
const PAGES = new Set(['index.html', '404.html', 'gizlilik.html', 'cerezler.html', 'kosullar.html']);
const HIDDEN = new Set(['android', 'test', 'docs', 'tools', 'node_modules']);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8'
};

function allowed(parts) {
  if (!parts.length) return true;
  if (parts.some((p) => p.startsWith('.'))) return false;
  if (parts.length === 1) return PAGES.has(parts[0]) || !parts[0].endsWith('.html') && !/\.(md|toml|mjs)$/.test(parts[0]) && parts[0] !== 'package.json' && parts[0] !== 'metadata.json';
  return !HIDDEN.has(parts[0]);
}

async function send(res, file, code = 200) {
  const body = await readFile(file);
  res.writeHead(code, { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(body);
}

createServer(async (req, res) => {
  try {
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { path = '/'; }
    const parts = path.split('/').filter(Boolean);
    const file = resolve(ROOT, ...parts);
    if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }
    if (allowed(parts)) {
      const s = await stat(file).catch(() => null);
      if (s && s.isFile()) return await send(res, file);
      if (s && s.isDirectory() && parts.length === 0) return await send(res, resolve(ROOT, 'index.html'));
    }
    // like the workers.dev site: unknown page paths (/oyun/gorevler…) get the game, missing files get 404
    if (!extname(path)) return await send(res, resolve(ROOT, 'index.html'));
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  } catch (e) {
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('Server error');
  }
}).listen(PORT, '0.0.0.0', () => console.log('Kuşatma on http://localhost:' + PORT));

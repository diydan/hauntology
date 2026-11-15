// A tiny static server for the playtest pages. Binds to 127.0.0.1 only (a phone cannot reach this directly;
// see README.md for the https route you need on a phone). Usage: node tools/puzzle-playtest/serve.mjs [port]
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.argv[2]) || 8787;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.md': 'text/plain; charset=utf-8' };
const SKIP = new Set(['test', 'node_modules']);

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(root, p));
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end('forbidden'); return; }
    if (SKIP.has(file.slice(root.length + 1).split(sep)[0])) { res.writeHead(404).end('not found'); return; }
    const s = await stat(file);
    if (!s.isFile()) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('not found');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Puzzle playtest on http://127.0.0.1:${port}/  (this machine only)`));

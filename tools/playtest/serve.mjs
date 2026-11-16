// A tiny static server for the playtest pages. Binds to 127.0.0.1 only (a phone cannot reach this directly;
// see README.md for the https route you need on a phone).
// Usage: node serve.mjs [port]            the source files (no /design/)
//        node serve.mjs [port] --dist     the built site (run `node build.mjs` first): /design/, /media/ and every page as deployed
// It answers byte ranges, which Safari needs before it will play a video.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRange } from './src/range.js';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const args = process.argv.slice(2);
const root = args.includes('--dist') ? resolve(here, 'dist') : here;
const port = Number(args.find((a) => /^\d+$/.test(a))) || 8787;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.m4a': 'audio/mp4',
  '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};
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
    const head = { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store', 'accept-ranges': 'bytes' };
    const body = await readFile(file);
    if (req.headers.range) {
      const r = parseRange(req.headers.range, body.length);
      if (!r) { res.writeHead(416, { ...head, 'content-range': `bytes */${body.length}` }).end(); return; }
      res.writeHead(206, { ...head, 'content-range': `bytes ${r[0]}-${r[1]}/${body.length}`, 'content-length': r[1] - r[0] + 1 });
      res.end(req.method === 'HEAD' ? undefined : body.subarray(r[0], r[1] + 1));
      return;
    }
    res.writeHead(200, { ...head, 'content-length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Puzzle playtest (${root === here ? 'source files' : 'dist'}) on http://127.0.0.1:${port}/  (this machine only)`));

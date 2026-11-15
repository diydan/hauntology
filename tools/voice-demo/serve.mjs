#!/usr/bin/env node
// A read-only local server for the Pippa play-through demo (tools/voice-demo). It binds to 127.0.0.1 only, answers only GET and HEAD,
// serves four fixed files and the audio of the Library folder, and nothing else. It calls no model, spends nothing and writes nothing.
// Usage: node tools/voice-demo/serve.mjs [--port 8780] [--lib DIR]      (DIR defaults to $VOICE_LIBRARY_DIR or ./.voice-library)
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, createReadStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEAKER_BANK_TARGETS, parseSpeakerLines } from '../lib/story-banks.mjs';
import { buildSequence, hashOf } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
export const AUDIO_PATH = /^\/audio\/([0-9a-f]{64})\.mp3$/;
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/page.mjs': ['page.mjs', 'text/javascript; charset=utf-8'],
  '/lib.mjs': ['lib.mjs', 'text/javascript; charset=utf-8'],
};
const HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self'; connect-src 'self'; img-src 'self' data:",
};

/** The rows of the Whisper and Keeper banks, from the story markdown. */
export const loadRows = () => SPEAKER_BANK_TARGETS.flatMap((t) => parseSpeakerLines(readFileSync(join(root, t.source), 'utf8')));
export const loadManifest = () => JSON.parse(readFileSync(join(root, 'shared/fixtures/voice-library.json'), 'utf8'));

/**
 * @param {{ libDir: string, manifest: any, rows: any[], voice?: string }} o
 * @returns {import('node:http').Server}
 */
export function createDemoServer({ libDir, manifest, rows, voice = 'inworld:Pippa' }) {
  // Only the audio of the voice being demonstrated, and only by the hash a manifest entry names: nothing else on disk is reachable.
  const allowed = new Set(manifest.entries.filter((e) => e.voice === voice).map((e) => hashOf(e.key)));
  const fileOf = (hash) => join(libDir, `${hash}.take1.mp3`);
  const sequence = () => buildSequence({ manifest, rows, voice, hasFile: (h) => existsSync(fileOf(h)) });

  return createServer((req, res) => {
    const send = (status, headers, body) => { res.writeHead(status, { ...HEADERS, ...headers }); res.end(req.method === 'HEAD' ? undefined : body); };
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { allow: 'GET, HEAD' }, 'GET only');
    const path = (req.url ?? '/').split('?')[0];

    if (Object.hasOwn(STATIC, path)) {
      const [file, type] = STATIC[path];
      return send(200, { 'content-type': type, 'cache-control': 'no-store' }, readFileSync(join(here, file)));
    }
    if (path === '/sequence.json') return send(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }, JSON.stringify(sequence()));

    const m = AUDIO_PATH.exec(path);
    if (m && allowed.has(m[1]) && existsSync(fileOf(m[1]))) {
      const file = fileOf(m[1]);
      const size = statSync(file).size;
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
      let [start, end] = [0, size - 1];
      if (range && (range[1] !== '' || range[2] !== '')) {
        if (range[1] === '') { start = Math.max(0, size - Number(range[2])); } else { start = Number(range[1]); if (range[2] !== '') end = Math.min(end, Number(range[2])); }
        if (!(start <= end && start < size)) return send(416, { 'content-range': `bytes */${size}` }, 'range not satisfiable');
      }
      const partial = start !== 0 || end !== size - 1;
      res.writeHead(partial ? 206 : 200, { ...HEADERS, 'content-type': 'audio/mpeg', 'accept-ranges': 'bytes', 'content-length': end - start + 1, 'cache-control': 'no-store', ...(partial ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}) });
      if (req.method === 'HEAD') return res.end();
      return createReadStream(file, { start, end }).pipe(res);
    }
    return send(404, { 'content-type': 'text/plain' }, 'not found');
  });
}

/** Start listening on this machine only (127.0.0.1), never on every interface. */
export const listenLocal = (server, port) => new Promise((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', () => ok(server)); });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
  const port = Number(arg('--port', '8780'));
  const libDir = resolve(arg('--lib', process.env.VOICE_LIBRARY_DIR ?? join(root, '.voice-library')));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) { console.error('voice-demo: --port must be a whole number from 1024 to 65535'); process.exit(1); }
  const manifest = loadManifest();
  const seq = buildSequence({ manifest, rows: loadRows(), hasFile: (h) => existsSync(join(libDir, `${h}.take1.mp3`)) });
  const voiced = seq.lines.filter((l) => l.spoken);
  const present = voiced.flatMap((l) => l.variants).filter((v) => v.present).length;
  const total = voiced.flatMap((l) => l.variants).length;
  await listenLocal(createDemoServer({ libDir, manifest, rows: loadRows() }), port).catch((e) => { console.error(`voice-demo: could not listen on 127.0.0.1:${port}: ${e.message}`); process.exit(1); });
  console.log(`Pippa play-through: http://127.0.0.1:${port}   (audio folder: ${libDir})`);
  console.log(`${voiced.length} voiced lines, ${present} of ${total} line variants have audio; ${seq.holes.length} holes in the Library.`);
}

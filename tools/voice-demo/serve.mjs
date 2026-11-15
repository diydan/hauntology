#!/usr/bin/env node
// A read-only local server for the play-through demo (tools/voice-demo). It binds to 127.0.0.1 only, answers only GET and HEAD, serves
// three fixed page files, the Library audio, the character portraits and the lip-synced clips, and nothing else. It calls no model, spends
// nothing and writes nothing. Audio is reached only by a hash the manifest names; a portrait or a clip only by a name in a fixed list.
// Usage: node tools/voice-demo/serve.mjs [--port 8780] [--lib DIR] [--art DIR]
//   --lib  the rendered audio (default $VOICE_LIBRARY_DIR or ./.voice-library)
//   --art  the portraits and clips (default ./docs/story/art, which is not in git: without it the demo shows an orb and plays audio only)
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, createReadStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEAKER_BANK_TARGETS, parseLodgerLines, parseSpeakerLines } from '../lib/story-banks.mjs';
import { CHARACTERS, CLIPS, DEMO_ONLY, buildSequence, hashOf } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
export const AUDIO_PATH = /^\/audio\/([0-9a-f]{64})\.mp3$/;
export const AVATAR_PATH = /^\/avatar\/([a-z]+)\.webp$/;
export const CLIP_PATH = /^\/clip\/([a-z0-9-]+)\.mp4$/;
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
/** The only portrait ids and clip names that can be asked for. */
export const AVATAR_IDS = new Set(Object.keys(CHARACTERS));
export const CLIP_NAMES = new Set([...Object.values(CLIPS), ...DEMO_ONLY.map((d) => d.clip)]);

/** All story lines of the Whisper, the Keeper and the Lodger, from the markdown (the Lodger rows get suffix `lodger`). */
export function loadRows() {
  const speakers = SPEAKER_BANK_TARGETS.flatMap((t) => parseSpeakerLines(readFileSync(join(root, t.source), 'utf8')));
  const lodger = parseLodgerLines(readFileSync(join(root, 'docs/story/lodger-lines.md'), 'utf8')).map((l) => ({ id: l.id, kind: l.kind, suffix: 'lodger', speaker: 'lodger', text: l.text, spoken: l.spoken, review: l.review }));
  return [...speakers, ...lodger];
}
export const loadManifest = () => JSON.parse(readFileSync(join(root, 'shared/fixtures/voice-library.json'), 'utf8'));

/**
 * @param {{ libDir: string, artDir: string, manifest: any, rows: any[] }} o
 * @returns {import('node:http').Server}
 */
export function createDemoServer({ libDir, artDir, manifest, rows }) {
  const allowedAudio = new Set(manifest.entries.map((e) => hashOf(e.key)));
  const audioFile = (hash) => join(libDir, `${hash}.take1.mp3`);
  const avatarFile = (id) => join(artDir, 'cutouts', `color-${id}-head.webp`);
  const clipFile = (name) => join(artDir, 'clips', `${name}.mp4`);

  const sequence = () => ({
    ...buildSequence({ manifest, rows, hasFile: (h) => existsSync(audioFile(h)) }),
    characters: Object.fromEntries(Object.entries(CHARACTERS).map(([id, c]) => [id, { ...c, present: existsSync(avatarFile(id)) }])),
    clips: Object.fromEntries(Object.entries(CLIPS).map(([key, name]) => [key, { name, present: existsSync(clipFile(name)) }])),
    demoOnly: DEMO_ONLY.map((d) => ({ ...d, present: existsSync(clipFile(d.clip)) })),
  });

  return createServer((req, res) => {
    const send = (status, headers, body) => { res.writeHead(status, { ...HEADERS, ...headers }); res.end(req.method === 'HEAD' ? undefined : body); };
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { allow: 'GET, HEAD' }, 'GET only');
    const path = (req.url ?? '/').split('?')[0];

    /** Serve a file with byte ranges (a video or an audio element asks for them), or 404 / 416. */
    const serveFile = (file, type) => {
      const size = statSync(file).size;
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
      let [start, end] = [0, size - 1];
      if (range && (range[1] !== '' || range[2] !== '')) {
        if (range[1] === '') start = Math.max(0, size - Number(range[2]));
        else { start = Number(range[1]); if (range[2] !== '') end = Math.min(end, Number(range[2])); }
        if (!(start <= end && start < size)) return send(416, { 'content-range': `bytes */${size}` }, 'range not satisfiable');
      }
      const partial = start !== 0 || end !== size - 1;
      res.writeHead(partial ? 206 : 200, { ...HEADERS, 'content-type': type, 'accept-ranges': 'bytes', 'content-length': end - start + 1, 'cache-control': 'no-store', ...(partial ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}) });
      if (req.method === 'HEAD') return res.end();
      return createReadStream(file, { start, end }).pipe(res);
    };

    if (Object.hasOwn(STATIC, path)) {
      const [file, type] = STATIC[path];
      return send(200, { 'content-type': type, 'cache-control': 'no-store' }, readFileSync(join(here, file)));
    }
    if (path === '/sequence.json') return send(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }, JSON.stringify(sequence()));

    const audio = AUDIO_PATH.exec(path);
    if (audio && allowedAudio.has(audio[1]) && existsSync(audioFile(audio[1]))) return serveFile(audioFile(audio[1]), 'audio/mpeg');
    const avatar = AVATAR_PATH.exec(path);
    if (avatar && AVATAR_IDS.has(avatar[1]) && existsSync(avatarFile(avatar[1]))) return serveFile(avatarFile(avatar[1]), 'image/webp');
    const clip = CLIP_PATH.exec(path);
    if (clip && CLIP_NAMES.has(clip[1]) && existsSync(clipFile(clip[1]))) return serveFile(clipFile(clip[1]), 'video/mp4');
    return send(404, { 'content-type': 'text/plain' }, 'not found');
  });
}

/** Start listening on this machine only (127.0.0.1), never on every interface. */
export const listenLocal = (server, port) => new Promise((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', () => ok(server)); });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
  const port = Number(arg('--port', '8780'));
  const libDir = resolve(arg('--lib', process.env.VOICE_LIBRARY_DIR ?? join(root, '.voice-library')));
  const artDir = resolve(arg('--art', join(root, 'docs/story/art')));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) { console.error('voice-demo: --port must be a whole number from 1024 to 65535'); process.exit(1); }
  const manifest = loadManifest();
  const rows = loadRows();
  const seq = buildSequence({ manifest, rows, hasFile: (h) => existsSync(join(libDir, `${h}.take1.mp3`)) });
  const voiced = seq.lines.filter((l) => l.spoken);
  const variants = voiced.flatMap((l) => l.variants);
  await listenLocal(createDemoServer({ libDir, artDir, manifest, rows }), port).catch((e) => { console.error(`voice-demo: could not listen on 127.0.0.1:${port}: ${e.message}`); process.exit(1); });
  const portraits = Object.keys(CHARACTERS).filter((id) => existsSync(join(artDir, 'cutouts', `color-${id}-head.webp`))).length;
  const clips = [...CLIP_NAMES].filter((n) => existsSync(join(artDir, 'clips', `${n}.mp4`))).length;
  console.log(`Play-through: http://127.0.0.1:${port}   (audio: ${libDir}; art: ${artDir})`);
  console.log(`${voiced.length} voiced lines, ${variants.filter((v) => v.present).length} of ${variants.length} line variants have audio, ${seq.holes.length} holes in the Library; ${portraits} of ${Object.keys(CHARACTERS).length} portraits, ${clips} of ${CLIP_NAMES.size} clips.`);
}

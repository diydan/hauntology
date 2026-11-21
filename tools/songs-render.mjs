#!/usr/bin/env node
// Owner-run: plans and makes the Stock Songs (game-songs task 5.2). The default is a DRY RUN: it lists what is missing and spends nothing.
// --render makes real songs with the Song Service (Mureka) and costs credit, so it needs a key in $MUREKA_API_KEY (the environment only; this
// tool never reads a .env file), and --max-songs N, a hard stop. Songs are made one at a time, in catalogue order, with no retry, and the run
// stops at the first problem. Each finished song is saved as <out>/<id>.mp3 with <id>.json (the prompt, the captions and the task id), and
// songs already there are skipped, so a run can be repeated. Nothing is committed or uploaded.
//
// Usage: node tools/songs-render.mjs [--dry-run] [--only id,id] [--out DIR] [--list]
//        MUREKA_API_KEY=... node tools/songs-render.mjs --render --max-songs 3 [--only title,lobby] [--out DIR]
//   --out    the folder (default web/public/sounds/songs, where the app looks for Stock Songs)
//   --only   only these song ids
//   --list   print every song that would be made
// The price of one song is NOT known (the API does not say; see docs/spikes/songs-1.md): count songs, then check the Mureka dashboard.
// Exit: 0 ok, 1 bad input or a render that stopped early.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSharedFiles } from './lib/load-shared.mjs';
import { makeSong, MAX_SONGS_PER_RUN, planSongs, recordOf } from './lib/songs-render.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (m, code = 1) => { console.error(`songs-render: ${m}`); process.exit(code); };
const WITH_VALUE = ['--only', '--out', '--max-songs'];
const FLAGS = ['--dry-run', '--render', '--list', '--help', ...WITH_VALUE];

const opts = { render: false, list: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (!FLAGS.includes(a)) fail(`unknown option ${JSON.stringify(a)} (try --help)`);
  if (a === '--help') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); process.exit(0); }
  if (a === '--render') opts.render = true;
  else if (a === '--list') opts.list = true;
  else if (WITH_VALUE.includes(a)) { const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) fail(`${a} needs a value`); opts[a.slice(2)] = v; i += 1; }
}
if (opts.render && argv.includes('--dry-run')) fail('--render and --dry-run cannot be used together');
const maxSongs = opts['max-songs'] === undefined ? null : Number(opts['max-songs']);
if (maxSongs !== null && (!Number.isInteger(maxSongs) || maxSongs < 1 || maxSongs > MAX_SONGS_PER_RUN)) fail(`--max-songs must be a whole number from 1 to ${MAX_SONGS_PER_RUN}`);
if (opts.render && maxSongs === null) fail('--render needs --max-songs N (a hard stop). Nothing was spent.');
const only = opts.only === undefined ? null : opts.only.split(',').map((s) => s.trim()).filter(Boolean);
const out = resolve(opts.out ?? join(root, 'web', 'public', 'sounds', 'songs'));

const [stock] = await loadSharedFiles(['songs/stock.ts'], root);
const songs = stock.STOCK_SONGS;
if (only !== null) for (const id of only) if (!songs.some((s) => s.id === id)) fail(`no Stock Song with the id ${JSON.stringify(id)}`);
const plan = planSongs(songs, out, { ...(maxSongs !== null ? { limit: maxSongs } : {}), only });

console.log(`${plan.total} songs in the list, ${plan.have} already in ${out}, ${plan.total - plan.have} missing.`);
if (opts.list || !opts.render) for (const s of plan.todo) console.log(`  would make ${s.id} (${s.kind}) "${s.title}"${s.lyrics === null ? ' [instrumental]' : ''}`);
if (!opts.render) { console.log(`Dry run: nothing was spent. To make ${Math.min(plan.todo.length, maxSongs ?? plan.todo.length)}: MUREKA_API_KEY=... node tools/songs-render.mjs --render --max-songs N`); process.exit(0); }

const apiKey = process.env.MUREKA_API_KEY ?? '';
if (apiKey.trim() === '') fail('--render needs MUREKA_API_KEY in the environment. Nothing was spent.');
mkdirSync(out, { recursive: true });
let made = 0;
for (const song of plan.todo) {
  console.log(`making ${song.id} ...`);
  const r = await makeSong({ fetch, apiKey, song });
  if (!r.ok) { console.error(`stopped at ${song.id}: ${r.reason}${r.taskId ? ` (task ${r.taskId})` : ''}. ${made} made, no retry.`); process.exit(1); }
  writeFileSync(join(out, `${song.id}.mp3`), r.audio);
  writeFileSync(join(out, `${song.id}.json`), `${JSON.stringify(recordOf(song, { taskId: r.taskId, makeMs: r.durationMs, bytes: r.audio.byteLength }), null, 2)}\n`);
  made += 1;
  console.log(`  saved ${song.id}.mp3 (${r.audio.byteLength} bytes, ${Math.round(r.durationMs / 1000)} s)`);
}
console.log(`${made} songs made (${plan.left} still missing). Check the credit used on the Mureka dashboard.`);

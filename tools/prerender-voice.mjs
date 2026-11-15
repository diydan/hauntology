#!/usr/bin/env node
// Owner-run before a deploy: plans (and, later, renders) the Voice Library audio (ghost-voice task 3.11; docs/VOICE-LIBRARY-PLAN.md).
// THIS VERSION IS A DRY RUN ONLY. It reads the manifest and a local folder, prints what is missing and what it would cost,
// and spends nothing. --render, --upload and --reel are refused until those parts are built.
//
// Usage: node tools/prerender-voice.mjs [--dry-run] [--voice Chloe] [--takes 2] [--budget-usd 0.25] [--out DIR] [--list]
//   --voice       only one voice (Mark, Conrad, Arjun, Chloe, Eleanor, Victoria)
//   --takes       takes per line, 1 to 4 (default 1); each take costs the same again
//   --budget-usd  show how far that budget would get (required later, when --render exists)
//   --out         the local folder of rendered files (default: $VOICE_LIBRARY_DIR or ./.voice-library; never committed)
//   --list        also print every file that would be rendered
// Exit: 0 ok, 1 a bad file or bad input, 2 an option that is not built yet.
import { existsSync, readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasMp3Header, planPrerender, resolveVoice, MAX_TAKES, MIN_MP3_BYTES } from './lib/prerender-plan.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NOT_BUILT = ['--render', '--upload', '--reel'];
const FLAGS_WITH_VALUE = ['--voice', '--takes', '--budget-usd', '--out'];
const FLAGS = ['--list', '--dry-run', '--help', ...FLAGS_WITH_VALUE, ...NOT_BUILT];

function fail(message, code = 1) {
  console.error(`prerender-voice: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!FLAGS.includes(a)) fail(`unknown option ${JSON.stringify(a)} (try --help)`);
    if (NOT_BUILT.includes(a)) fail(`${a} is not built yet. This tool only plans: it lists what is missing and what it would cost. Nothing was spent.`, 2);
    if (a === '--help') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); process.exit(0); }
    if (a === '--list') opts.list = true;
    else if (FLAGS_WITH_VALUE.includes(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) fail(`${a} needs a value`);
      opts[a.slice(2)] = v;
      i += 1;
    }
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

let manifest;
try {
  manifest = JSON.parse(readFileSync(join(root, 'shared/fixtures/voice-library.json'), 'utf8'));
} catch (e) {
  fail(`could not read shared/fixtures/voice-library.json: ${e.message}`);
}

const takes = opts.takes === undefined ? 1 : Number(opts.takes);
if (!Number.isInteger(takes) || takes < 1 || takes > MAX_TAKES) fail(`--takes must be a whole number from 1 to ${MAX_TAKES}`);
const budgetUsd = opts['budget-usd'] === undefined ? null : Number(opts['budget-usd']);
if (budgetUsd !== null && !(Number.isFinite(budgetUsd) && budgetUsd >= 0)) fail('--budget-usd must be a number of dollars, 0 or more');
let voice = null;
if (opts.voice !== undefined) {
  voice = resolveVoice(opts.voice, manifest);
  if (voice === null) fail(`no voice called ${JSON.stringify(opts.voice)}. The manifest has: ${[...new Set(manifest.entries.map((e) => e.voice))].join(', ')}`);
}

const outDir = resolve(opts.out ?? process.env.VOICE_LIBRARY_DIR ?? join(root, '.voice-library'));

/** The state of one local file: ok (looks like an MP3), bad (there, but empty, too small or not an MP3), or missing. */
function lookup(file) {
  const path = join(outDir, file);
  if (!existsSync(path)) return 'missing';
  const size = statSync(path).size;
  if (size < MIN_MP3_BYTES) return 'bad';
  const head = Buffer.alloc(3);
  const fd = openSync(path, 'r');
  try { readSync(fd, head, 0, 3, 0); } finally { closeSync(fd); }
  return hasMp3Header(head) ? 'ok' : 'bad';
}

let plan;
try {
  plan = planPrerender({ manifest, lookup, takes, voice, budgetUsd });
} catch (e) {
  fail(e.message);
}

const num = (n) => n.toLocaleString('en-US');
const usd = (n) => `$${n.toFixed(4)}`;
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

console.log('Voice Library prerender: DRY RUN. Nothing is spent, nothing is written.');
console.log(`Manifest: ${manifest.entries.length} entries.  Takes per line: ${plan.takes}.  Folder: ${outDir}`);
console.log('Only this local folder was checked, not R2.\n');
console.log(`${pad('Voice', 18)}${lpad('Lines', 6)}${lpad('Done', 6)}${lpad('Missing', 9)}${lpad('Bad', 5)}${lpad('Characters', 12)}${lpad('About', 10)}`);
for (const r of plan.rows) {
  console.log(`${pad(r.voice, 18)}${lpad(r.lines, 6)}${lpad(r.done, 6)}${lpad(r.missing, 9)}${lpad(r.bad, 5)}${lpad(num(r.chars), 12)}${lpad(usd(r.usd), 10)}`);
}
const t = plan.totals;
console.log(`${pad('Total', 18)}${lpad(t.lines, 6)}${lpad(t.done, 6)}${lpad(t.missing, 9)}${lpad(t.bad, 5)}${lpad(num(t.chars), 12)}${lpad(usd(t.usd), 10)}`);
console.log('\n"Characters" counts the Steering Tag as sent, for the missing files only. Price: $25 per million characters.');

if (plan.budget) {
  const b = plan.budget;
  console.log(b.fitsAll
    ? `\nBudget ${usd(b.usd)}: all ${b.of} missing files fit (estimate ${usd(b.estimateUsd)}).`
    : `\nBudget ${usd(b.usd)}: a render would stop after ${b.affordable} of ${b.of} missing files (estimate ${usd(b.estimateUsd)}).`);
}

if (opts.list && plan.jobs.length > 0) {
  console.log('\nFiles that would be rendered, in order:');
  for (const j of plan.jobs) console.log(`  ${pad(j.voice, 16)} take ${j.take}  ${j.file}  (${j.chars} chars)`);
}

if (plan.bad.length > 0) {
  console.error(`\nERROR: ${plan.bad.length} file(s) exist but are empty, too small or not an MP3. Delete them or look at them; the tool never overwrites:`);
  for (const b of plan.bad) console.error(`  ${join(outDir, b.file)}`);
  process.exit(1);
}

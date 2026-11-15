#!/usr/bin/env node
// Owner-run before a deploy: plans and renders the Voice Library audio (ghost-voice task 3.11; docs/VOICE-LIBRARY-PLAN.md).
// The default is a DRY RUN: it reads the manifest and a local folder, prints what is missing and what it would cost, and spends
// nothing. --render spends real money, so it needs a budget, one voice and a token. --upload puts approved files in R2 with YOUR
// Wrangler login; without --yes it only previews. --reel builds a listening reel per voice (no network, no spend).
//
// Usage: node tools/prerender-voice.mjs [--dry-run] [--voice Chloe] [--takes 2] [--budget-usd 0.25] [--out DIR] [--list]
//        VOICE_RENDER_TOKEN=... node tools/prerender-voice.mjs --render --voice Mark --budget-usd 0.05 [--worker http://127.0.0.1:8798]
//   --voice       only one voice (Mark, Conrad, Arjun, Chloe, Eleanor, Victoria); required with --render for now
//   --takes       takes per line, 1 to 4 (default 1); each take costs the same again
//   --budget-usd  with --dry-run: shows how far that budget would get. With --render: required, and a hard stop
//   --out         the local folder of rendered files (default: $VOICE_LIBRARY_DIR or ./.voice-library; never committed)
//   --list        also print every file that would be rendered
//   --render      render the missing files, one at a time, in order, with no retries (needs ffmpeg and ffprobe)
//   --worker      the local render Worker (default http://127.0.0.1:8798; only a loopback address is accepted)
//   The Worker is tools/voice-render/ (see its wrangler.jsonc). Its token is read from $VOICE_RENDER_TOKEN, 16+ characters.
//        node tools/prerender-voice.mjs --upload (--voice Chloe | --all) [--bucket hauntology-worlds] [--jurisdiction eu] [--yes]
//        node tools/prerender-voice.mjs --reel (--voice Chloe | --all) [--no-labels]
//   --reel        build <out>/reels/reel-<voice>.mp3 and a .index.txt: a spoken label, then every rendered line at the same loudness, so you
//                 can hear a whole voice in one sitting. Needs ffmpeg and ffprobe; labels use macOS `say` (--no-labels to skip). Rebuilt each time.
//   --upload      put the rendered files of one voice (or all) in R2 under speech/lib/v1/<hash>. Preview unless --yes. Needs the
//                 bucket to exist and `wrangler login`. Never overwrites; reads every file back; stops at the first problem.
//                 --jurisdiction eu|fedramp is for a bucket created with one; it is added to every Wrangler call.
// Exit: 0 ok, 1 a bad file, bad input, or a render or upload that stopped early.
import { existsSync, readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasMp3Header, planPrerender, resolveVoice, MAX_TAKES, MIN_MP3_BYTES } from './lib/prerender-plan.mjs';
import { renderJobs } from './lib/prerender-run.mjs';
import { DEFAULT_BUCKET, BUCKET_PATTERN, JURISDICTIONS, planUpload, uploadFiles } from './lib/prerender-upload.mjs';
import { spawnSync } from 'node:child_process';
import { buildReel, macSay, planReel, fmtTime } from './lib/reel.mjs';
import { toolsAvailable } from './lib/audio-check.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NOT_BUILT = [];
const FLAGS_WITH_VALUE = ['--voice', '--takes', '--budget-usd', '--out', '--worker', '--bucket', '--jurisdiction'];
const FLAGS = ['--list', '--dry-run', '--render', '--upload', '--reel', '--no-labels', '--yes', '--all', '--help', ...FLAGS_WITH_VALUE, ...NOT_BUILT];
const DEFAULT_WORKER = 'http://127.0.0.1:8798';

function fail(message, code = 1) {
  console.error(`prerender-voice: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { list: false, render: false, upload: false, reel: false, noLabels: false, yes: false, all: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!FLAGS.includes(a)) fail(`unknown option ${JSON.stringify(a)} (try --help)`);
    if (NOT_BUILT.includes(a)) fail(`${a} is not built yet. Nothing was spent.`, 2);
    if (a === '--help') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); process.exit(0); }
    if (a === '--list') opts.list = true;
    else if (a === '--render') opts.render = true;
    else if (a === '--upload') opts.upload = true;
    else if (a === '--reel') opts.reel = true;
    else if (a === '--no-labels') opts.noLabels = true;
    else if (a === '--yes') opts.yes = true;
    else if (a === '--all') opts.all = true;
    else if (FLAGS_WITH_VALUE.includes(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) fail(`${a} needs a value`);
      opts[a.slice(2)] = v;
      i += 1;
    }
  }
  if (opts.render && argv.includes('--dry-run')) fail('--render and --dry-run cannot be used together');
  if (opts.render && opts.upload) fail('--render and --upload cannot be used together; render first, listen, then upload');
  if ((opts.yes || opts.bucket !== undefined || opts.jurisdiction !== undefined) && !opts.upload) fail('--yes, --bucket and --jurisdiction only go with --upload');
  if (opts.all && !opts.upload && !opts.reel) fail('--all only goes with --upload or --reel');
  if (opts.noLabels && !opts.reel) fail('--no-labels only goes with --reel');
  if (opts.reel && (opts.render || opts.upload)) fail('--reel cannot be combined with --render or --upload; build the reel after rendering, upload after listening');
  if ((opts.upload || opts.reel) && opts.all && opts.voice !== undefined) fail(`${opts.reel ? '--reel' : '--upload'} takes --voice or --all, not both`);
  if (opts.upload && !opts.all && opts.voice === undefined) fail('--upload needs --voice <name> (one voice you have listened to) or --all');
  if (opts.reel && !opts.all && opts.voice === undefined) fail('--reel needs --voice <name> or --all');
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

/* Everything --render needs is checked BEFORE anything is planned or spent. */
let workerUrl = null;
let token = null;
if (opts.render) {
  if (budgetUsd === null) fail('--render needs --budget-usd (a hard stop, in dollars)');
  if (voice === null) fail('--render needs --voice for now (one voice at a time)');
  token = process.env.VOICE_RENDER_TOKEN ?? '';
  if (token.length < 16) fail('--render needs the render Worker token in $VOICE_RENDER_TOKEN (16+ characters; see tools/voice-render/wrangler.jsonc)');
  try {
    const u = new URL(opts.worker ?? DEFAULT_WORKER);
    if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) throw new Error('not a loopback http address');
    workerUrl = u.toString();
  } catch {
    fail('--worker must be an http address on this machine (127.0.0.1, localhost or [::1]); the tool never sends lines or the token elsewhere');
  }
  if (!toolsAvailable()) fail('--render needs ffmpeg and ffprobe on the PATH, to check the length and the silence of every clip');
}

const num = (n) => n.toLocaleString('en-US');
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

if (opts.reel) {
  if (opts.takes !== undefined) fail('--reel plays take 1 (one take per line is the decision); --takes does not apply');
  if (!toolsAvailable()) fail('--reel needs ffmpeg and ffprobe on the PATH');
  const reels = planReel({ manifest, voice, fileState: lookup });
  if (reels.every((r) => r.entries.length === 0)) fail(`nothing rendered to put on a reel in ${outDir}`);
  const say = opts.noLabels ? () => false : macSay;
  console.log(`Voice Library reels. No network, nothing is spent. Folder: ${outDir}\n`);
  let problems = 0;
  for (const r of reels) {
    for (const m of r.missing) console.log(`  not rendered yet: ${r.voice}  ${m.sources.join(',')}`);
    for (const b of r.bad) { problems += 1; console.error(`  bad file, left out: ${r.voice}  ${b.sources.join(',')}  ${b.file}`); }
    if (r.entries.length === 0) { console.log(`${r.voice}: no rendered lines, no reel.`); continue; }
    const built = await buildReel({ voice: r.voice, entries: r.entries, libDir: outDir, outDir, say });
    console.log(`${r.voice}: ${built.lines} lines, ${fmtTime(built.durationMs)}${built.labelled ? '' : ', no spoken labels'}  ->  ${built.path}`);
    console.log(`  index: ${built.indexPath}`);
  }
  process.exit(problems > 0 ? 1 : 0);
}

/** Run `wrangler <args>` with the OWNER's login. $VOICE_WRANGLER replaces the command (tests use a fake). Arguments are an array, never a shell string. */
function runWrangler(args) {
  const custom = process.env.VOICE_WRANGLER;
  const [cmd, pre] = custom ? [custom, []] : ['pnpm', ['--filter', 'api', 'exec', 'wrangler']];
  const r = spawnSync(cmd, [...pre, ...args], { encoding: 'utf8', cwd: root, timeout: 180_000 });
  return { status: r.status, stdout: r.stdout ?? '', stderr: `${r.stderr ?? ''}${r.error ? String(r.error) : ''}` };
}

if (opts.upload) {
  if (opts.takes !== undefined) fail('--upload sends take 1 (one take per line is the decision); --takes does not apply');
  const bucket = opts.bucket ?? DEFAULT_BUCKET;
  if (!BUCKET_PATTERN.test(bucket)) fail(`"${bucket}" is not a valid bucket name`);
  const jurisdiction = opts.jurisdiction ?? null;
  if (jurisdiction !== null && !JURISDICTIONS.includes(jurisdiction)) fail(`--jurisdiction must be one of ${JURISDICTIONS.join(', ')}`);
  let up;
  try { up = planUpload({ manifest, voice, bucket, fileState: lookup }); } catch (e) { fail(e.message); }

  console.log(opts.yes ? 'Voice Library upload: UPLOAD. This writes to R2 with your Wrangler login.' : 'Voice Library upload: PREVIEW. Nothing is uploaded. Add --yes to upload.');
  console.log(`Bucket: ${bucket}${jurisdiction === null ? '' : ` (jurisdiction ${jurisdiction})`}   Prefix: ${manifest.prefix}   Folder: ${outDir}   Voice: ${voice ?? 'all'}\n`);
  console.log(`Ready to upload: ${up.entries.length} file(s).  Missing locally: ${up.missing.length}.  Bad locally: ${up.bad.length}.`);
  if (up.missing.length > 0 || up.bad.length > 0) {
    for (const m of up.missing) console.error(`  missing  ${m.voice}  ${m.sources.join(',')}  ${m.file}`);
    for (const b of up.bad) console.error(`  bad      ${b.voice}  ${b.sources.join(',')}  ${b.file}`);
    fail('a voice goes up whole or not at all. Render the missing files (or delete the bad ones and render again), then upload.');
  }
  if (up.entries.length === 0) fail('nothing to upload for that voice');
  const bytes = up.entries.reduce((n, e) => n + statSync(join(outDir, e.file)).size, 0);
  console.log(`Total: ${num(bytes)} bytes. Each goes to <bucket>/${manifest.prefix}<hash> as audio/mpeg, is never overwritten, and is read back and compared.`);

  if (!opts.yes) {
    console.log('\nFirst and last objects:');
    for (const e of [up.entries[0], up.entries[up.entries.length - 1]]) console.log(`  ${e.object}   (${e.voice} ${e.sources.join(',')})`);
    console.log('\nNothing was uploaded. Add --yes to do it.');
    process.exit(0);
  }
  if (!toolsAvailable()) fail('--upload --yes needs ffmpeg and ffprobe on the PATH, to check every clip once more before it is sent');
  console.log('\nUploading one file at a time, no retries. Stops at the first problem.\n');
  const result = await uploadFiles({ entries: up.entries, outDir, bucket, jurisdiction, run: runWrangler, log: (l) => console.log(l) });
  console.log(`\nUploaded ${result.uploaded.length}, already there and identical ${result.already.length}, of ${up.entries.length}.${result.ledgerPath ? `  Ledger: ${result.ledgerPath}  (not committed)` : ''}`);
  if (result.stopped) {
    console.error(`\nERROR${result.stopped.entry ? ` at ${result.stopped.entry.voice} ${result.stopped.entry.sources.join(',')}` : ''}: ${result.stopped.message}`);
    console.error('Starting again skips what is done and checks the rest first.');
    process.exit(1);
  }
  process.exit(0);
}

let plan;
try {
  plan = planPrerender({ manifest, lookup, takes, voice, budgetUsd });
} catch (e) {
  fail(e.message);
}

const usd = (n) => `$${n.toFixed(4)}`;
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

console.log(opts.render
  ? 'Voice Library prerender: RENDER. This spends real money, up to the budget.'
  : 'Voice Library prerender: DRY RUN. Nothing is spent, nothing is written.');
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

if (opts.render) {
  if (plan.jobs.length === 0) {
    console.log('\nNothing to render: every file for this voice is already there.');
    process.exit(0);
  }
  console.log(`\nRendering through ${workerUrl}, one file at a time, no retries. Stops at the first problem.\n`);
  const result = await renderJobs({ jobs: plan.jobs, manifest, outDir, workerUrl, token, budgetUsd, log: (l) => console.log(l) });
  console.log(`\nRendered ${result.rendered.length} of ${plan.jobs.length} files. Counted as spent: ${num(result.spentChars)} characters, about ${usd(result.spentUsd)} of the ${usd(budgetUsd)} budget.`);
  console.log(`Report: ${result.reportPath}  (not committed)`);
  if (result.stopped) {
    const where = result.stopped.job ? ` at ${result.stopped.job.voice} ${result.stopped.job.file}` : '';
    console.error(`\n${result.stopped.kind === 'budget' ? 'STOPPED' : 'ERROR'}${where}: ${result.stopped.message}`);
    console.error('Starting again skips the files that are done. A call that failed may still have been billed, so it is counted above.');
    process.exit(result.stopped.kind === 'budget' ? 0 : 1);
  }
}

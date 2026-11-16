#!/usr/bin/env node
// The narrator play-through (ghost-engine checkpoint 8, docs/spikes/4.2.md): three games played through the real routes of a local Worker, with the model behind them.
// The default is a DRY RUN: it prints the planned games, the most they could cost and the cap, opens no network connection and writes no file.
// --run plays them. With a Worker that has NO model (the rehearsal, api/wrangler.playthrough.rehearsal.jsonc) nothing can be spent. With a Worker that has the model
// (api/wrangler.playthrough.jsonc) it spends real money, so it also needs --live, a budget (at most $0.02) and the owner's go.
//
// Usage: node tools/ghost-playthrough.mjs [--dry-run] [--list] [--show B07]
//        GHOST_PLAYTHROUGH_TOKEN=... node tools/ghost-playthrough.mjs --run [--live] --budget-usd 0.02 [--worker http://127.0.0.1:8801] [--only A,C] [--out DIR]
//        node tools/ghost-playthrough.mjs --read [--rehearsal] [--out DIR]
//        node tools/ghost-playthrough.mjs --summary [--rehearsal] [--out DIR]
//   --list        also print every planned turn
//   --show ID     print what one planned turn says and where the visitor stands
//   --run         play the games, one turn at a time, in order (A, B, C), with no retries
//   --live        required when the Worker says it has the model; refused when it has none
//   --budget-usd  required with --run, at most 0.02; counted in the ledger across runs, and a hard stop at 60 calls
//   --only        run just these games (A, B or C)
//   --worker      the local Worker (default http://127.0.0.1:8801; only a loopback address is accepted)
//   --out         where the ledger, the replies and the summary go (default ./.ghost-playthrough, git-ignored, never committed)
//   --read        print the replies of the latest run (no network)
//   --summary     the pass marks of the latest run, numbers only (no network)
//   --rehearsal   --read and --summary look at the rehearsal's files, not the paid run's (a rehearsal never touches the paid run's ledger)
//   The ledger (<out>/ledger.json) counts calls and spend across paid runs: 60 calls in all, whatever you run. A damaged ledger is refused, never reset.
//   The token is read from $GHOST_PLAYTHROUGH_TOKEN (16+ characters, the same RUN_TOKEN the Worker was started with).
// Exit: 0 ok, 1 bad input, or a run that stopped early.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUDGET_CAP_USD, MAX_CALLS, PROMPT_CHARS_MAX, PlaythroughStop, WORST_CALL_USD, dryPlan, isLoopbackUrl, ledgerFileName, openLedger, planPlaythrough, resultsFileName, runPlaythrough, summaryMarkdown } from './lib/ghost-playthrough.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_WORKER = 'http://127.0.0.1:8801';
const FLAGS_WITH_VALUE = ['--show', '--budget-usd', '--worker', '--only', '--out'];
const FLAGS = ['--dry-run', '--list', '--run', '--live', '--read', '--summary', '--rehearsal', '--help', ...FLAGS_WITH_VALUE];

function fail(message, code = 1) {
  console.error(`ghost-playthrough: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { list: false, run: false, live: false, read: false, summary: false, rehearsal: false, show: null, budget: null, worker: DEFAULT_WORKER, only: null, out: join(root, '.ghost-playthrough') };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!FLAGS.includes(a)) fail(`unknown option ${JSON.stringify(a)} (try --help)`);
    if (a === '--help') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); process.exit(0); }
    if (a === '--list') opts.list = true;
    else if (a === '--run') opts.run = true;
    else if (a === '--live') opts.live = true;
    else if (a === '--read') opts.read = true;
    else if (a === '--summary') opts.summary = true;
    else if (a === '--rehearsal') opts.rehearsal = true;
    else if (a === '--dry-run') opts.run = false;
    else if (FLAGS_WITH_VALUE.includes(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) fail(`${a} needs a value`);
      i += 1;
      if (a === '--show') opts.show = v;
      else if (a === '--budget-usd') { opts.budget = Number(v); if (!(opts.budget > 0)) fail('--budget-usd must be a number above 0'); }
      else if (a === '--worker') opts.worker = v;
      else if (a === '--only') opts.only = v.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      else if (a === '--out') opts.out = resolve(v);
    }
  }
  return opts;
}

const usd = (n) => `$${n.toFixed(5)}`;

function printDry(plan, ledgerCalls) {
  const d = dryPlan(plan);
  console.log('Game  What                                      Voice    Turns  Could call the model  Parser refuses  Most it could cost');
  for (const r of d.rows) console.log(`${r.id}     ${r.name.padEnd(40)}  ${r.voice.padEnd(7)}  ${String(r.turns).padEnd(5)}  ${String(r.calls).padEnd(20)}  ${String(r.parserRefused).padEnd(14)}  ${usd(r.worstUsd)}`);
  console.log(`\nPlanned: up to ${d.totalCalls} model calls of the ${MAX_CALLS} approved. The most the plan could cost: ${usd(d.totalUsd)} (${usd(WORST_CALL_USD)} a call at its worst: ${PROMPT_CHARS_MAX.toLocaleString('en-US')} characters in at 3 a token, 220 tokens out). Cap: $${BUDGET_CAP_USD}, and a hard stop at ${MAX_CALLS} calls.`);
  console.log('Game B asks for every way (8) by every distance (3) once; a way the made-up place does not allow is skipped and costs nothing.');
  console.log(`Calls already made, from the paid run's ledger: ${ledgerCalls}.`);
  console.log('\nThis was a dry run. Nothing was sent, no file was written, nothing was spent.');
  console.log('To try it with nothing to spend: start the rehearsal Worker (api/wrangler.playthrough.rehearsal.jsonc, its command is in that file), then');
  console.log('  GHOST_PLAYTHROUGH_TOKEN=<the same token> node tools/ghost-playthrough.mjs --run --budget-usd 0.02');
}

function readLedgerCalls(out) {
  const file = join(out, 'ledger.json');
  if (!existsSync(file)) return 0;
  try { return JSON.parse(readFileSync(file, 'utf8')).calls ?? 0; } catch { return 0; }
}

const resultsFiles = (out, mode) => (existsSync(out) ? readdirSync(out).filter((f) => f.startsWith(`results-${mode}-`) && f.endsWith('.jsonl')).sort() : []);
const readRows = (file) => readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

/** The Worker over HTTP, one request at a time, no retries. Every path is on the one loopback base. */
function makeNet(base, token) {
  const origin = new URL(base).origin;
  const request = async (path, { method = 'GET', headers = {}, body } = {}) => {
    const res = await fetch(`${origin}${path}`, { method, headers: { ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, json };
  };
  const dev = (path, init = {}) => request(path, { ...init, headers: { 'x-run-token': token } });
  return {
    status: () => dev('/dev/status'),
    units: async () => { try { return await dev('/dev/units'); } catch { return null; } },
    seed: (id) => dev('/dev/seed-gallery', { method: 'POST', body: { id } }),
    async visitor() {
      const first = await request('/api/session', { headers: { origin } });
      const cookie = (first.headers.get('set-cookie') ?? '').split(';')[0];
      if (cookie === '') throw new PlaythroughStop('the Worker gave no session cookie');
      const headers = { cookie, origin };
      return { get: (path) => request(path, { headers }), post: (path, body) => request(path, { method: 'POST', headers, body }) };
    },
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const mode = opts.rehearsal ? 'rehearsal' : 'live';

  if (opts.read) {
    const files = resultsFiles(opts.out, mode);
    if (files.length === 0) fail(`no ${mode} results in ${opts.out}`);
    for (const r of readRows(join(opts.out, files[files.length - 1]))) {
      if (r.kind !== 'turn') continue;
      if (r.skipped) { console.log(`${r.id} (skipped: ${r.reason})\n`); continue; }
      console.log(`${r.id} [${r.expected?.kind ?? '-'}${r.expected?.bearing ? ` ${r.expected.bearing}, ${r.expected.band}` : ''}${r.eligible ? '' : ', no model call'}] ${r.scripted === undefined ? '' : r.scripted ? '(scripted) ' : '(model) '}${r.check && r.check.ok === false ? `(failed the check: ${r.check.problem}) ` : ''}\n  visitor: ${r.said}\n  ghost:   ${r.text ?? `(status ${r.status})`}\n`);
    }
    return;
  }

  const plan = await planPlaythrough(root);

  if (opts.summary) {
    const files = resultsFiles(opts.out, mode);
    if (files.length === 0) fail(`no ${mode} results in ${opts.out}`);
    const file = join(opts.out, files[files.length - 1]);
    const rows = readRows(file);
    const metaFile = file.replace(/\.jsonl$/, '.meta.json');
    const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : { calls: 0, spentUsd: 0, narrator: !opts.rehearsal, stopped: null, unitsUsed: null };
    const md = summaryMarkdown(plan, { rows, ...meta });
    writeFileSync(join(opts.out, `summary-${mode}-latest.md`), md);
    console.log(md);
    return;
  }

  if (opts.show !== null) {
    const step = plan.games.flatMap((g) => g.steps).find((s) => s.id === opts.show.toUpperCase());
    if (step === undefined) fail(`there is no turn ${opts.show}`);
    console.log(`${step.id} (game ${step.game}): ${step.note}\n  the visitor ${step.input.text !== undefined ? `says: ${JSON.stringify(step.input.text)}` : `presses ${step.input.button}`}\n  and stands: ${JSON.stringify(step.at)}`);
    return;
  }

  if (!opts.run) {
    if (opts.list) {
      for (const g of plan.games) {
        console.log(`Game ${g.id}: ${g.name} (${g.voice}${g.ghostPreset ? `, preset ${g.ghostPreset}` : ''})`);
        for (const s of g.steps) console.log(`  ${s.id}  ${(s.input.text !== undefined ? `says ${JSON.stringify(s.input.text.slice(0, 50))}` : `presses ${s.input.button}`).padEnd(62)} ${JSON.stringify(s.at)}`);
      }
      console.log('');
    }
    printDry(plan, readLedgerCalls(opts.out));
    return;
  }

  // --run: every check that does not need the network comes first.
  const token = process.env.GHOST_PLAYTHROUGH_TOKEN ?? '';
  if (token.length < 16) fail('--run needs $GHOST_PLAYTHROUGH_TOKEN (16+ characters, the RUN_TOKEN the Worker was started with). Nothing was spent.');
  if (opts.budget === null) fail('--run needs --budget-usd (at most 0.02). Nothing was spent.');
  if (opts.budget > BUDGET_CAP_USD) fail(`--budget-usd is at most ${BUDGET_CAP_USD}, the cap that was approved (it is ${opts.budget}). Nothing was spent.`);
  if (!isLoopbackUrl(opts.worker)) fail(`--worker must be an http address on this machine (127.0.0.1 or localhost), not ${JSON.stringify(opts.worker)}. Nothing was spent.`);

  mkdirSync(opts.out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  // A paid run counts in ledger.json across runs. A rehearsal can spend nothing, so it never touches that file: it has a fresh ledger of its own each time.
  const net = makeNet(opts.worker, token);
  const status = await net.status().catch((e) => fail(`the Worker could not be reached: ${e.message}. Nothing was sent.`));
  const narrator = status.status === 200 && status.json?.narrator === true;
  const ledgerFile = join(opts.out, ledgerFileName(narrator));
  const ledger = await openLedger({
    read: async () => (narrator && existsSync(ledgerFile) ? readFileSync(ledgerFile, 'utf8') : null),
    write: async (text) => { writeFileSync(`${ledgerFile}.tmp`, text); renameSync(`${ledgerFile}.tmp`, ledgerFile); },
  });
  const runMode = narrator ? 'live' : 'rehearsal';
  const resultsFile = join(opts.out, resultsFileName(narrator, stamp));

  const out = await runPlaythrough({
    plan, net, ledger, budgetUsd: opts.budget, only: opts.only, live: opts.live,
    onRow: (r) => {
      writeFileSync(resultsFile, `${JSON.stringify(r)}\n`, { flag: 'a' });
      if (r.kind === 'turn') console.log(r.skipped ? `${r.id.padEnd(4)} skipped` : `${r.id.padEnd(4)} ${String(r.expected?.kind ?? '-').padEnd(7)} ${r.eligible ? 'may call' : 'no call'} ${String(r.ms).padStart(5)} ms  ${r.scripted === undefined ? `HTTP ${r.status}` : r.scripted ? 'scripted' : 'model'}  ${r.check === undefined ? '' : r.check.ok ? 'check ok' : `check: ${r.check.problem}`}`);
      else console.log(`${r.game}    end of game: found ${r.found}, ended ${r.ended}, game and turns agree: ${r.agrees}`);
    },
  });
  writeFileSync(resultsFile.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ calls: out.calls, spentUsd: out.spentUsd, narrator: out.narrator, stopped: out.stopped, unitsUsed: out.unitsUsed }, null, 2));
  const summary = summaryMarkdown(plan, out);
  writeFileSync(join(opts.out, `summary-${runMode}-${stamp}.md`), summary);
  console.log(`\n${summary}`);
  console.log(`Replies: ${resultsFile} (read them with --read${narrator ? '' : ' --rehearsal'}). Summary: ${join(opts.out, `summary-${runMode}-${stamp}.md`)}.`);
  if (out.stopped !== null) fail(`stopped early: ${out.stopped.reason} at ${out.stopped.at}. No retry was made.`);
}

try {
  await main();
} catch (error) {
  if (error instanceof PlaythroughStop) fail(error.message);
  throw error;
}

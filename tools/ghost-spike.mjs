#!/usr/bin/env node
// The narrator spike (ghost-engine spike 1, docs/spikes/4.1.md): about 50 paid calls to Haiku 5.5 through the AI Gateway, run only when YOU say so.
// The default is a DRY RUN: it builds the 39 planned prompts, prints their sizes and the most they could cost, and opens no network connection and no
// file. --run spends real money, so it needs a budget (at most $0.05), a token and the local Worker (api/dev/narrator-spike.ts, wrangler.narrator.jsonc).
//
// Usage: node tools/ghost-spike.mjs [--dry-run] [--list] [--show T3]
//        GHOST_SPIKE_TOKEN=... node tools/ghost-spike.mjs --run --budget-usd 0.05 [--worker http://127.0.0.1:8799] [--only T3,J4] [--out DIR]
//        node tools/ghost-spike.mjs --read [--out DIR]
//        node tools/ghost-spike.mjs --summary [--out DIR]
//   --list        also print every planned call
//   --show ID     print the exact instructions and message of one planned call (T chains show the scripted lines in the history; a real run uses the replies)
//   --run         make the calls, one at a time, in order, with no retries (S1 to S3, then T1 to T20, M1 to M6, J1 to J10)
//   --budget-usd  required with --run, at most 0.05; counted in the ledger across runs, and a hard stop on the estimate
//   --only        run just these call ids (a tuning pass after you have read the first 39: the other 11 of the 50 approved)
//   --worker      the local Worker (default http://127.0.0.1:8799; only a loopback address is accepted)
//   --out         where the ledger, the replies and the summary go (default ./.ghost-spike, git-ignored, never committed)
//   --read        print the replies of the latest run so you can judge the tone (no network)
//   --summary     the pass marks over every run in <out> (a call run again counts once, as its latest answer), numbers only (no network)
//   The ledger (<out>/ledger.json) counts calls and spend across runs: 50 calls in all, whatever you run. A damaged ledger is refused, never reset.
//   The token is read from $GHOST_SPIKE_TOKEN (16+ characters, the same RUN_TOKEN the Worker was started with).
// Exit: 0 ok, 1 bad input, or a run that stopped early.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUDGET_CAP_USD, MAX_CALLS, SpikeStop, dryPlan, isLoopbackUrl, openLedger, planSpike, runSpike, summaryMarkdown } from './lib/ghost-spike.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_WORKER = 'http://127.0.0.1:8799';
const FLAGS_WITH_VALUE = ['--show', '--budget-usd', '--worker', '--only', '--out'];
const FLAGS = ['--dry-run', '--list', '--run', '--read', '--summary', '--help', ...FLAGS_WITH_VALUE];

function fail(message, code = 1) {
  console.error(`ghost-spike: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { list: false, run: false, read: false, summary: false, show: null, budget: null, worker: DEFAULT_WORKER, only: null, out: join(root, '.ghost-spike') };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!FLAGS.includes(a)) fail(`unknown option ${JSON.stringify(a)} (try --help)`);
    if (a === '--help') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); process.exit(0); }
    if (a === '--list') opts.list = true;
    else if (a === '--run') opts.run = true;
    else if (a === '--read') opts.read = true;
    else if (a === '--summary') opts.summary = true;
    else if (a === '--dry-run') opts.run = false;
    else if (FLAGS_WITH_VALUE.includes(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) fail(`${a} needs a value`);
      i += 1;
      if (a === '--show') opts.show = v;
      else if (a === '--budget-usd') { opts.budget = Number(v); if (!(opts.budget > 0)) fail('--budget-usd must be a number above 0'); }
      else if (a === '--worker') opts.worker = v;
      else if (a === '--only') opts.only = v.split(',').map((s) => s.trim()).filter(Boolean);
      else if (a === '--out') opts.out = resolve(v);
    }
  }
  return opts;
}

const usd = (n) => `$${n.toFixed(5)}`;

function printDry(cases, ledgerCalls) {
  const groups = ['S', 'T', 'M', 'J'].map((g) => {
    const cs = cases.filter((c) => c.group === g);
    return { g, n: cs.length, maxChars: Math.max(...cs.map((c) => c.chars)), worst: cs.reduce((a, c) => a + c.worstUsd, 0) };
  });
  const total = groups.reduce((a, g) => a + g.worst, 0);
  console.log('Group  Calls  Largest prompt (chars)  Most it could cost');
  for (const g of groups) console.log(`${g.g}      ${String(g.n).padEnd(5)}  ${String(g.maxChars).padEnd(22)}  ${usd(g.worst)}`);
  const n = cases.length;
  console.log(`\nPlanned: ${n} calls of the ${MAX_CALLS} approved (${MAX_CALLS - n} are left for one tuning pass). The most the plan could cost: ${usd(total)} (3 characters a token, every reply at its cap). Cap: $${BUDGET_CAP_USD}.`);
  console.log(`Calls already made, from the ledger: ${ledgerCalls}.`);
  console.log('\nThis was a dry run. Nothing was sent, no file was written, nothing was spent.');
  console.log('To run it: load AI Gateway credits, start the local Worker (see api/wrangler.narrator.jsonc), then');
  console.log('  GHOST_SPIKE_TOKEN=<the same token> node tools/ghost-spike.mjs --run --budget-usd 0.05');
}

async function readLedgerCalls(out) {
  const file = join(out, 'ledger.json');
  if (!existsSync(file)) return 0;
  try { return JSON.parse(readFileSync(file, 'utf8')).calls ?? 0; } catch { return 0; }
}

function latestResults(out) {
  if (!existsSync(out)) return null;
  const files = readdirSync(out).filter((f) => /^results-.*\.jsonl$/.test(f)).sort();
  return files.length === 0 ? null : join(out, files[files.length - 1]);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.read) {
    const file = latestResults(opts.out);
    if (file === null) fail(`no results in ${opts.out}`);
    for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
      const r = JSON.parse(line);
      console.log(`${r.id} [${r.persona}, ${r.directive}${r.group === 'J' ? `, parser ${r.parserFlags ? 'would catch it' : 'would miss it'}` : ''}] ${r.valid === false ? `(failed the check: ${r.problem}) ` : ''}\n  visitor: ${r.said ?? '-'}\n  ghost:   ${r.text ?? `(${r.kind})`}\n`);
    }
    return;
  }

  if (opts.summary) {
    if (!existsSync(opts.out)) fail(`no results in ${opts.out}`);
    const byId = new Map();
    for (const f of readdirSync(opts.out).filter((x) => /^results-.*\.jsonl$/.test(x)).sort()) {
      for (const line of readFileSync(join(opts.out, f), 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(line); byId.set(r.id, r); }
    }
    if (byId.size === 0) fail(`no results in ${opts.out}`);
    const ledger = JSON.parse(readFileSync(join(opts.out, 'ledger.json'), 'utf8'));
    const md = summaryMarkdown({ results: [...byId.values()], stopped: null, calls: ledger.calls, spentUsd: ledger.spentUsd, mode: ledger.mode });
    writeFileSync(join(opts.out, 'summary-all.md'), md);
    console.log(md);
    return;
  }

  const plan = await planSpike(root);
  const cases = dryPlan(plan);

  if (opts.show !== null) {
    const c = cases.find((x) => x.id === opts.show);
    if (c === undefined) fail(`there is no case ${opts.show}`);
    console.log(`${c.id} (${c.persona}, ${c.directive ?? 'ambient'}, thinking ${c.mode}, at most ${c.maxTokens} tokens out)\n\n--- instructions ---\n${c.system}\n\n--- message ---\n${c.user}`);
    return;
  }

  if (!opts.run) {
    if (opts.list) for (const c of cases) console.log(`${c.id.padEnd(4)} ${c.persona.padEnd(8)} ${(c.directive ?? 'ambient').padEnd(8)} thinking ${c.mode.padEnd(7)} ${String(c.chars).padStart(5)} chars  ${usd(c.worstUsd)}`);
    if (opts.list) console.log('');
    printDry(cases, await readLedgerCalls(opts.out));
    return;
  }

  // --run: every check that does not need the network comes first.
  const token = process.env.GHOST_SPIKE_TOKEN ?? '';
  if (token.length < 16) fail('--run needs $GHOST_SPIKE_TOKEN (16+ characters, the RUN_TOKEN the Worker was started with). Nothing was spent.');
  if (opts.budget === null) fail('--run needs --budget-usd (at most 0.05). Nothing was spent.');
  if (opts.budget > BUDGET_CAP_USD) fail(`--budget-usd is at most ${BUDGET_CAP_USD}, the cap you approved (it is ${opts.budget}). Nothing was spent.`);
  if (!isLoopbackUrl(opts.worker)) fail(`--worker must be an http address on this machine (127.0.0.1 or localhost), not ${JSON.stringify(opts.worker)}. Nothing was spent.`);

  mkdirSync(opts.out, { recursive: true });
  const ledgerFile = join(opts.out, 'ledger.json');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsFile = join(opts.out, `results-${stamp}.jsonl`);
  const ledger = await openLedger({
    read: async () => (existsSync(ledgerFile) ? readFileSync(ledgerFile, 'utf8') : null),
    write: async (text) => { writeFileSync(`${ledgerFile}.tmp`, text); renameSync(`${ledgerFile}.tmp`, ledgerFile); },
  });

  const base = opts.worker.replace(/\/$/, '');
  const headers = { 'x-spike-token': token, 'content-type': 'application/json' };
  const get = async (path) => { const r = await fetch(`${base}${path}`, { headers }); return { status: r.status, json: await r.json().catch(() => null) }; };
  const post = async (body) => { const r = await fetch(`${base}/narrate`, { method: 'POST', headers, body: JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => null) }; };

  // earlier replies, latest of each call, so a run of some calls sees the history of the others
  const prior = new Map();
  for (const f of readdirSync(opts.out).filter((x) => /^results-.*\.jsonl$/.test(x)).sort()) {
    for (const line of readFileSync(join(opts.out, f), 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(line); prior.set(r.id, r); }
  }

  const out = await runSpike({
    plan, get, post, ledger, budgetUsd: opts.budget, only: opts.only, prior: [...prior.values()],
    onResult: (r) => {
      writeFileSync(resultsFile, `${JSON.stringify(r)}\n`, { flag: 'a' });
      console.log(`${r.id.padEnd(4)} ${r.kind.padEnd(10)} ${String(r.ms).padStart(5)} ms  ${r.inputTokens ?? '-'} in, ${r.outputTokens ?? '-'} out  ${r.valid === null ? '' : r.valid ? 'check ok' : `check: ${r.problem}`}`);
    },
  });
  const summary = summaryMarkdown(out);
  writeFileSync(join(opts.out, `summary-${stamp}.md`), summary);
  console.log(`\n${summary}`);
  console.log(`Replies: ${resultsFile} (read them with --read). Summary: ${join(opts.out, `summary-${stamp}.md`)}.`);
  if (out.stopped !== null) fail(`stopped early: ${out.stopped.reason} at ${out.stopped.at}. No retry was made.`);
}

try {
  await main();
} catch (error) {
  if (error instanceof SpikeStop) fail(error.message);
  throw error;
}

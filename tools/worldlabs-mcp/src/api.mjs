// The World API client behind the dev MCP server (world-pipeline task 0). It reuses the spike's rules (tools/lib/worldlabs-spike.mjs):
// the cost estimate, the base-address check, the scrubbing of every address and id, and the ledger format. It adds what an agent
// needs to drive the service without waiting in the tool call: generate returns at once with an operation id, and the operation is
// read later. Nothing here runs at import time; every call goes through `fetchImpl`, so the tests never reach the network.
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import {
  CREDITS_PER_DOLLAR, MAX_IMAGE_BYTES, MODELS, assetUrls, checkBase, describeUrl, estimateCredits, scrub,
} from '../../lib/worldlabs-spike.mjs';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const DEFAULT_BASE = 'https://api.worldlabs.ai';

/** The most one call may cost unless the caller says otherwise, and the total over every run (the ledger's `spent`). */
export const DEFAULT_MAX_CREDITS_PER_CALL = 300;
export const DEFAULT_MAX_TOTAL_CREDITS = 6000;

export function createWorldLabsClient(o) {
  const key = o.apiKey;
  if (typeof key !== 'string' || key.length < 8) throw new Error('WLT_API_KEY is not set. It must be a World API key from platform.worldlabs.ai.');
  const base = checkBase(o.apiBase ?? DEFAULT_BASE);
  const fetchImpl = o.fetchImpl ?? fetch;
  const now = o.now ?? (() => Date.now());
  const ledgerPath = o.ledgerPath;
  const fixtureDir = o.fixtureDir;
  const maxTotal = o.maxTotal ?? DEFAULT_MAX_TOTAL_CREDITS;
  const maxPerCall = o.maxPerCall ?? DEFAULT_MAX_CREDITS_PER_CALL;
  const redact = (s) => String(s).split(key).join('<key>');

  const readLedger = () => (ledgerPath && existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : { spent: 0, runs: [] });
  const writeLedger = (ledger) => { if (ledgerPath) { mkdirSync(dirname(ledgerPath), { recursive: true }); writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2)); } };

  async function call(method, path, body) {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { 'WLT-Api-Key': key, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, json, text };
  }

  async function credits() {
    const r = await call('GET', '/marble/v1/credits');
    if (r.status !== 200 || typeof r.json?.remaining_credits !== 'number') throw new Error(`the credit check answered ${r.status}: is this a World API key?`);
    return r.json.remaining_credits;
  }

  /** What the ledger says. The balance is read live, so an answer can say both. */
  function spendStatus() {
    const ledger = readLedger();
    return {
      spentCredits: ledger.spent,
      totalCapCredits: maxTotal,
      perCallCapCredits: maxPerCall,
      remainingUnderTotalCap: Math.max(0, maxTotal - ledger.spent),
      runs: ledger.runs.slice(-20),
    };
  }

  /**
   * Starts one world from one picture. The caller names the most it accepts (`maxCredits`), and nothing is sent unless the
   * model's ceiling fits that, the per-call cap, the total cap and the live balance. The ledger is written first, at the
   * estimate, so an interrupted call still counts.
   */
  async function generate({ path, name, model = 'marble-1.0-draft', isPano = false, maxCredits }) {
    if (!MODELS.includes(model)) throw new Error(`unknown model ${model}; use one of ${MODELS.join(', ')}`);
    if (typeof path !== 'string' || !existsSync(path) || !statSync(path).isFile()) throw new Error('path must be a picture file that exists');
    const ext = extname(path).replace('.', '').toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) throw new Error('the picture must be a jpg, jpeg, png or webp');
    const bytes = readFileSync(path);
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new Error(`the picture must be between 1 byte and ${MAX_IMAGE_BYTES} bytes`);
    const est = estimateCredits(model, { isPano });
    const cap = maxCredits ?? maxPerCall;
    if (!Number.isFinite(cap) || cap <= 0) throw new Error('max_credits must be a positive number');
    if (est.ceiling > cap) throw new Error(`${model} can cost up to ${est.ceiling} credits; max_credits is ${cap}`);
    if (est.ceiling > maxPerCall) throw new Error(`${model} can cost up to ${est.ceiling} credits; the per-call cap is ${maxPerCall}`);
    const ledger = readLedger();
    if (ledger.spent + est.ceiling > maxTotal) throw new Error(`the ledger says ${ledger.spent} credits are spent; another ${est.ceiling} would pass the total cap of ${maxTotal}`);
    const balance = await credits();
    if (balance < est.ceiling) throw new Error(`the balance (${balance}) is below the most this could cost (${est.ceiling}); stopped before sending`);

    const runRecord = { at: new Date(now()).toISOString(), model, name: typeof name === 'string' ? name.slice(0, 80) : null, estimated: est.total, actual: null };
    ledger.runs.push(runRecord);
    ledger.spent += est.total;
    writeLedger(ledger);

    const request = {
      display_name: typeof name === 'string' && name !== '' ? name.slice(0, 80) : 'hauntology-dev',
      model,
      permission: { public: false, allow_id_access: false, allowed_readers: [], allowed_writers: [] },
      world_prompt: { type: 'image', image_prompt: { source: 'data_base64', data_base64: bytes.toString('base64'), extension: ext === 'jpeg' ? 'jpg' : ext } },
    };
    const gen = await call('POST', '/marble/v1/worlds:generate', request);
    if (gen.status !== 200 || typeof gen.json?.operation_id !== 'string') {
      const current = readLedger();
      current.spent -= est.total;
      const last = current.runs.at(-1);
      last.estimated = 0;
      last.note = `refused with ${gen.status}`;
      writeLedger(current);
      const retry = gen.headers.get('retry-after');
      const detail = redact(typeof gen.json?.detail === 'string' ? gen.json.detail : '').replace(/https?:\/\/\S+/g, '<url>').slice(0, 200);
      throw new Error(`generate was refused with ${gen.status}${retry ? ` (Retry-After ${retry})` : ''}${detail ? `: ${detail}` : ''}`);
    }
    runRecord.operationId = gen.json.operation_id;
    writeLedger(ledger);
    return { operationId: gen.json.operation_id, estimate: est, balanceBefore: balance };
  }

  /** Reads an operation (free). When it has finished, the ledger's estimate is replaced by the real cost. */
  async function operation(operationId) {
    const r = await call('GET', `/marble/v1/operations/${encodeURIComponent(operationId)}`);
    if (r.status !== 200 || r.json === null) throw new Error(`reading the operation answered ${r.status}`);
    const op = r.json;
    if (op.done === true && typeof op.cost?.total_credits === 'number') settleLedger(operationId, op.cost.total_credits);
    return op;
  }

  function settleLedger(operationId, actual) {
    const ledger = readLedger();
    const run = ledger.runs.find((x) => x.operationId === operationId) ?? ledger.runs.filter((x) => x.actual === null).at(-1);
    if (!run || run.actual !== null) return;
    ledger.spent += actual - run.estimated;
    run.actual = actual;
    run.operationId = operationId;
    writeLedger(ledger);
  }

  /** One world (free). Its addresses are scrubbed before they leave this module. */
  async function world(worldId) {
    const r = await call('GET', `/marble/v1/worlds/${encodeURIComponent(worldId)}`);
    if (r.status !== 200 || r.json === null) throw new Error(`reading the world answered ${r.status}`);
    return r.json;
  }

  /** Worlds on the account (free). The path is not yet checked against the service: see the README. */
  async function listWorlds() {
    const r = await call('GET', '/marble/v1/worlds');
    if (r.status !== 200 || r.json === null) throw new Error(`listing worlds answered ${r.status}`);
    return r.json;
  }

  /** Writes a scrubbed copy of a response under the fixture folder, with a name that says what it is. Returns the file name. */
  function saveFixture(label, value) {
    if (!fixtureDir) throw new Error('WL_FIXTURE_DIR is not set, so there is nowhere to save the fixture');
    mkdirSync(fixtureDir, { recursive: true });
    const safe = String(label).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80) || 'response';
    const file = join(fixtureDir, `${safe}-${new Date(now()).toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-')}.json`);
    writeFileSync(file, JSON.stringify(scrub(value), null, 2));
    return basename(file);
  }

  /** The tool's view of a world: every address replaced by a description of it, never the address. */
  function worldSummary(w) {
    const urls = assetUrls(w);
    return { ...scrub(w), assetsDescribed: Object.fromEntries(Object.entries(urls).map(([k, u]) => [k, describeUrl(u)])) };
  }

  return { credits, spendStatus, generate, operation, world, listWorlds, saveFixture, worldSummary, base, _redact: redact };
}

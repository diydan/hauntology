// The runner behind tools/worldlabs-spike/spike.mjs (world-pipeline Spike 1.1). It makes one world from one picture on the
// World Labs World API, and records what the service really answers: asset names, formats, how long it took, what it cost,
// whether the asset addresses carry an expiry. It spends credits ONLY when `spend` is true; without it, it checks the
// balance (free) and prints what it would do.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

export const MODELS = ['marble-1.0-draft', 'marble-1.0', 'marble-1.1', 'marble-1.1-plus'];
export const CREDITS_PER_DOLLAR = 1250;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const DEFAULT_BASE = 'https://api.worldlabs.ai';

/**
 * Credits for one world from one ordinary (non-panorama) image, from https://docs.worldlabs.ai/api/pricing.md:
 * a pano step of 80 (0 for a panorama), then 150 for the draft model or 1,500 for the others.
 * `marble-1.1-plus` may add up to 1,500 more for a larger world, so its ceiling is higher than its estimate.
 */
export function estimateCredits(model, { isPano = false } = {}) {
  if (!MODELS.includes(model)) throw new Error(`unknown model ${model}`);
  const pano = isPano ? 0 : 80;
  const world = model === 'marble-1.0-draft' ? 150 : 1500;
  const extra = model === 'marble-1.1-plus' ? 1500 : 0;
  return { pano, world, total: pano + world, ceiling: pano + world + extra, dollars: (pano + world) / CREDITS_PER_DOLLAR };
}

/** Only the real service, or this machine (for the tests): the key is never sent anywhere else. */
export function checkBase(base) {
  let u;
  try { u = new URL(base); } catch { throw new Error('the API base is not a URL'); }
  const local = u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
  if (!(base === DEFAULT_BASE || local)) throw new Error(`the key is only sent to ${DEFAULT_BASE} (or a local test server), not to ${u.origin}`);
  return u.origin;
}

const SECRET_KEYS = new Set(['operation_id', 'world_id', 'id', 'world_marble_url']);

/**
 * A copy of a response that is safe to commit: every address becomes `<url>`, and the ids and the Marble page become
 * placeholders. Key names, numbers, formats and the shape stay, which is what a fixture is for.
 */
export function scrub(value, key = '') {
  if (typeof value === 'string') {
    if (SECRET_KEYS.has(key)) return `<${key}>`;
    if (/^(https?:)?\/\//i.test(value)) return '<url>';
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, key));
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v, k)]));
  return value;
}

const EXPIRY_PARAMS = /^(expires?|x-amz-expires|x-goog-expires|exp|se|signature|x-amz-signature|sig|token|policy|key-pair-id)$/i;

/** What an asset address shows about itself without keeping it: host, extension, and the names of its query parameters. */
export function describeUrl(url) {
  try {
    const u = new URL(url);
    const names = [...u.searchParams.keys()];
    return {
      host: u.hostname,
      extension: extname(u.pathname).replace('.', '').toLowerCase() || null,
      queryParams: names,
      looksSigned: names.some((n) => EXPIRY_PARAMS.test(n)),
    };
  } catch {
    return { host: null, extension: null, queryParams: [], looksSigned: false };
  }
}

/** Every asset address of a world, with a name for it. */
export function assetUrls(world) {
  const a = world?.assets ?? {};
  const out = {};
  for (const [lod, url] of Object.entries(a.splats?.spz_urls ?? {})) if (typeof url === 'string') out[`spz_${lod}`] = url;
  for (const [name, url] of Object.entries({
    collider_mesh: a.mesh?.collider_mesh_url, full_res_mesh: a.mesh?.full_res_mesh_url, hq_mesh: a.mesh?.hq_mesh_url,
    pano: a.imagery?.pano_url, thumbnail: a.thumbnail_url,
  })) if (typeof url === 'string') out[name] = url;
  return out;
}

const timestamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');

export async function runSpike(o) {
  const log = o.log ?? (() => {});
  const fetchImpl = o.fetchImpl ?? fetch;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = o.now ?? (() => Date.now());
  const model = o.model ?? 'marble-1.0-draft';
  const base = checkBase(o.apiBase ?? DEFAULT_BASE);
  const key = o.apiKey;
  if (!key) throw new Error('WLT_API_KEY is not set. It must be a World API key from platform.worldlabs.ai (the Atlas CLI key does not work here).');
  const redact = (s) => String(s).split(key).join('<key>');

  // The picture.
  if (!o.image || !existsSync(o.image)) throw new Error('--image must be a file that exists');
  const ext = extname(o.image).replace('.', '').toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) throw new Error('the picture must be a jpg, jpeg, png or webp');
  const bytes = readFileSync(o.image);
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new Error(`the picture must be between 1 byte and ${MAX_IMAGE_BYTES} bytes`);

  // The cost, and the caps, before anything is asked of the service.
  const est = estimateCredits(model, { isPano: o.isPano === true });
  const maxCredits = o.maxCredits ?? 300;
  const maxTotal = o.maxTotal ?? 6000;
  if (est.ceiling > maxCredits) throw new Error(`${model} can cost up to ${est.ceiling} credits; --max-credits is ${maxCredits}`);
  const ledgerPath = o.ledgerPath;
  const ledger = ledgerPath && existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : { spent: 0, runs: [] };
  if (ledger.spent + est.ceiling > maxTotal) throw new Error(`the ledger says ${ledger.spent} credits are spent; another ${est.ceiling} would pass the total cap of ${maxTotal}`);

  const call = async (method, path, body) => {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { 'WLT-Api-Key': key, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, json, text };
  };

  // The balance: free.
  const before = await call('GET', '/marble/v1/credits');
  if (before.status !== 200 || typeof before.json?.remaining_credits !== 'number') throw new Error(`the credit check answered ${before.status}: is this a World API key?`);
  const balance = before.json.remaining_credits;
  log(`balance: ${balance} credits (${(balance / CREDITS_PER_DOLLAR).toFixed(2)} USD)`);
  log(`plan: ${model}, one ${(bytes.length / 1024).toFixed(0)} KiB ${ext} picture, about ${est.total} credits (${est.dollars.toFixed(2)} USD)${est.ceiling > est.total ? `, up to ${est.ceiling}` : ''}`);
  if (balance < est.ceiling) throw new Error(`the balance (${balance}) is below the most this could cost (${est.ceiling}). The service allows going below zero and bills the overage at the end of the month, so this stops here.`);

  const request = {
    display_name: 'hauntology-spike',
    model,
    permission: { public: false, allow_id_access: false, allowed_readers: [], allowed_writers: [] },
    world_prompt: { type: 'image', image_prompt: { source: 'data_base64', data_base64: bytes.toString('base64'), extension: ext === 'jpeg' ? 'jpg' : ext } },
  };
  if (o.spend !== true) {
    log('dry run: nothing was sent. Add --yes-spend to make the world.');
    log(`request would be: ${JSON.stringify({ ...request, world_prompt: { ...request.world_prompt, image_prompt: { ...request.world_prompt.image_prompt, data_base64: `<${bytes.length} bytes>` } } })}`);
    return { dryRun: true, estimate: est, balance };
  }

  // Spend. The ledger is written first, at the estimate, so an interrupted run still counts.
  const started = now();
  const runRecord = { at: new Date(started).toISOString(), model, estimated: est.total, actual: null };
  ledger.runs.push(runRecord);
  ledger.spent += est.total;
  if (ledgerPath) writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));

  const gen = await call('POST', '/marble/v1/worlds:generate', request);
  if (gen.status !== 200 || typeof gen.json?.operation_id !== 'string') {
    ledger.spent -= est.total; runRecord.estimated = 0; runRecord.note = `refused with ${gen.status}`;
    if (ledgerPath) writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
    const retry = gen.headers.get('retry-after');
    const detail = redact(typeof gen.json?.detail === 'string' ? gen.json.detail : '').replace(/https?:\/\/\S+/g, '<url>').slice(0, 200);
    throw new Error(`generate was refused with ${gen.status}${retry ? ` (Retry-After ${retry})` : ''}${detail ? `: ${detail}` : ''}`);
  }
  const operationId = gen.json.operation_id;
  log(`started; operation ${operationId.slice(0, 8)}...`);

  // Poll: free.
  const timeline = [];
  let op = gen.json;
  const deadline = started + (o.timeoutMs ?? 20 * 60 * 1000);
  while (op.done !== true) {
    if (now() >= deadline) { runRecord.note = 'timed out; the service may still charge'; if (ledgerPath) writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2)); throw new Error('gave up after the timeout; the operation may still finish and be charged'); }
    await sleep(o.pollMs ?? 10_000);
    const r = await call('GET', `/marble/v1/operations/${operationId}`);
    if (r.status === 429) { const wait = Number(r.headers.get('retry-after') ?? 10) * 1000; await sleep(wait); continue; }
    if (r.status !== 200 || r.json === null) throw new Error(`polling answered ${r.status}`);
    op = r.json;
    timeline.push({ seconds: Math.round((now() - started) / 1000), status: op.metadata?.progress?.status ?? null, description: op.metadata?.progress?.description ?? null, done: op.done === true });
  }
  const wall = Math.round((now() - started) / 1000);
  runRecord.actual = op.cost?.total_credits ?? null;
  if (op.cost?.total_credits !== undefined) { ledger.spent += op.cost.total_credits - est.total; if (ledgerPath) writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2)); }

  const summary = {
    model, wallClockSeconds: wall, timeline, cost: op.cost ?? null, error: op.error ?? null, operationExpiresInMinutes: op.expires_at && op.created_at ? Math.round((Date.parse(op.expires_at) - Date.parse(op.created_at)) / 60000) : null,
    pictureBytes: bytes.length, pictureExtension: ext, assets: {},
  };
  const world = op.error ? null : op.response;
  if (world) {
    const assets = world.assets ?? {};
    summary.world = {
      idField: 'world_id' in world ? 'world_id' : 'id' in world ? 'id' : null,
      assetKeys: { top: Object.keys(assets), splats: Object.keys(assets.splats ?? {}), mesh: Object.keys(assets.mesh ?? {}), imagery: Object.keys(assets.imagery ?? {}) },
      semantics: assets.splats?.semantics_metadata ?? null,
      captionCharacters: typeof assets.caption === 'string' ? assets.caption.length : null,
      model: world.model ?? null,
    };
    for (const [name, url] of Object.entries(assetUrls(world))) {
      const info = { ...describeUrl(url) };
      try {
        const head = await fetchImpl(url, { method: 'HEAD' });
        info.head = { status: head.status, contentType: head.headers.get('content-type'), contentLength: head.headers.get('content-length'), acceptRanges: head.headers.get('accept-ranges'), cacheControl: head.headers.get('cache-control') };
        if (o.downloadDir && head.status === 200) {
          mkdirSync(o.downloadDir, { recursive: true });
          const res = await fetchImpl(url);
          writeFileSync(join(o.downloadDir, `${name}.${info.extension ?? 'bin'}`), Buffer.from(await res.arrayBuffer()));
        }
      } catch (e) { info.head = { error: redact(e.message).slice(0, 120) }; }
      summary.assets[name] = info;
    }
    if (o.deleteAfter) {
      const del = await call('DELETE', `/marble/v1/worlds/${world.world_id ?? world.id ?? op.metadata?.world_id}`);
      summary.delete = { status: del.status };
      const firstUrl = Object.values(assetUrls(world))[0];
      if (firstUrl) { try { summary.delete.assetStatusAfter = (await fetchImpl(firstUrl, { method: 'HEAD' })).status; } catch (e) { summary.delete.assetStatusAfter = redact(e.message).slice(0, 60); } }
    }
  }

  const after = await call('GET', '/marble/v1/credits');
  summary.balanceBefore = balance;
  summary.balanceAfter = typeof after.json?.remaining_credits === 'number' ? after.json.remaining_credits : null;

  // Save, scrubbed.
  const outDir = o.outDir;
  let files = [];
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    const stamp = `${model}-${timestamp(new Date(started))}`;
    const fixture = join(outDir, `${stamp}.json`);
    const summaryFile = join(outDir, `${stamp}-summary.json`);
    writeFileSync(fixture, JSON.stringify(scrub(op), null, 2));
    writeFileSync(summaryFile, JSON.stringify(scrub(summary), null, 2));
    files = [fixture, summaryFile];
  }
  log(`done in ${wall} s; cost ${op.cost?.total_credits ?? 'unknown'} credits; ${files.length ? `saved ${files.map((f) => basename(f)).join(', ')}` : 'nothing saved'}`);
  return { dryRun: false, summary, files, operation: op };
}

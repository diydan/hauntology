// The working half of tools/ingest-gallery/ingest.mjs (world-pipeline 9.1), as functions with their file system and `wrangler` passed in
// so they can be tested. It builds the Gallery's `gallery/<id>/world.json` files with the app's own manifest builder (shared/src/world/
// gallery.ts, which calls `buildManifest`), and puts the bundles in R2. It makes no call to any paid service and no network call of its own.
//
// Upload rules, fixed and tested:
//   - nothing is uploaded unless the caller asks; the default target is the LOCAL bucket `wrangler dev` uses, and a real bucket (`remote`) needs `yes`;
//   - every object is first compared with what is already there: identical is skipped, different stops the run unless `overwrite` is set;
//   - every upload is read back and compared (size and SHA-256); a mismatch stops the run;
//   - one request at a time, no retries, stops at the first problem; starting again skips what is done;
//   - only keys `gallery/<id>/<name>` for the plan's own ids are ever named, and `world.json` of a world is written after its files,
//     so a half-uploaded world has no manifest and is not found.
import { createHash } from 'node:crypto';
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

export const HEAD_BYTES = 16;
export const DEFAULT_BUCKET = 'hauntology-worlds';
export const BUCKET_PATTERN = /^[a-z0-9][a-z0-9-]{2,62}$/;
export const JURISDICTIONS = ['eu', 'fedramp'];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Reads and checks a plan file. `{ ok: false, errors }` for a file that is missing, is not JSON, or is not a plan. */
export function readPlan(planPath, shared) {
  let text;
  try {
    text = readFileSync(planPath, 'utf8');
  } catch (error) {
    return { ok: false, errors: [`cannot read ${planPath}: ${error.code ?? error.message}`] };
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`${planPath} is not valid JSON: ${error.message}`] };
  }
  const parsed = shared.gallery.parseGalleryPlan(json);
  return parsed.ok ? { ok: true, plan: parsed.plan, dir: dirname(resolve(planPath)) } : { ok: false, errors: parsed.errors };
}

/** Every file path a world's plan names. */
export const filesOf = (world) => [...world.files.splat.map((s) => s.file), ...(world.files.collider ? [world.files.collider] : []), ...(world.files.pano ? [world.files.pano] : []), world.files.thumb];

/** The real path of a plan file if it is a regular file inside the plan's folder (a link out of it does not count), else null. */
function insidePath(dir, file) {
  try {
    const base = realpathSync(dir);
    const real = realpathSync(resolve(dir, file));
    return real.startsWith(base + sep) && statSync(real).isFile() ? real : null;
  } catch {
    return null;
  }
}

/** What the builder needs to know about each file of a world: its size and first bytes. A file that cannot be read is left out, and the builder says it is missing. */
export function factsFor(world, dir) {
  const facts = new Map();
  for (const file of filesOf(world)) {
    const real = insidePath(dir, file);
    if (real === null) continue;
    const bytes = statSync(real).size;
    const head = Buffer.alloc(Math.min(HEAD_BYTES, bytes));
    const fd = openSync(real, 'r');
    try { readSync(fd, head, 0, head.length, 0); } finally { closeSync(fd); }
    facts.set(file, { bytes, head: Uint8Array.from(head) });
  }
  return facts;
}

/** Builds every world of a plan. `failed` is true when any one could not be built: the caller then writes nothing. */
export function ingestPlan(shared, plan, dir) {
  const createdAt = shared.gallery.planCreatedAt(plan);
  const worlds = plan.worlds.map((w) => ({ plan: w, result: shared.gallery.buildGalleryWorld(w, factsFor(w, dir), createdAt) }));
  return { worlds, failed: worlds.some((w) => !w.result.ok) };
}

/** What a plan is, in lines for a person: one per world, then the Requirement 9.1 count. */
export function summarize(shared, built) {
  const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
  const lines = [];
  for (const { plan, result } of built.worlds) {
    if (!result.ok) {
      lines.push(`FAIL ${plan.id}  ${result.code}: ${result.detail}`);
      continue;
    }
    const total = result.objects.reduce((n, o) => n + o.bytes, 0);
    lines.push(`ok   ${plan.id}  ${result.objects.length} objects, ${mb(total)}  "${result.manifest.title}"  preset ${plan.ghostPreset}  by ${result.manifest.attribution.credit} (${result.manifest.attribution.licence})`);
    for (const w of result.warnings) lines.push(`       note: ${w}`);
  }
  const good = built.worlds.filter((w) => w.result.ok).length;
  const need = shared.gallery.GALLERY_MIN_WORLDS;
  lines.push(`${good} of ${built.worlds.length} worlds are good. Requirement 9.1 asks for at least ${need} Gallery Worlds${good >= need ? ': this plan has enough.' : ': this plan has fewer, which is fine for one run.'}`);
  return lines;
}

/** Writes `<outDir>/gallery/<id>/...` for every world: the files as they will be named in the bucket, `world.json` last. Nothing else is touched. */
export function stage(built, dir, outDir) {
  const written = [];
  for (const { plan, result } of built.worlds) {
    if (!result.ok) throw new Error(`refusing to stage ${plan.id}: it did not build`);
    const target = join(outDir, 'gallery', plan.id);
    mkdirSync(target, { recursive: true });
    for (const o of result.objects) {
      const to = join(target, o.name);
      if (o.role === 'manifest') writeFileSync(to, result.manifestJson);
      else copyFileSync(insidePath(dir, o.from) ?? (() => { throw new Error(`${o.from} is no longer there`); })(), to);
      written.push(to);
    }
  }
  return written;
}

/** The objects an upload would put: each with its bucket path, where its bytes are (a file, or text for a manifest), and its type. A world's manifest is last in its own group. */
export function planObjects(built, dir, bucket) {
  if (!BUCKET_PATTERN.test(bucket)) throw new Error(`"${bucket}" is not a valid bucket name`);
  const objects = [];
  for (const { plan, result } of built.worlds) {
    if (!result.ok) throw new Error(`refusing to plan ${plan.id}: it did not build`);
    for (const o of result.objects) {
      const key = `gallery/${plan.id}/${o.name}`;
      objects.push({ id: plan.id, key, object: `${bucket}/${key}`, contentType: o.contentType, bytes: o.bytes, ...(o.role === 'manifest' ? { text: result.manifestJson } : { file: insidePath(dir, o.from) }) });
    }
  }
  return objects;
}

const deleteCommand = (object, flags) => `pnpm --filter api exec wrangler r2 object delete ${object} ${flags.join(' ')}`;

/**
 * Puts the objects in R2 through `wrangler` (the owner's own login; nothing is stored).
 * @param {object} o
 * @param {ReturnType<typeof planObjects>} o.objects
 * @param {string} o.bucket
 * @param {'local' | 'remote'} o.mode  `local` is the bucket `wrangler dev` reads; `remote` is the real one
 * @param {string | null} [o.persistTo]  local mode only: the folder of the local bucket (default is the API's own `.wrangler/state`)
 * @param {string | null} [o.jurisdiction]
 * @param {boolean} [o.overwrite]  replace an object that is there with different bytes
 * @param {(args: string[]) => { status: number | null, stdout: string, stderr: string }} o.run  runs `wrangler <args>`
 * @param {(line: string) => void} [o.log]
 */
export function uploadObjects({ objects, bucket, mode, persistTo = null, jurisdiction = null, overwrite = false, run, log = () => {} }) {
  const uploaded = [];
  const already = [];
  const replaced = [];
  let stopped = null;
  if (mode !== 'local' && mode !== 'remote') return { uploaded, already, replaced, stopped: { kind: 'error', message: 'mode must be local or remote' } };
  if (jurisdiction !== null && !JURISDICTIONS.includes(jurisdiction)) return { uploaded, already, replaced, stopped: { kind: 'error', message: `jurisdiction must be one of ${JURISDICTIONS.join(', ')}` } };
  const where = mode === 'local' ? ['--local', ...(persistTo !== null ? ['--persist-to', persistTo] : [])] : ['--remote'];
  const jur = jurisdiction === null ? [] : ['--jurisdiction', jurisdiction];
  const flags = [...where, ...jur];

  // A real bucket must exist (read-only check). The local bucket is made by wrangler when it is first written.
  if (mode === 'remote') {
    const info = run(['r2', 'bucket', 'info', bucket, ...jur]);
    if (info.status !== 0) {
      const text = `${info.stdout}\n${info.stderr}`;
      const message = /bucket does not exist|10006/i.test(text)
        ? `the bucket "${bucket}" does not exist in this account. Create it first: pnpm --filter api exec wrangler r2 bucket create ${bucket}`
        : `could not check the bucket "${bucket}" (are you logged in? try: pnpm --filter api exec wrangler whoami): ${text.trim().slice(0, 300)}`;
      return { uploaded, already, replaced, stopped: { kind: 'error', message } };
    }
  }

  const work = mkdtempSync(join(tmpdir(), 'gallery-ingest-'));
  /** The bytes of an object, null when the key is not there; throws for any other failure. */
  const fetchOne = (object, tag) => {
    const dest = join(work, tag);
    const r = run(['r2', 'object', 'get', object, ...flags, '--file', dest]);
    if (r.status === 0) return readFileSync(dest);
    if (/specified key does not exist|10007|NoSuchKey/i.test(`${r.stdout}\n${r.stderr}`)) return null;
    throw new Error(`could not check ${object}: ${`${r.stdout}\n${r.stderr}`.trim().slice(0, 300)}`);
  };

  try {
    for (const [i, o] of objects.entries()) {
      const label = `${i + 1}/${objects.length} ${o.key}`;
      let path = o.file;
      if (o.text !== undefined) {
        path = join(work, `source-${i}`);
        writeFileSync(path, o.text);
      }
      const local = readFileSync(path);
      const localHash = sha256(local);

      let remote;
      try { remote = fetchOne(o.object, `check-${i}`); } catch (error) { stopped = { kind: 'error', object: o, message: error.message }; break; }
      let replacing = false;
      if (remote !== null) {
        if (sha256(remote) === localHash) { already.push(o); log(`skip ${label}  already there, identical`); continue; }
        if (!overwrite) {
          stopped = { kind: 'conflict', object: o, message: `${o.object} already exists with DIFFERENT bytes. Not overwritten. To replace it (a world you have tuned again), run again with --overwrite; to remove it first: ${deleteCommand(o.object, flags)}` };
          break;
        }
        replacing = true;
      }

      const put = run(['r2', 'object', 'put', o.object, ...flags, '--content-type', o.contentType, '--file', path]);
      if (put.status !== 0) { stopped = { kind: 'error', object: o, message: `upload of ${o.object} failed: ${`${put.stdout}\n${put.stderr}`.trim().slice(0, 300)}. It may or may not be there; starting again checks first.` }; break; }

      let back;
      try { back = fetchOne(o.object, `verify-${i}`); } catch (error) { stopped = { kind: 'error', object: o, message: `uploaded, but reading ${o.object} back failed: ${error.message}` }; break; }
      if (back === null || back.length !== local.length || sha256(back) !== localHash) {
        stopped = { kind: 'verify', object: o, message: `${o.object} was uploaded but reads back different (or missing). Remove it before trusting it: ${deleteCommand(o.object, flags)}` };
        break;
      }
      (replacing ? replaced : uploaded).push(o);
      log(`${replacing ? 'over' : 'ok  '} ${label}  ${local.length} bytes  ${replacing ? 'replaced' : 'uploaded'} and read back, identical`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return { uploaded, already, replaced, stopped };
}

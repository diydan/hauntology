#!/usr/bin/env node
// Owner-run: turns worlds you already have the files of into Gallery Worlds (world-pipeline task 9.1). It reads a PLAN file, checks every
// file, builds each world's `world.json` with the app's own manifest builder, and writes `gallery/<id>/world.json` and the files it
// names. It makes NO call to World Labs or any paid service. The default only checks and prints; it writes nothing.
//
// Usage: node tools/ingest-gallery/ingest.mjs --plan FILE [--stage DIR] [--upload [--local | --remote [--yes]]] [--bucket NAME]
//                                              [--persist-to DIR] [--jurisdiction eu|fedramp] [--overwrite]
//   --plan         the plan, JSON (see tools/ingest-gallery/README.md). File paths in it are relative to the plan's own folder.
//   --stage DIR    also write DIR/gallery/<id>/... (the files named as they will be in the bucket, world.json last). Touches nothing else.
//   --upload       put the bundles in R2 with `wrangler` and YOUR login. The target is the local bucket `wrangler dev` reads unless --remote.
//   --local        (the default with --upload) the local bucket; --persist-to DIR names its folder (default: the API's .wrangler/state)
//   --remote       the real bucket. Preview only unless --yes is also given.
//   --bucket       the bucket name (default hauntology-worlds, the one in api/wrangler.jsonc)
//   --jurisdiction for a bucket made with one (eu or fedramp)
//   --overwrite    replace an object that is there with different bytes (an object that is identical is always skipped)
// If any world in the plan does not build, nothing is written or uploaded. Exit: 0 ok, 1 a bad plan, a bad file, or an upload that stopped.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BUCKET_PATTERN, DEFAULT_BUCKET, JURISDICTIONS, ingestPlan, planObjects, readPlan, stage, summarize, uploadObjects } from '../lib/gallery-ingest.mjs';
import { loadShared } from '../lib/load-shared.mjs';

const FLAGS_WITH_VALUE = ['--plan', '--stage', '--bucket', '--persist-to', '--jurisdiction'];
const FLAGS = ['--upload', '--local', '--remote', '--yes', '--overwrite', '--help', ...FLAGS_WITH_VALUE];

function fail(message, code = 1) {
  console.error(`ingest-gallery: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { upload: false, local: false, remote: false, yes: false, overwrite: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!FLAGS.includes(a)) fail(`unknown option ${JSON.stringify(a)} (try --help)`);
    if (a === '--help') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); process.exit(0); }
    if (FLAGS_WITH_VALUE.includes(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) fail(`${a} needs a value`);
      opts[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
      i += 1;
    } else opts[a.slice(2)] = true;
  }
  if (opts.plan === undefined) fail('--plan FILE is required (try --help)');
  if (opts.local && opts.remote) fail('--local and --remote cannot be used together');
  if ((opts.local || opts.remote || opts.yes || opts.overwrite || opts.bucket !== undefined || opts.persistTo !== undefined || opts.jurisdiction !== undefined) && !opts.upload) fail('--local, --remote, --yes, --overwrite, --bucket, --persist-to and --jurisdiction only go with --upload');
  if (opts.persistTo !== undefined && opts.remote) fail('--persist-to is for the local bucket only');
  if (opts.yes && !opts.remote) fail('--yes only goes with --remote (the local bucket needs no confirmation)');
  if (opts.bucket !== undefined && !BUCKET_PATTERN.test(opts.bucket)) fail(`"${opts.bucket}" is not a valid bucket name`);
  if (opts.jurisdiction !== undefined && !JURISDICTIONS.includes(opts.jurisdiction)) fail(`--jurisdiction must be one of ${JURISDICTIONS.join(', ')}`);
  return opts;
}

/** Run `wrangler <args>` with the OWNER's login. $GALLERY_WRANGLER replaces the command (tests use a fake). Arguments are an array, never a shell string. */
function runWrangler(args) {
  const custom = process.env.GALLERY_WRANGLER;
  const [cmd, pre] = custom ? [custom, []] : ['pnpm', ['--filter', 'api', 'exec', 'wrangler']];
  const r = spawnSync(cmd, [...pre, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? (r.error ? String(r.error.message) : '') };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let shared;
  try { shared = await loadShared(); } catch (error) { fail(error.message); }

  const read = readPlan(opts.plan, shared);
  if (!read.ok) { for (const e of read.errors) console.error(`  ${e}`); fail('the plan is not usable. Nothing was written.'); }

  const built = ingestPlan(shared, read.plan, read.dir);
  for (const line of summarize(shared, built)) console.log(line);
  if (built.failed) fail('at least one world did not build. Nothing was written or uploaded.');

  if (opts.stage !== undefined) {
    const written = stage(built, read.dir, opts.stage);
    console.log(`staged ${written.length} files under ${opts.stage}/gallery/`);
  }

  if (!opts.upload) {
    console.log(opts.stage === undefined ? 'Checked only: nothing was written. Add --stage DIR to write the bundles, or --upload to put them in R2.' : 'Nothing was uploaded.');
    return;
  }

  const bucket = opts.bucket ?? DEFAULT_BUCKET;
  const mode = opts.remote ? 'remote' : 'local';
  const objects = planObjects(built, read.dir, bucket);
  const total = objects.reduce((n, o) => n + o.bytes, 0);
  const target = mode === 'local' ? `the LOCAL bucket "${bucket}" (what wrangler dev reads${opts.persistTo ? `, in ${opts.persistTo}` : ''})` : `the REAL bucket "${bucket}" in your Cloudflare account`;
  console.log(`${objects.length} objects, ${(total / 1e6).toFixed(1)} MB, for ${target}:`);
  for (const o of objects) console.log(`  ${o.object}  (${o.contentType}, ${o.bytes} bytes)`);
  if (mode === 'remote' && !opts.yes) {
    console.log('Preview only: nothing was uploaded. Add --yes to upload these to the real bucket (storage costs cents; objects stay until you delete them).');
    return;
  }

  const result = uploadObjects({ objects, bucket, mode, persistTo: opts.persistTo ?? null, jurisdiction: opts.jurisdiction ?? null, overwrite: opts.overwrite, run: runWrangler, log: (l) => console.log(l) });
  console.log(`uploaded ${result.uploaded.length}, replaced ${result.replaced.length}, already there ${result.already.length}.`);
  if (result.stopped) fail(result.stopped.message);
}

main().catch((error) => fail(error.message));

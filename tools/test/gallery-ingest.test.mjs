// Tests for tools/ingest-gallery/ingest.mjs and tools/lib/gallery-ingest.mjs (world-pipeline 9.1), against real files in a temp folder and a FAKE
// wrangler (fake-wrangler-r2.mjs) that keeps "R2" in another. The shared TypeScript they build with is the app's own. Nothing here touches a
// real account, the network or a paid service.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { factsFor, ingestPlan, planObjects, readPlan, summarize, uploadObjects } from '../lib/gallery-ingest.mjs';
import { loadShared } from '../lib/load-shared.mjs';

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const cli = join(root, 'tools/ingest-gallery/ingest.mjs');
const fake = join(here, 'fake-wrangler-r2.mjs');
const BUCKET = 'hauntology-worlds';
const shared = await loadShared();
const sha = (b) => createHash('sha256').update(b).digest('hex');

const spz = (seed) => gzipSync(Buffer.from(`splat ${seed} `.repeat(400)));
const glb = (seed) => Buffer.concat([Buffer.from('glTF'), Buffer.from([2, 0, 0, 0]), Buffer.from(`collider ${seed}`.repeat(30))]);
const jpg = (seed) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), Buffer.from(`JFIF thumb ${seed}`.repeat(20))]);

const worldPlan = (id, extra = {}) => ({
  id,
  title: `The ${id}`,
  brief: `A quiet place called ${id}, with one window and a worn floor.`,
  ghostPreset: 'wistful-cook',
  attribution: { credit: 'Self-made, with World Labs Marble', licence: 'CC0' },
  files: { splat: [{ file: `${id}/splat-500k.spz`, lod: '500k' }], collider: `${id}/collider.glb`, thumb: `${id}/thumb.jpg` },
  pose: { service: { metricScaleFactor: 1.4, groundPlaneOffset: -0.9 }, spawn: { position: [0, 2.5, 0], yaw: 0.5 } },
  anchors: [{ id: 'a1', pos: [1, 1.5, 2], radius: 1 }],
  ...extra,
});

/** A temp folder with the files of the given worlds, a plan, an empty fake R2 and a log. */
function workspace(ids = ['blue-kitchen']) {
  const base = mkdtempSync(join(tmpdir(), 'gallery-'));
  const dir = join(base, 'plan'); const r2 = join(base, 'r2'); const log = join(base, 'calls.log'); const out = join(base, 'out');
  mkdirSync(dir); mkdirSync(r2);
  for (const id of ids) {
    mkdirSync(join(dir, id));
    writeFileSync(join(dir, id, 'splat-500k.spz'), spz(id));
    writeFileSync(join(dir, id, 'collider.glb'), glb(id));
    writeFileSync(join(dir, id, 'thumb.jpg'), jpg(id));
  }
  const planPath = join(dir, 'plan.json');
  const write = (plan) => writeFileSync(planPath, JSON.stringify(plan, null, 2));
  write({ date: '2026-11-15', worlds: ids.map((id) => worldPlan(id)) });
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const stored = (object) => join(r2, object.replaceAll('/', '__'));
  return { base, dir, r2, log, out, planPath, write, calls, stored, done: () => rmSync(base, { recursive: true, force: true }) };
}
const run = async (w, args, env = {}) => {
  try {
    const { stdout, stderr } = await exec('node', [cli, '--plan', w.planPath, ...args], { env: { ...process.env, GALLERY_WRANGLER: fake, FAKE_R2_DIR: w.r2, FAKE_LOG: w.log, FAKE_BUCKETS: BUCKET, ...env } });
    return { status: 0, stdout, stderr };
  } catch (e) { return { status: e.code, stdout: e.stdout, stderr: e.stderr }; }
};
const puts = (w) => w.calls().filter((c) => c[1] === 'object' && c[2] === 'put');
const gets = (w) => w.calls().filter((c) => c[1] === 'object' && c[2] === 'get');
const tree = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true }).sort() : []);

test('the shared TypeScript loads into plain Node, and is the app\'s own builder', () => {
  assert.equal(typeof shared.gallery.buildGalleryWorld, 'function');
  assert.equal(typeof shared.ingest.buildManifest, 'function');
  assert.equal(typeof shared.manifest.WorldManifestSchema.safeParse, 'function');
  assert.equal(shared.gallery.GALLERY_MIN_WORLDS, 6);
});

test('the tool names no service and makes no network call of its own', () => {
  for (const f of ['tools/ingest-gallery/ingest.mjs', 'tools/lib/gallery-ingest.mjs', 'tools/lib/load-shared.mjs']) {
    const text = readFileSync(join(root, f), 'utf8');
    assert.doesNotMatch(text, /worldlabs\.ai|WLT_API_KEY|WLT-Api-Key|\bfetch\s*\(|node:https?|node:net|XMLHttpRequest/, f);
  }
});

test('readPlan: a missing file, text that is not JSON and a plan with a typo are each said plainly; a good plan gives its folder', () => {
  const w = workspace();
  try {
    assert.deepEqual(readPlan(join(w.base, 'nope.json'), shared), { ok: false, errors: [`cannot read ${join(w.base, 'nope.json')}: ENOENT`] });
    writeFileSync(w.planPath, '{ not json');
    const bad = readPlan(w.planPath, shared);
    assert.equal(bad.ok, false);
    assert.match(bad.errors[0], /is not valid JSON/);
    w.write({ date: '2026-11-15', worlds: [worldPlan('blue-kitchen', { anchor: [] })] });
    const typo = readPlan(w.planPath, shared);
    assert.equal(typo.ok, false);
    assert.match(typo.errors.join('\n'), /worlds\.0: Unrecognized key/);
    w.write({ date: '2026-11-15', worlds: [worldPlan('blue-kitchen')] });
    const good = readPlan(w.planPath, shared);
    assert.equal(good.ok, true);
    assert.equal(good.dir, resolve(w.dir));
  } finally { w.done(); }
});

test('factsFor: size and first bytes of each file; a file outside the folder, a folder and a missing file are left out', () => {
  const w = workspace();
  try {
    const outside = join(w.base, 'outside.spz');
    writeFileSync(outside, spz('o'));
    symlinkSync(outside, join(w.dir, 'blue-kitchen', 'link.spz'));
    mkdirSync(join(w.dir, 'blue-kitchen', 'adir.spz'));
    // A folder beside the plan's whose name begins with the plan folder's name is still outside it.
    const sibling = `${w.dir}-evil`;
    mkdirSync(sibling);
    writeFileSync(join(sibling, 'x.spz'), spz('evil'));
    symlinkSync(join(sibling, 'x.spz'), join(w.dir, 'blue-kitchen', 'sibling.spz'));
    writeFileSync(join(w.dir, 'blue-kitchen', 'tiny.glb'), 'ab');
    const world = worldPlan('blue-kitchen', { files: { splat: [{ file: 'blue-kitchen/link.spz', lod: 'full' }, { file: 'blue-kitchen/sibling.spz', lod: 'full' }, { file: 'blue-kitchen/adir.spz', lod: '100k' }, { file: 'blue-kitchen/splat-500k.spz', lod: '500k' }, { file: 'blue-kitchen/gone.spz', lod: 'full' }], collider: 'blue-kitchen/tiny.glb', thumb: 'blue-kitchen/thumb.jpg' } });
    const facts = factsFor(world, w.dir);
    assert.deepEqual([...facts.keys()].sort(), ['blue-kitchen/splat-500k.spz', 'blue-kitchen/thumb.jpg', 'blue-kitchen/tiny.glb']);
    const f = facts.get('blue-kitchen/splat-500k.spz');
    assert.equal(f.bytes, readFileSync(join(w.dir, 'blue-kitchen', 'splat-500k.spz')).length);
    assert.equal(f.head.length, 16);
    assert.deepEqual([...f.head.slice(0, 2)], [0x1f, 0x8b]);
    assert.deepEqual([...facts.get('blue-kitchen/tiny.glb').head], [0x61, 0x62]);
  } finally { w.done(); }
});

test('the default only checks: it prints each world and writes nothing', async () => {
  const w = workspace(['blue-kitchen', 'attic']);
  try {
    const before = tree(w.base);
    const r = await run(w, []);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /ok   blue-kitchen  4 objects/);
    assert.match(r.stdout, /ok   attic  4 objects/);
    assert.match(r.stdout, /note: bounds are the placeholder box/);
    assert.match(r.stdout, /2 of 2 worlds are good\. Requirement 9\.1 asks for at least 6 Gallery Worlds: this plan has fewer/);
    assert.match(r.stdout, /Checked only: nothing was written/);
    assert.deepEqual(tree(w.base), before);
    assert.deepEqual(w.calls(), []);
  } finally { w.done(); }
});

test('--stage writes gallery/<id>/ with the files under the names the real ingest gives and world.json that the app reads', async () => {
  const w = workspace(['blue-kitchen', 'attic']);
  try {
    const r = await run(w, ['--stage', w.out]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(tree(w.out), ['gallery', 'gallery/attic', 'gallery/attic/collider.glb', 'gallery/attic/splat-500k.spz', 'gallery/attic/thumb.jpg', 'gallery/attic/world.json', 'gallery/blue-kitchen', 'gallery/blue-kitchen/collider.glb', 'gallery/blue-kitchen/splat-500k.spz', 'gallery/blue-kitchen/thumb.jpg', 'gallery/blue-kitchen/world.json']);
    for (const id of ['blue-kitchen', 'attic']) {
      const manifest = shared.manifest.WorldManifestSchema.parse(JSON.parse(readFileSync(join(w.out, 'gallery', id, 'world.json'), 'utf8')));
      assert.equal(manifest.id, id);
      assert.equal(manifest.source, 'gallery');
      assert.equal(manifest.ghostPreset, 'wistful-cook');
      assert.deepEqual(manifest.attribution, { credit: 'Self-made, with World Labs Marble', licence: 'CC0' });
      assert.equal(manifest.createdAt, Date.parse('2026-11-15T00:00:00Z'));
      const names = shared.manifest.assetNames(manifest);
      assert.deepEqual(names.sort(), ['collider.glb', 'splat-500k.spz', 'thumb.jpg']);
      // Each file in the bundle is byte for byte the one in the plan, and its size is the one the manifest says.
      for (const ref of [...manifest.assets.splat, manifest.assets.collider, manifest.assets.thumb]) {
        const bytes = readFileSync(join(w.out, 'gallery', id, ref.path));
        assert.equal(bytes.length, ref.bytes);
        assert.equal(sha(bytes), sha(readFileSync(join(w.dir, id, ref.path === 'splat-500k.spz' ? 'splat-500k.spz' : ref.path))));
      }
    }
    const staged = readFileSync(join(w.out, 'gallery/attic/world.json'), 'utf8');
    assert.ok(staged.endsWith('}\n'));
    assert.equal(staged, `${JSON.stringify(JSON.parse(staged), null, 2)}\n`);
    assert.match(r.stdout, /staged 8 files under /);
    assert.match(r.stdout, /Nothing was uploaded\./);
  } finally { w.done(); }
});

test('running the same plan again writes the same bytes', async () => {
  const w = workspace();
  try {
    await run(w, ['--stage', w.out]);
    const first = sha(readFileSync(join(w.out, 'gallery/blue-kitchen/world.json')));
    rmSync(w.out, { recursive: true });
    await run(w, ['--stage', w.out]);
    assert.equal(sha(readFileSync(join(w.out, 'gallery/blue-kitchen/world.json'))), first);
  } finally { w.done(); }
});

test('a world that does not build stops everything: exit 1, the reason and file named, nothing written even for the good worlds', async () => {
  const cases = [
    ['a missing file', (w) => rmSync(join(w.dir, 'attic', 'collider.glb')), /FAIL attic  file_missing: attic\/collider\.glb: not found/],
    ['a web page saved as a splat', (w) => writeFileSync(join(w.dir, 'attic', 'splat-500k.spz'), '<!DOCTYPE html><html></html>'), /FAIL attic  file_bad_magic: attic\/splat-500k\.spz/],
    ['an empty file', (w) => writeFileSync(join(w.dir, 'attic', 'thumb.jpg'), ''), /FAIL attic  file_size: attic\/thumb\.jpg: 0 bytes/],
    ['a spawn outside the world', (w) => w.write({ date: '2026-11-15', worlds: [worldPlan('blue-kitchen'), worldPlan('attic', { pose: { floorY: 0, spawn: { position: [50, 1.6, 0], yaw: 0 } } })] }), /FAIL attic  pose_invalid: spawn: the position is outside the bounds/],
  ];
  for (const [name, spoil, expected] of cases) {
    const w = workspace(['blue-kitchen', 'attic']);
    try {
      spoil(w);
      const r = await run(w, ['--stage', w.out, '--upload']);
      assert.equal(r.status, 1, name);
      assert.match(r.stdout, expected, name);
      assert.match(r.stdout, /ok   blue-kitchen/, name);
      assert.match(r.stderr, /at least one world did not build\. Nothing was written or uploaded\./, name);
      assert.equal(existsSync(w.out), false, name);
      assert.deepEqual(w.calls(), [], name);
    } finally { w.done(); }
  }
});

test('a plan that is not usable is refused with each problem, and writes nothing', async () => {
  const w = workspace();
  try {
    w.write({ date: '2026-02-30', worlds: [worldPlan('Blue Kitchen'), worldPlan('blue-kitchen', { files: { splat: [{ file: '../x.spz' }], thumb: 't.jpg' } })] });
    const r = await run(w, ['--stage', w.out]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /date: must be a real date/);
    assert.match(r.stderr, /worlds\.0\.id: /);
    assert.match(r.stderr, /must be a relative path inside the plan's folder/);
    assert.match(r.stderr, /the plan is not usable\. Nothing was written\./);
    assert.equal(existsSync(w.out), false);
    assert.equal((await run({ ...w, planPath: join(w.base, 'missing.json') }, [])).status, 1);
  } finally { w.done(); }
});

test('six worlds meet Requirement 9.1, and the summary says so', () => {
  const w = workspace(['a-1-room', 'b-2-room', 'c-3-room', 'd-4-room', 'e-5-room', 'f-6-room']);
  try {
    const read = readPlan(w.planPath, shared);
    const built = ingestPlan(shared, read.plan, read.dir);
    assert.equal(built.failed, false);
    assert.match(summarize(shared, built).at(-1), /6 of 6 worlds are good\. Requirement 9\.1 asks for at least 6 Gallery Worlds: this plan has enough\./);
  } finally { w.done(); }
});

test('--upload defaults to the LOCAL bucket: --local, no --remote, no bucket check, world.json after its files, the right types and keys', async () => {
  const w = workspace(['blue-kitchen', 'attic']);
  try {
    const r = await run(w, ['--upload']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /for the LOCAL bucket "hauntology-worlds"/);
    assert.match(r.stdout, /uploaded 8, replaced 0, already there 0\./);
    const calls = w.calls();
    assert.equal(calls.some((c) => c.includes('--remote')), false);
    assert.equal(calls.some((c) => c[1] === 'bucket'), false);
    assert.ok(calls.every((c) => c.includes('--local')));
    const order = puts(w).map((c) => c[3]);
    assert.deepEqual(order, [
      'hauntology-worlds/gallery/blue-kitchen/splat-500k.spz', 'hauntology-worlds/gallery/blue-kitchen/collider.glb', 'hauntology-worlds/gallery/blue-kitchen/thumb.jpg', 'hauntology-worlds/gallery/blue-kitchen/world.json',
      'hauntology-worlds/gallery/attic/splat-500k.spz', 'hauntology-worlds/gallery/attic/collider.glb', 'hauntology-worlds/gallery/attic/thumb.jpg', 'hauntology-worlds/gallery/attic/world.json',
    ]);
    const types = JSON.parse(readFileSync(join(w.r2, '.types.json'), 'utf8'));
    assert.equal(types['hauntology-worlds/gallery/attic/splat-500k.spz'], 'application/octet-stream');
    assert.equal(types['hauntology-worlds/gallery/attic/collider.glb'], 'model/gltf-binary');
    assert.equal(types['hauntology-worlds/gallery/attic/thumb.jpg'], 'image/jpeg');
    assert.equal(types['hauntology-worlds/gallery/attic/world.json'], 'application/json');
    // What is stored is exactly what the plan's files hold, and the manifest is the one the app reads.
    assert.equal(sha(readFileSync(w.stored('hauntology-worlds/gallery/attic/splat-500k.spz'))), sha(readFileSync(join(w.dir, 'attic', 'splat-500k.spz'))));
    const manifest = shared.manifest.WorldManifestSchema.parse(JSON.parse(readFileSync(w.stored('hauntology-worlds/gallery/attic/world.json'), 'utf8')));
    assert.equal(manifest.id, 'attic');
    // Every call names only a key under gallery/<an id of the plan>/.
    for (const c of calls.filter((x) => x[1] === 'object')) assert.match(c[3], /^hauntology-worlds\/gallery\/(blue-kitchen|attic)\/[A-Za-z0-9._-]+$/);
  } finally { w.done(); }
});

test('--persist-to is passed to every local call, and only to local ones', async () => {
  const w = workspace();
  try {
    const store = join(w.base, 'state');
    const r = await run(w, ['--upload', '--persist-to', store]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(w.calls().every((c) => c[c.indexOf('--persist-to') + 1] === store));
    assert.match(r.stdout, new RegExp(`in ${store.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    const bad = await run(w, ['--upload', '--remote', '--persist-to', store]);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /--persist-to is for the local bucket only/);
  } finally { w.done(); }
});

test('uploading again skips everything that is identical: no put at all', async () => {
  const w = workspace();
  try {
    await run(w, ['--upload']);
    const putsBefore = puts(w).length;
    const r = await run(w, ['--upload']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /uploaded 0, replaced 0, already there 4\./);
    assert.equal(puts(w).length, putsBefore);
  } finally { w.done(); }
});

test('an object that is there with different bytes stops the run, with the way out; --overwrite replaces it, the manifest last', async () => {
  const w = workspace();
  try {
    await run(w, ['--upload']);
    writeFileSync(join(w.dir, 'blue-kitchen', 'collider.glb'), glb('changed'));
    w.write({ date: '2026-11-15', worlds: [worldPlan('blue-kitchen')] });
    const stopped = await run(w, ['--upload']);
    assert.equal(stopped.status, 1);
    assert.match(stopped.stderr, /hauntology-worlds\/gallery\/blue-kitchen\/collider\.glb already exists with DIFFERENT bytes\. Not overwritten\./);
    assert.match(stopped.stderr, /--overwrite/);
    assert.match(stopped.stderr, /pnpm --filter api exec wrangler r2 object delete hauntology-worlds\/gallery\/blue-kitchen\/collider\.glb --local/);
    const before = puts(w).length;
    const again = await run(w, ['--upload', '--overwrite']);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /uploaded 0, replaced 2, already there 2\./);
    // The changed file, and then the manifest (its size changed), in that order.
    assert.deepEqual(puts(w).slice(before).map((c) => c[3].split('/').pop()), ['collider.glb', 'world.json']);
    assert.equal(sha(readFileSync(w.stored('hauntology-worlds/gallery/blue-kitchen/collider.glb'))), sha(glb('changed')));
  } finally { w.done(); }
});

test('--remote without --yes is a preview: not one wrangler call', async () => {
  const w = workspace();
  try {
    const r = await run(w, ['--upload', '--remote']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /for the REAL bucket "hauntology-worlds"/);
    assert.match(r.stdout, /gallery\/blue-kitchen\/world\.json/);
    assert.match(r.stdout, /Preview only: nothing was uploaded\./);
    assert.deepEqual(w.calls(), []);
    assert.deepEqual(readdirSync(w.r2), []);
  } finally { w.done(); }
});

test('--remote --yes checks the bucket first, uses --remote on every call, and a missing bucket stops with how to make it', async () => {
  const w = workspace();
  try {
    const missing = await run(w, ['--upload', '--remote', '--yes'], { FAKE_BUCKETS: 'some-other-bucket' });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /the bucket "hauntology-worlds" does not exist in this account\. Create it first: pnpm --filter api exec wrangler r2 bucket create hauntology-worlds/);
    assert.equal(puts(w).length, 0);
    const r = await run(w, ['--upload', '--remote', '--yes']);
    assert.equal(r.status, 0, r.stderr);
    const calls = w.calls();
    const bucketCalls = calls.filter((c) => c[1] === 'bucket');
    assert.equal(bucketCalls.length, 2);
    assert.ok(calls.filter((c) => c[1] === 'object').every((c) => c.includes('--remote') && !c.includes('--local')));
    assert.equal(puts(w).length, 4);
  } finally { w.done(); }
});

test('a bucket name and a jurisdiction are passed on', async () => {
  const w = workspace();
  try {
    const r = await run(w, ['--upload', '--remote', '--yes', '--bucket', 'my-worlds', '--jurisdiction', 'eu'], { FAKE_BUCKETS: 'my-worlds' });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(w.calls().every((c) => c.includes('--jurisdiction') && c[c.indexOf('--jurisdiction') + 1] === 'eu'));
    assert.ok(puts(w).every((c) => c[3].startsWith('my-worlds/gallery/blue-kitchen/')));
  } finally { w.done(); }
});

test('an upload that fails stops at once, and the world has no manifest, so it is not found', async () => {
  const w = workspace();
  try {
    const r = await run(w, ['--upload'], { FAKE_FAIL: 'put:2' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /upload of hauntology-worlds\/gallery\/blue-kitchen\/collider\.glb failed/);
    assert.equal(puts(w).length, 2);
    assert.equal(existsSync(w.stored('hauntology-worlds/gallery/blue-kitchen/world.json')), false);
    // Starting again finishes the job and skips the file that was done.
    const again = await run(w, ['--upload']);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /uploaded 3, replaced 0, already there 1\./);
  } finally { w.done(); }
});

test('an object that reads back different stops the run, and says how to remove it', async () => {
  const w = workspace();
  try {
    const r = await run(w, ['--upload'], { FAKE_FAIL: 'corrupt-put' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /was uploaded but reads back different \(or missing\)\. Remove it before trusting it: pnpm --filter api exec wrangler r2 object delete hauntology-worlds\/gallery\/blue-kitchen\/splat-500k\.spz --local/);
    assert.equal(puts(w).length, 1);
  } finally { w.done(); }
});

test('an object that reads back with the same size but other bytes is caught too', async () => {
  const w = workspace();
  try {
    const r = await run(w, ['--upload'], { FAKE_FAIL: 'flip-put' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /was uploaded but reads back different \(or missing\)/);
    assert.equal(puts(w).length, 1);
  } finally { w.done(); }
});

test('an authentication failure while checking stops before any put', async () => {
  const w = workspace();
  try {
    const r = await run(w, ['--upload', '--remote', '--yes'], { FAKE_FAIL: 'get-auth' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /could not check hauntology-worlds\/gallery\/blue-kitchen\/splat-500k\.spz: .*Authentication error/s);
    assert.equal(puts(w).length, 0);
  } finally { w.done(); }
});

test('uploadObjects refuses a mode or a jurisdiction it does not know, before any call', () => {
  const run = () => { throw new Error('must not be called'); };
  assert.match(uploadObjects({ objects: [], bucket: BUCKET, mode: 'both', run }).stopped.message, /mode must be local or remote/);
  assert.match(uploadObjects({ objects: [], bucket: BUCKET, mode: 'local', jurisdiction: 'mars', run }).stopped.message, /jurisdiction must be one of eu, fedramp/);
});

test('planObjects names only gallery/<id>/ keys, refuses a bad bucket name, and will not plan a world that did not build', () => {
  const w = workspace(['blue-kitchen']);
  try {
    const read = readPlan(w.planPath, shared);
    const built = ingestPlan(shared, read.plan, read.dir);
    const objects = planObjects(built, read.dir, BUCKET);
    assert.deepEqual(objects.map((o) => o.key), ['gallery/blue-kitchen/splat-500k.spz', 'gallery/blue-kitchen/collider.glb', 'gallery/blue-kitchen/thumb.jpg', 'gallery/blue-kitchen/world.json']);
    assert.ok(objects.slice(0, 3).every((o) => typeof o.file === 'string' && o.text === undefined));
    assert.equal(typeof objects[3].text, 'string');
    for (const bucket of ['', 'A', 'ab', '-abc', 'a/b', 'abc def', '../x']) assert.throws(() => planObjects(built, read.dir, bucket), /not a valid bucket name/, bucket);
    rmSync(join(w.dir, 'blue-kitchen', 'thumb.jpg'));
    const broken = ingestPlan(shared, read.plan, read.dir);
    assert.throws(() => planObjects(broken, read.dir, BUCKET), /did not build/);
  } finally { w.done(); }
});

test('the command line refuses options that do not belong together', async () => {
  const w = workspace();
  try {
    const cases = [
      [['--yes'], /only go with --upload/],
      [['--upload', '--yes'], /--yes only goes with --remote/],
      [['--upload', '--local', '--remote'], /cannot be used together/],
      [['--overwrite'], /only go with --upload/],
      [['--upload', '--bucket', 'A'], /not a valid bucket name/],
      [['--upload', '--jurisdiction', 'mars'], /--jurisdiction must be one of/],
      [['--stage'], /--stage needs a value/],
      [['--nope'], /unknown option "--nope"/],
    ];
    for (const [args, expected] of cases) {
      const r = await run(w, args);
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, expected, args.join(' '));
    }
    assert.deepEqual(w.calls(), []);
    let r;
    try { await exec('node', [cli]); } catch (e) { r = e; }
    assert.equal(r.code, 1);
    assert.match(r.stderr, /--plan FILE is required/);
  } finally { w.done(); }
});

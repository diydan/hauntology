// Tests for `tools/prerender-voice.mjs --upload` and tools/lib/prerender-upload.mjs, against a FAKE wrangler (fake-wrangler.mjs)
// that keeps "R2" in a temp folder. Nothing here touches a real account.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { toolsAvailable } from '../lib/audio-check.mjs';
import { fileNameFor, planPrerender, resolveVoice } from '../lib/prerender-plan.mjs';
import { makeMp3 } from './mp3-helper.mjs';

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const manifest = JSON.parse(readFileSync(join(root, 'shared/fixtures/voice-library.json'), 'utf8'));
const cli = join(root, 'tools/prerender-voice.mjs');
const fake = join(here, 'fake-wrangler.mjs');
const skip = !toolsAvailable() && 'ffmpeg or ffprobe is missing';
const BUCKET = 'hauntology-worlds';
const MARK = resolveVoice('Mark', manifest);
const markEntries = manifest.entries.filter((e) => e.voice === MARK);

// A different real MP3 per line, so a mix-up between lines would show.
const clips = skip ? [] : markEntries.map((_, i) => makeMp3({ seconds: 1.5 + (i % 5) * 0.4 }));

/** A temp world: the local folder with 11 rendered Mark files, an empty fake R2, and a log. */
function world({ files = true } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'upload-'));
  const out = join(base, 'out'); const r2 = join(base, 'r2'); const log = join(base, 'calls.log');
  mkdirSync(out); mkdirSync(r2);
  if (files) markEntries.forEach((e, i) => writeFileSync(join(out, fileNameFor(e.key, 1)), clips[i]));
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const object = (i) => join(r2, `${BUCKET}/${markEntries[i].key}`.replaceAll('/', '__'));
  return { base, out, r2, log, calls, object, done: () => rmSync(base, { recursive: true, force: true }) };
}
const run = async (w, args, env = {}) => {
  try {
    const { stdout, stderr } = await exec('node', [cli, ...args, '--out', w.out], { env: { ...process.env, VOICE_WRANGLER: fake, FAKE_R2_DIR: w.r2, FAKE_LOG: w.log, FAKE_BUCKETS: BUCKET, ...env } });
    return { status: 0, stdout, stderr };
  } catch (e) { return { status: e.code, stdout: e.stdout, stderr: e.stderr }; }
};
const up = ['--upload', '--voice', 'Mark'];
const puts = (w) => w.calls().filter((c) => c[1] === 'object' && c[2] === 'put');
const gets = (w) => w.calls().filter((c) => c[1] === 'object' && c[2] === 'get');

test('without --yes it is only a preview: not one wrangler call, nothing stored', { skip }, async () => {
  const w = world();
  try {
    const r = await run(w, up);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /PREVIEW\. Nothing is uploaded/);
    assert.match(r.stdout, /Ready to upload: 11 file\(s\)/);
    assert.match(r.stdout, /Nothing was uploaded\. Add --yes/);
    assert.deepEqual(w.calls(), []);
    assert.deepEqual(readdirSync(w.r2), []);
  } finally { w.done(); }
});

test('the options are checked before anything runs, each with its own message', { skip }, async () => {
  const w = world();
  try {
    const bad = [
      [['--upload'], /needs --voice/],
      [['--upload', '--voice', 'Mark', '--all'], /not both/],
      [['--yes', '--voice', 'Mark'], /only go with --upload/],
      [['--all'], /only go with --upload/],
      [['--bucket', 'abc-def'], /only go with --upload/],
      [['--upload', '--render', '--voice', 'Mark', '--budget-usd', '0.05'], /cannot be used together/],
      [['--upload', '--voice', 'Mark', '--takes', '2'], /take 1/],
      [['--upload', '--voice', 'Mark', '--bucket', 'Bad_Bucket'], /not a valid bucket name/],
      [['--upload', '--voice', 'Loretta'], /no voice called/],
      [['--upload', '--voice', 'Mark', '--jurisdiction', 'mars'], /must be one of eu, fedramp/],
      [['--jurisdiction', 'eu'], /only go with --upload/],
    ];
    for (const [args, pattern] of bad) {
      const r = await run(w, args);
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, pattern, args.join(' '));
    }
    assert.deepEqual(w.calls(), []);
  } finally { w.done(); }
});

test('a voice goes up whole or not at all: a missing or bad local file stops it before any call', { skip }, async () => {
  const w = world();
  try {
    rmSync(join(w.out, fileNameFor(markEntries[3].key, 1)));
    writeFileSync(join(w.out, fileNameFor(markEntries[4].key, 1)), 'junk');
    const r = await run(w, [...up, '--yes']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /whole or not at all/);
    assert.deepEqual(w.calls(), []);
    // and a voice that was never rendered
    const r2 = await run(w, ['--upload', '--voice', 'Chloe', '--yes']);
    assert.equal(r2.status, 1);
    assert.deepEqual(w.calls(), []);
  } finally { w.done(); }
});

test('a missing bucket stops the run with the create command, before any object call', { skip }, async () => {
  const w = world();
  try {
    const r = await run(w, [...up, '--yes'], { FAKE_BUCKETS: 'some-other-bucket' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /does not exist in this account/);
    assert.match(r.stderr, /wrangler r2 bucket create hauntology-worlds/);
    assert.match(r.stderr, /neither can be changed afterwards/);
    assert.deepEqual(w.calls().map((c) => c.slice(0, 3).join(' ')), ['r2 bucket info']);
  } finally { w.done(); }
});

test('uploads all 11, always with --remote and audio/mpeg, under the extensionless Library key, and reads each back', { skip }, async () => {
  const w = world();
  try {
    const r = await run(w, [...up, '--yes']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Uploaded 11, already there and identical 0, of 11/);
    assert.equal(puts(w).length, 11);
    for (const c of w.calls().filter((x) => x[1] === 'object')) assert.ok(c.includes('--remote'), `a call without --remote: ${c.join(' ')}`);
    markEntries.forEach((e, i) => {
      const p = puts(w)[i];
      assert.equal(p[3], `${BUCKET}/${e.key}`);
      assert.match(p[3], /^hauntology-worlds\/speech\/lib\/v1\/[0-9a-f]{64}$/);
      assert.equal(p[p.indexOf('--content-type') + 1], 'audio/mpeg');
      assert.deepEqual(readFileSync(w.object(i)), clips[i], `line ${i} stored identical`);
    });
    assert.equal(gets(w).length, 22, 'one existence check and one read-back per file');
    const ledger = JSON.parse(readFileSync(join(w.out, 'uploaded.json'), 'utf8'));
    assert.equal(ledger.length, 11);
    assert.deepEqual(Object.keys(ledger[0]).sort(), ['bucket', 'bytes', 'file', 'key', 'sha256', 'uploadedAt', 'voice']);
  } finally { w.done(); }
});

test('running it again uploads nothing: identical objects are skipped', { skip }, async () => {
  const w = world();
  try {
    assert.equal((await run(w, [...up, '--yes'])).status, 0);
    const before = puts(w).length;
    const r = await run(w, [...up, '--yes']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Uploaded 0, already there and identical 11, of 11/);
    assert.equal(puts(w).length, before, 'no new put');
  } finally { w.done(); }
});

test('NEVER OVERWRITES: an object with different audio stops the run, is left as it was, and the delete command is printed', { skip }, async () => {
  const w = world();
  try {
    writeFileSync(w.object(2), 'SOMEONE ELSE WAS HERE');
    const r = await run(w, [...up, '--yes']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /already exists with DIFFERENT audio\. Not overwritten/);
    assert.match(r.stderr, new RegExp(`wrangler r2 object delete ${BUCKET}/${markEntries[2].key} --remote`));
    assert.equal(readFileSync(w.object(2), 'utf8'), 'SOMEONE ELSE WAS HERE');
    assert.equal(puts(w).length, 2, 'the two before it were uploaded; it and the rest were not');
    assert.ok(!existsSync(w.object(3)));
  } finally { w.done(); }
});

test('NO RETRIES: a failed put stops the run at once', { skip }, async () => {
  const w = world();
  try {
    const r = await run(w, [...up, '--yes'], { FAKE_FAIL: 'put:2' });
    assert.equal(r.status, 1);
    assert.equal(puts(w).length, 2, 'the second put was not repeated and no third was tried');
    assert.match(r.stderr, /upload of .* failed/);
    assert.match(r.stderr, /Starting again skips what is done/);
    assert.ok(existsSync(w.object(0)) && !existsSync(w.object(1)));
  } finally { w.done(); }
});

test('an upload that reads back different is caught, left unrecorded, and the delete command is printed', { skip }, async () => {
  const w = world();
  try {
    const r = await run(w, [...up, '--yes'], { FAKE_FAIL: 'corrupt-put' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /reads back different/);
    assert.match(r.stderr, /wrangler r2 object delete/);
    assert.equal(puts(w).length, 1);
    assert.ok(!existsSync(join(w.out, 'uploaded.json')), 'nothing was recorded as uploaded');
  } finally { w.done(); }
});

test('if the existence check fails (not logged in), it stops before any put', { skip }, async () => {
  const w = world();
  try {
    const r = await run(w, [...up, '--yes'], { FAKE_FAIL: 'get-auth' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /could not check/);
    assert.equal(puts(w).length, 0);
  } finally { w.done(); }
});

test('a local file that went bad after rendering is caught just before upload, with no call for it', { skip }, async () => {
  const w = world();
  try {
    writeFileSync(join(w.out, fileNameFor(markEntries[1].key, 1)), makeMp3({ kind: 'silence', seconds: 2 }));
    const r = await run(w, [...up, '--yes']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /failed its check just before upload: silent/);
    assert.equal(puts(w).length, 1, 'only the first file went up');
    assert.ok(!gets(w).some((c) => c[3].endsWith(markEntries[1].key)), 'the bad file was never even checked remotely');
  } finally { w.done(); }
});

test('--bucket names the bucket in every object', { skip }, async () => {
  const w = world();
  try {
    const r = await run(w, [...up, '--yes', '--bucket', 'my-speech-bucket'], { FAKE_BUCKETS: 'my-speech-bucket' });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(puts(w).every((c) => c[3].startsWith('my-speech-bucket/speech/lib/v1/')));
  } finally { w.done(); }
});

test('without $VOICE_WRANGLER it runs `pnpm --filter api exec wrangler ...` (checked with a pnpm stand-in on the PATH, not the real one)', { skip }, async () => {
  const w = world();
  try {
    const bin = join(w.base, 'bin'); mkdirSync(bin);
    writeFileSync(join(bin, 'pnpm'), `#!/bin/sh\n[ "$1 $2 $3 $4" = "--filter api exec wrangler" ] || { echo "unexpected pnpm args: $*" >&2; exit 97; }\nshift 4\nexec node "${fake}" "$@"\n`);
    chmodSync(join(bin, 'pnpm'), 0o755);
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_R2_DIR: w.r2, FAKE_LOG: w.log, FAKE_BUCKETS: BUCKET };
    delete env.VOICE_WRANGLER;
    const { stdout } = await exec('node', [cli, ...up, '--yes', '--out', w.out], { env });
    assert.match(stdout, /Uploaded 11/);
  } finally { w.done(); }
});

test('only manifest keys can be named: the plan refuses anything else', () => {
  const evil = { ...manifest, entries: [{ key: 'speech/lib/v1/../../x', voice: MARK, spoken: 'Hi.' }] };
  return import('../lib/prerender-upload.mjs').then(({ planUpload }) => {
    assert.throws(() => planUpload({ manifest: evil, voice: null, bucket: BUCKET, fileState: () => 'ok' }), /not a Library key/);
    assert.throws(() => planUpload({ manifest, voice: null, bucket: '../etc', fileState: () => 'ok' }), /not a valid bucket name/);
    assert.equal(planPrerender({ manifest, lookup: () => 'missing', voice: MARK }).jobs.length, 11);
  });
});

test('--jurisdiction eu is added to EVERY wrangler call (info, get, put), and is shown in the plan', { skip }, async () => {
  const w = world();
  try {
    const pre = await run(w, [...up, '--jurisdiction', 'eu'], { FAKE_JURISDICTION: 'eu' });
    assert.match(pre.stdout, /\(jurisdiction eu\)/);
    const r = await run(w, [...up, '--yes', '--jurisdiction', 'eu'], { FAKE_JURISDICTION: 'eu' });
    assert.equal(r.status, 0, r.stderr);
    for (const c of w.calls()) {
      const i = c.indexOf('--jurisdiction');
      assert.ok(i >= 0 && c[i + 1] === 'eu', `a call without the jurisdiction: ${c.join(' ')}`);
    }
    assert.equal(puts(w).length, 11);
  } finally { w.done(); }
});

test('without --jurisdiction no call carries one, and a jurisdictional bucket is then "not found" with the right create command', { skip }, async () => {
  const w = world();
  try {
    const r = await run(w, [...up, '--yes'], { FAKE_JURISDICTION: 'eu' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /does not exist in this account/);
    assert.ok(w.calls().every((c) => !c.includes('--jurisdiction')));
    const eu = await run(w, [...up, '--yes', '--jurisdiction', 'eu'], { FAKE_JURISDICTION: 'eu', FAKE_BUCKETS: 'other' });
    assert.match(eu.stderr, /wrangler r2 bucket create hauntology-worlds --jurisdiction eu/);
  } finally { w.done(); }
});

test('the delete command printed on a conflict carries the jurisdiction too', { skip }, async () => {
  const w = world();
  try {
    writeFileSync(w.object(0), 'SOMEONE ELSE WAS HERE');
    const r = await run(w, [...up, '--yes', '--jurisdiction', 'eu'], { FAKE_JURISDICTION: 'eu' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /object delete hauntology-worlds\/speech\/lib\/v1\/[0-9a-f]{64} --remote --jurisdiction eu/);
  } finally { w.done(); }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSharedFiles } from '../lib/load-shared.mjs';
import { darkFirst, isLoopbackUrl, stripPhoto } from '../lib/dark-first.mjs';

const [kit] = await loadSharedFiles(['world/upload-kit.ts']);
const { makeJpeg, EXIF, XMP, ICC, COMMENT } = kit;

const dirty = () => makeJpeg({ width: 800, height: 600, head: [EXIF(), XMP(), ICC(), COMMENT()] });

function fakeIo({ count = 0, info = { aiBinding: true, remaining: 3 }, edit = { ok: true } } = {}) {
  const log = { written: [], fetched: [], bumps: 0 };
  let n = count;
  return {
    log,
    read: async () => Buffer.from(dirty()),
    write: async (path, bytes) => { log.written.push({ path, bytes }); },
    count: async () => n,
    bump: async () => { n += 1; log.bumps += 1; },
    fetch: async (url, init = {}) => {
      log.fetched.push({ url, init });
      if (url.endsWith('/dev/status')) return info === null ? { ok: false } : { ok: true, json: async () => info };
      return edit.ok
        ? { ok: true, headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47]).buffer }
        : { ok: false, status: 502, json: async () => ({ error: 'unusable', keys: ['x'], charged: true }) };
    },
  };
}
const base = { photo: 'p.jpg', name: 'p.jpg', outDir: '/o', worker: 'http://127.0.0.1:8803', token: 'a'.repeat(16) };

test('the strip removes every metadata marker and keeps the picture valid', async () => {
  // positive control: the test photo really HAS the markers, so the check below can disagree
  for (const m of ['Exif', 'adobe.com', 'taken at home']) assert.equal(Buffer.from(dirty()).includes(Buffer.from(m)), true, `fixture has ${m}`);
  const s = await stripPhoto(Buffer.from(dirty()), 'image/jpeg');
  assert.equal(s.ok, true);
  assert.equal(s.width, 800);
  assert.ok(s.removed > 0);
  for (const m of ['Exif', 'adobe.com', 'taken at home']) assert.equal(Buffer.from(s.bytes).includes(Buffer.from(m)), false, m);
});

test('a stripper that leaves personal metadata behind makes the photo refused, never sent', async () => {
  const leaky = (bytes) => ({ ok: true, type: 'image/jpeg', width: 1, height: 1, bytes: Buffer.concat([Buffer.from(bytes), Buffer.from('Exif\0\0GPS')]) });
  const r = await stripPhoto(Buffer.from(dirty()), 'image/jpeg', leaky);
  assert.deepEqual([r.ok, r.code], [false, 'metadata_left']);
  assert.ok(r.left.includes('Exif\0\0') && r.left.includes('http://ns.adobe.com/xap/1.0/'));
});

test('a file that is not a picture is refused before anything is written or sent', async () => {
  const io = fakeIo(); io.read = async () => Buffer.from('not a picture at all');
  const r = await darkFirst({ ...base, spend: true }, io);
  assert.equal(r.ok, false); assert.equal(r.stage, 'strip');
  assert.equal(io.log.written.length, 0); assert.equal(io.log.fetched.length, 0);
});

test('a dry run writes only the stripped copy and sends nothing', async () => {
  const io = fakeIo();
  const r = await darkFirst({ ...base, spend: false }, io);
  assert.equal(r.ok, true); assert.equal(r.sent, false);
  assert.deepEqual(io.log.written.map((w) => w.path), ['/o/stripped/p.jpg']);
  assert.equal(io.log.fetched.length, 0); assert.equal(io.log.bumps, 0);
});

test('a spend run sends ONLY the stripped bytes, to a loopback worker, and saves the dark picture', async () => {
  const io = fakeIo();
  const r = await darkFirst({ ...base, spend: true }, io);
  assert.equal(r.ok, true); assert.equal(r.sent, true);
  const post = io.log.fetched.find((f) => f.url.endsWith('/dev/dark-edit'));
  assert.equal(Buffer.from(post.init.body).includes(Buffer.from('Exif')), false);
  assert.equal(post.init.headers['x-run-token'], base.token);
  assert.equal(io.log.bumps, 1);
  assert.ok(io.log.written.some((w) => w.path === '/o/dark/p-dark.png'));
});

test('it refuses a worker that is not loopback, a missing token, and a fourth image, with no call made', async () => {
  for (const [patch, code, io] of [
    [{ worker: 'https://example.com' }, 'not_loopback', fakeIo()],
    [{ worker: 'http://127.0.0.1.evil.example:8803' }, 'not_loopback', fakeIo()],
    [{ token: 'short' }, 'no_token', fakeIo()],
    [{}, 'cap_reached', fakeIo({ count: 3 })],
    [{ max: 4 }, 'cap_reached', fakeIo()],
  ]) {
    const r = await darkFirst({ ...base, spend: true, ...patch }, io);
    assert.equal(r.ok, false); assert.equal(r.code, code);
    assert.equal(io.log.fetched.length, 0, code); assert.equal(io.log.bumps, 0, code);
  }
});

test('it stops when the worker has no model or no room, and counts nothing', async () => {
  for (const [info, code] of [[{ aiBinding: false, remaining: 3 }, 'no_ai_binding'], [{ aiBinding: true, remaining: 0 }, 'worker_cap'], [null, 'worker_unreachable']]) {
    const io = fakeIo({ info });
    const r = await darkFirst({ ...base, spend: true }, io);
    assert.equal(r.code, code); assert.equal(io.log.bumps, 0);
    assert.equal(io.log.fetched.some((f) => f.url.endsWith('/dev/dark-edit')), false);
  }
});

test('a failed or unusable edit is reported with its keys and whether it was charged, and the count stays bumped', async () => {
  const io = fakeIo({ edit: { ok: false } });
  const r = await darkFirst({ ...base, spend: true }, io);
  assert.equal(r.ok, false); assert.equal(r.stage, 'edit'); assert.equal(r.code, 'unusable');
  assert.deepEqual(r.keys, ['x']); assert.equal(r.charged, true); assert.equal(io.log.bumps, 1);
});

test('isLoopbackUrl', () => {
  assert.equal(isLoopbackUrl('http://127.0.0.1:8803'), true);
  assert.equal(isLoopbackUrl('http://localhost:1'), true);
  assert.equal(isLoopbackUrl('ftp://127.0.0.1'), false);
  assert.equal(isLoopbackUrl('nonsense'), false);
});

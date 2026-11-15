// The Worker's answer for the footage clips: byte ranges, which Safari needs to play or seek a video. Cloudflare's static assets send the
// whole file for a Range request, so /media/* goes to the Worker first (wrangler.jsonc) and src/route.js cuts the range itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { handle } from '../src/route.js';
import { parseRange } from '../src/range.js';
import { root } from './helpers.js';

const BYTES = Uint8Array.from({ length: 100 }, (_, i) => i);
const seen = [];
const env = {
  LAB_ENABLED: 'true',
  ASSETS: {
    fetch: async (req) => {
      seen.push({ url: req.url, range: req.headers.get('range'), method: req.method });
      if (!/\.(mp4|webm|jpg)$/.test(new URL(req.url).pathname) || /missing/.test(req.url)) return new Response('nope', { status: 404 });
      return new Response(BYTES, { status: 200, headers: { 'content-type': 'video/mp4', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } });
    },
  },
};
const get = (path, headers = {}, method = 'GET') => handle(new Request(`https://mtest.test${path}`, { method, headers }), env);
const bytes = async (res) => [...new Uint8Array(await res.arrayBuffer())];

test('parseRange: a first-last range, an open end, a suffix, a clamp, and everything that cannot be met', () => {
  assert.deepEqual(parseRange('bytes=0-9', 100), [0, 9]);
  assert.deepEqual(parseRange('bytes=10-', 100), [10, 99]);
  assert.deepEqual(parseRange('bytes=-5', 100), [95, 99]);
  assert.deepEqual(parseRange('bytes=90-999', 100), [90, 99]);
  assert.deepEqual(parseRange('bytes=-500', 100), [0, 99], 'a suffix longer than the file is the whole file');
  for (const bad of ['bytes=100-', 'bytes=200-300', 'bytes=9-3', 'bytes=-0', 'bytes=-', 'bytes=', 'items=0-5', 'bytes=0-5,10-20', '', null, undefined]) assert.equal(parseRange(bad, 100), null, String(bad));
});

test('a range request gets 206 with exactly those bytes and the headers Safari reads', async () => {
  const res = await get('/media/stair-shadow.mp4', { range: 'bytes=0-9' });
  assert.equal(res.status, 206);
  assert.deepEqual(await bytes(res), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(res.headers.get('content-range'), 'bytes 0-9/100');
  assert.equal(res.headers.get('content-length'), '10');
  assert.equal(res.headers.get('accept-ranges'), 'bytes');
  assert.equal(res.headers.get('content-type'), 'video/mp4');
  assert.match(res.headers.get('cache-control'), /^public, max-age=\d+$/);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow', 'the site-wide headers of the asset are kept');
});

test('a suffix range and an open range cut the right bytes', async () => {
  const last = await get('/media/end-dawn.webm', { range: 'bytes=-5' });
  assert.equal(last.status, 206);
  assert.deepEqual(await bytes(last), [95, 96, 97, 98, 99]);
  assert.equal(last.headers.get('content-range'), 'bytes 95-99/100');
  const rest = await get('/media/end-dawn.webm', { range: 'bytes=97-' });
  assert.deepEqual(await bytes(rest), [97, 98, 99]);
});

test('no Range gives the whole file with 200 and says ranges are accepted', async () => {
  const res = await get('/media/reel-ship.jpg');
  assert.equal(res.status, 200);
  assert.equal((await bytes(res)).length, 100);
  assert.equal(res.headers.get('accept-ranges'), 'bytes');
  assert.equal(res.headers.get('content-length'), '100');
});

test('a range past the end is 416 with the size, and nothing is sent', async () => {
  const res = await get('/media/reel-ship.mp4', { range: 'bytes=500-600' });
  assert.equal(res.status, 416);
  assert.equal(res.headers.get('content-range'), 'bytes */100');
  assert.equal((await bytes(res)).length, 0);
});

test('HEAD sends headers and no body, with and without a range', async () => {
  const plain = await get('/media/reel-ship.mp4', {}, 'HEAD');
  assert.equal(plain.status, 200);
  assert.equal(plain.headers.get('content-length'), '100');
  assert.equal((await bytes(plain)).length, 0);
  const ranged = await get('/media/reel-ship.mp4', { range: 'bytes=0-9' }, 'HEAD');
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get('content-range'), 'bytes 0-9/100');
  assert.equal((await bytes(ranged)).length, 0);
});

test('the asset binding never sees the Range header, and another method is refused', async () => {
  seen.length = 0;
  await get('/media/reel-ship.mp4', { range: 'bytes=0-9' });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].range, null, 'the asset is fetched whole, then cut here');
  assert.equal((await get('/media/reel-ship.mp4', {}, 'POST')).status, 405);
});

test('a clip that is not there is the assets binding\'s 404, and only the clip files are served this way', async () => {
  assert.equal((await get('/media/missing.mp4', { range: 'bytes=0-9' })).status, 404);
  for (const path of ['/media/PROVENANCE.md', '/media/sub/x.mp4', '/media/x.exe', '/media/../footage.html', '/media/']) {
    seen.length = 0;
    const res = await get(path);
    assert.equal(seen.length, 0, `${path} does not reach the assets as a clip`);
    assert.equal(res.status, 404, path);
  }
});

test('the lab API is untouched', async () => {
  const res = await get('/api/lab/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, lab: true });
});

test('wrangler sends /media/* to the Worker first, and the local server shares the one range parser', () => {
  assert.match(readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8'), /"run_worker_first":\s*\[[^\]]*"\/media\/\*"/);
  const serve = readFileSync(resolve(root, 'serve.mjs'), 'utf8');
  assert.match(serve, /from '\.\/src\/range\.js'/);
  assert.doesNotMatch(serve, /function parseRange/);
});

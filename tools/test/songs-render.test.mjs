// The Stock Song render tool (game-songs 5.2), over a fake Song Service: it spends nothing. Run: node --test tools/test/songs-render.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { captionsOf, makeSong, planSongs, recordOf, POLL_MS, WAIT_MS } from '../lib/songs-render.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sung = { id: 'a', kind: 'title', title: 'A', style: 'slow waltz', lyrics: '[Verse]\nOne line\nTwo line\n[Chorus]\nOoh' };
const plain = { id: 'b', kind: 'lobby', title: 'B', style: 'quiet loop', lyrics: null };
const mp3 = (n) => new Uint8Array(n).fill(9);

function fake({ readyAfter = 3, status = 'succeeded', choices } = {}) {
  const calls = [];
  let polls = 0;
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body });
    if (url.endsWith('/generate')) return new Response(JSON.stringify({ id: 't1' }), { status: 200 });
    if (url.includes('/query/')) {
      polls += 1;
      if (polls < readyAfter) return new Response(JSON.stringify({ status: 'running' }), { status: 200 });
      return new Response(JSON.stringify({ status, choices: choices ?? [{ url: 'https://cdn.example/long', duration: 150 }, { url: 'https://cdn.example/short', duration: 120 }] }), { status: 200 });
    }
    return new Response(mp3(url.endsWith('short') ? 2000 : 5000), { status: 200 });
  };
  return { fetch, calls, polls: () => polls };
}
const clock = () => { let t = 0; return { now: () => t, sleep: async (ms) => { t += ms; } }; };

test('plans only the missing songs, in order, within the limit, and counts the ones already made', () => {
  const songs = [sung, plain, { ...sung, id: 'c' }];
  const have = new Set(['/o/b.mp3']);
  const p = planSongs(songs, '/o', { limit: 1, exists: (f) => have.has(f) });
  assert.deepEqual(p.todo.map((s) => s.id), ['a']);
  assert.deepEqual({ total: p.total, have: p.have, left: p.left }, { total: 3, have: 1, left: 1 });
  assert.deepEqual(planSongs(songs, '/o', { only: ['c'], exists: () => false }).todo.map((s) => s.id), ['c']);
});

test('captions are the sung lines without the section tags, and an instrumental has none', () => {
  assert.deepEqual(captionsOf(sung.lyrics), ['One line', 'Two line', 'Ooh']);
  assert.deepEqual(captionsOf(null), []);
  const rec = recordOf(sung, { taskId: 't1' });
  assert.deepEqual(Object.keys(rec).sort(), ['captions', 'id', 'kind', 'lyrics', 'style', 'taskId', 'title']);
});

test('submits once, polls every 5 s until ready, keeps the shorter version, and sends only the words and the style', async () => {
  const f = fake({ readyAfter: 9 });
  const c = clock();
  const r = await makeSong({ fetch: f.fetch, apiKey: 'k', song: sung, ...c });
  assert.equal(r.ok, true);
  assert.equal(r.audio.byteLength, 2000); // the short one
  assert.equal(r.durationMs, 9 * POLL_MS);
  assert.equal(f.calls.filter((x) => x.method === 'POST').length, 1);
  assert.equal(f.calls[0].url, 'https://api.mureka.ai/v1/song/generate');
  assert.deepEqual(Object.keys(JSON.parse(f.calls[0].body)).sort(), ['lyrics', 'model', 'prompt']);
});

test('an instrumental goes to the instrumental route with no lyrics', async () => {
  const f = fake({ readyAfter: 1 });
  const r = await makeSong({ fetch: f.fetch, apiKey: 'k', song: plain, ...clock() });
  assert.equal(r.ok, true);
  assert.equal(f.calls[0].url, 'https://api.mureka.ai/v1/instrumental/generate');
  assert.equal(f.calls[1].url, 'https://api.mureka.ai/v1/instrumental/query/t1');
  assert.deepEqual(Object.keys(JSON.parse(f.calls[0].body)).sort(), ['model', 'prompt']);
});

test('stops, never retries the submit, and says why: no key, 429, a failed task, a stuck task, no audio, too-small audio', async () => {
  assert.deepEqual(await makeSong({ fetch: fake().fetch, apiKey: '', song: sung, ...clock() }), { ok: false, reason: 'invalid' });
  const limited = await makeSong({ fetch: async () => new Response('', { status: 429 }), apiKey: 'k', song: sung, ...clock() });
  assert.equal(limited.reason, 'rate_limited');
  assert.equal((await makeSong({ fetch: fake({ status: 'failed', readyAfter: 1 }).fetch, apiKey: 'k', song: sung, ...clock() })).reason, 'failed');
  const stuck = fake({ readyAfter: 10_000 });
  const c = clock();
  const slow = await makeSong({ fetch: stuck.fetch, apiKey: 'k', song: sung, ...c });
  assert.equal(slow.reason, 'slow');
  assert.ok(stuck.polls() <= WAIT_MS / POLL_MS + 1);
  assert.equal((await makeSong({ fetch: fake({ readyAfter: 1, choices: [] }).fetch, apiKey: 'k', song: sung, ...clock() })).reason, 'no_audio');
  assert.equal((await makeSong({ fetch: fake({ readyAfter: 1, choices: [{ url: 'http://insecure.example/x' }] }).fetch, apiKey: 'k', song: sung, ...clock() })).reason, 'no_audio');
  const tiny = fake({ readyAfter: 1 });
  const f = async (u, i) => (u.startsWith('https://cdn.example') ? new Response(mp3(10), { status: 200 }) : tiny.fetch(u, i));
  assert.equal((await makeSong({ fetch: f, apiKey: 'k', song: sung, ...clock() })).reason, 'bad_audio');
});

test('the tool: a dry run lists the missing songs and spends nothing; --render needs a hard stop and a key', () => {
  const out = mkdtempSync(join(tmpdir(), 'songs-out-'));
  writeFileSync(join(out, 'title.mp3'), 'x'); // one is already there
  const run = (args, env = {}) => spawnSync(process.execPath, [join(root, 'tools', 'songs-render.mjs'), ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });
  const dry = run(['--out', out]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /39 songs in the list, 1 already/);
  assert.match(dry.stdout, /Dry run: nothing was spent/);
  assert.doesNotMatch(dry.stdout, /would make title /);
  const noCap = run(['--render', '--out', out], { MUREKA_API_KEY: 'k' });
  assert.equal(noCap.status, 1);
  assert.match(noCap.stderr, /--max-songs/);
  const noKey = run(['--render', '--max-songs', '2', '--out', out]);
  assert.equal(noKey.status, 1);
  assert.match(noKey.stderr, /MUREKA_API_KEY/);
  assert.equal(run(['--render', '--max-songs', '99', '--out', out], { MUREKA_API_KEY: 'k' }).status, 1);
  assert.equal(existsSync(join(out, 'haunt-low.mp3')), false);
  assert.ok(readFileSync(join(out, 'title.mp3'), 'utf8') === 'x');
});

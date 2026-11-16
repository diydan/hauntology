// Tests for tools/voice-render/worker.mjs: the local Worker that makes one Inworld call per validated request.
// The AI binding is a fake, so nothing here spends anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../voice-render/worker.mjs';
import { MAX_TEXT, TAGS, VOICES, validate } from '../voice-render/logic.mjs';
import { settingsForVoice } from '../lib/prerender-plan.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = JSON.parse(readFileSync(join(root, 'shared/fixtures/voice-library.json'), 'utf8'));
const TOKEN = 'a-test-token-of-16+chars';
const GOOD = { voice_id: 'Mark', tag: '[speak nervously] ', text: 'Me? Well... I mean...', temperature: 1.2, speaking_rate: 1.1 };

function fakeAi(result) {
  const calls = [];
  return { calls, run: async (model, input) => { calls.push([model, input]); if (result instanceof Error) throw result; return result; } };
}
const request = (body, { token = TOKEN, method = 'POST' } = {}) =>
  new Request('http://127.0.0.1/', { method, headers: { 'x-render-token': token, 'content-type': 'application/json' }, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
const call = (req, ai, env = {}) => worker.fetch(req, { RENDER_TOKEN: TOKEN, AI: ai, ...env });

test('no token configured, or a wrong one: refused before anything else, and the model is never called', async () => {
  const ai = fakeAi({ audio: 'https://x/y.mp3' });
  assert.equal((await call(request(GOOD), ai, { RENDER_TOKEN: undefined })).status, 500);
  assert.equal((await call(request(GOOD), ai, { RENDER_TOKEN: 'short' })).status, 500);
  assert.equal((await call(request(GOOD, { token: 'wrong-token-wrong-token' }), ai)).status, 401);
  assert.equal((await call(new Request('http://127.0.0.1/', { method: 'POST', body: JSON.stringify(GOOD) }), ai)).status, 401);
  assert.equal(ai.calls.length, 0);
});

test('only POST is allowed', async () => {
  const ai = fakeAi({});
  assert.equal((await call(request(null, { method: 'GET' }), ai)).status, 405);
  assert.equal(ai.calls.length, 0);
});

test('every kind of bad request is refused with 400 and never reaches the model', async () => {
  const ai = fakeAi({ audio: 'https://x/y.mp3' });
  const bad = [
    ['not JSON', '{nope'],
    ['a voice outside the cast', { ...GOOD, voice_id: 'Luna' }],
    ['no voice', { ...GOOD, voice_id: undefined }],
    ['a tag that is not allowed', { ...GOOD, tag: '[shout] ' }],
    ['a tag with no trailing space', { ...GOOD, tag: '[whisper]' }],
    ['empty text', { ...GOOD, text: '   ' }],
    ['text over the cap', { ...GOOD, text: 'a'.repeat(MAX_TEXT + 1) }],
    ['a tag inside the text', { ...GOOD, text: '[whisper] hello' }],
    ['markup in the text', { ...GOOD, text: 'hello <b>there</b>' }],
    ['a placeholder in the text', { ...GOOD, text: 'hello {nick}' }],
    ['temperature too high', { ...GOOD, temperature: 3 }],
    ['temperature not a number', { ...GOOD, temperature: '1.2' }],
    ['rate too fast', { ...GOOD, speaking_rate: 2 }],
    ['rate missing', { ...GOOD, speaking_rate: undefined }],
    ['a JSON null', 'null'],
  ];
  for (const [what, body] of bad) assert.equal((await call(request(body), ai)).status, 400, what);
  assert.equal(ai.calls.length, 0);
});

test('a good request makes exactly one call, to the Inworld model only, with the tag in front of the text', async () => {
  const ai = fakeAi({ audio: 'https://audio.example/clip.mp3' });
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => { assert.equal(url, 'https://audio.example/clip.mp3'); return new Response(Uint8Array.from([1, 2, 3, 4])); };
  try {
    const res = await call(request(GOOD), ai);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'audio/mpeg');
    assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [1, 2, 3, 4]);
  } finally { globalThis.fetch = real; }
  assert.deepEqual(ai.calls, [['inworld/tts-2', { text: '[speak nervously] Me? Well... I mean...', voice_id: 'Mark', output_format: 'mp3', temperature: 1.2, timestamp_type: 'none', speaking_rate: 1.1 }]]);
});

test('the answer shapes seen so far are all understood: {audio}, {result:{audio}} and base64', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(Uint8Array.from([9, 9]));
  try {
    for (const out of [{ audio: 'https://a/b.mp3' }, { result: { audio: 'https://a/b.mp3' } }]) {
      const res = await call(request(GOOD), fakeAi(out));
      assert.equal(res.status, 200);
    }
  } finally { globalThis.fetch = real; }
  const b64 = await call(request(GOOD), fakeAi({ audio: Buffer.from([7, 8, 9]).toString('base64') }));
  assert.deepEqual([...new Uint8Array(await b64.arrayBuffer())], [7, 8, 9]);
});

test('a model error, an odd answer or a dead audio link is a 502 with the reason, not a crash', async () => {
  assert.equal((await call(request(GOOD), fakeAi(new Error('7003: no such voice')))).status, 502);
  const odd = await call(request(GOOD), fakeAi({ nothing: true }));
  assert.equal(odd.status, 502);
  assert.match((await odd.json()).error, /unknown response shape/);
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response('gone', { status: 404 });
  try { assert.equal((await call(request(GOOD), fakeAi({ audio: 'https://a/b.mp3' }))).status, 502); } finally { globalThis.fetch = real; }
});

test('the Worker allows exactly the voices and tags the render tool can send', () => {
  const names = new Set(manifest.entries.map((e) => e.voice.slice('inworld:'.length)));
  for (const n of names) assert.ok(VOICES.includes(n), `${n} is in the manifest but not allowed by the Worker`);
  for (const n of ['Pippa', 'Ronald']) assert.ok(VOICES.includes(n));
  for (const v of [...names, 'Pippa', 'Ronald']) assert.ok(TAGS.includes(settingsForVoice(`inworld:${v}`, manifest).tag), `${v}'s tag is not allowed`);
  assert.equal(validate({ ...GOOD }).ok, true);
});

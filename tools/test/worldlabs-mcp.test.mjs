// Tests for tools/worldlabs-mcp (world-pipeline task 0). A fake World API answers every call; no test reaches the network or spends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorldLabsClient } from '../worldlabs-mcp/src/api.mjs';
import { callTool, handleMessage, TOOLS } from '../worldlabs-mcp/src/server.mjs';

const KEY = 'WLT-SECRET-KEY-for-tests-0123456789';

function fixtureDir() { return mkdtempSync(join(tmpdir(), 'wlmcp-')); }

/** A fake fetch. `route(method, path, body)` returns { status, body, headers } or throws. Every call is recorded. */
function fakeApi(route) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method ?? 'GET', path: u.pathname, body, key: init.headers?.['WLT-Api-Key'] });
    const r = await route(init.method ?? 'GET', u.pathname, body);
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status ?? 200, headers: r.headers ?? {} });
  };
  return { calls, fetchImpl };
}

const ok = { remaining_credits: 5000 };
const happyRoutes = (method, path) => {
  if (path === '/marble/v1/credits') return { body: ok };
  if (path === '/marble/v1/worlds:generate') return { body: { operation_id: 'op-abc-123', done: false } };
  if (path === '/marble/v1/operations/op-abc-123') {
    return { body: { operation_id: 'op-abc-123', done: true, cost: { total_credits: 220 }, response: {
      world_id: 'w-1', assets: { thumbnail_url: 'https://cdn.example/t.jpg?Expires=1&Signature=zzz', splats: { spz_urls: { '100k': 'https://cdn.example/a.spz?X-Amz-Expires=3600' } } },
    } } };
  }
  if (path === '/marble/v1/worlds/w-1') return { body: { world_id: 'w-1', assets: { thumbnail_url: 'https://cdn.example/t.jpg?Signature=zzz' } } };
  return { status: 404, body: { detail: 'nope' } };
};

function picture(dir, name = 'kitchen.jpg') {
  const p = join(dir, name);
  writeFileSync(p, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]));
  return p;
}

function setup(route = happyRoutes, extra = {}) {
  const dir = fixtureDir();
  const api = fakeApi(route);
  const client = createWorldLabsClient({
    apiKey: KEY, fetchImpl: api.fetchImpl, ledgerPath: join(dir, 'ledger.json'), fixtureDir: join(dir, 'fixtures'),
    maxTotal: 6000, maxPerCall: 300, now: () => Date.parse('2026-11-21T03:00:00Z'), ...extra,
  });
  return { dir, api, client, ledger: () => (existsSync(join(dir, 'ledger.json')) ? JSON.parse(readFileSync(join(dir, 'ledger.json'), 'utf8')) : null), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('refuses to start without a key, and never echoes what it was given', () => {
  assert.throws(() => createWorldLabsClient({ apiKey: undefined }), /WLT_API_KEY is not set/);
  assert.throws(() => createWorldLabsClient({ apiKey: 'short' }), (e) => /WLT_API_KEY/.test(e.message) && !e.message.includes('short'));
});

test('sends the key only to the real service or a local test server', () => {
  assert.throws(() => createWorldLabsClient({ apiKey: KEY, apiBase: 'https://evil.example' }), /only sent to https:\/\/api\.worldlabs\.ai/);
  assert.doesNotThrow(() => createWorldLabsClient({ apiKey: KEY, apiBase: 'http://127.0.0.1:9999' }));
});

test('credits reads the balance with the key header', async () => {
  const t = setup();
  assert.equal(await t.client.credits(), 5000);
  assert.equal(t.api.calls[0].key, KEY);
  t.cleanup();
});

test('generate sends one request, records the estimate in the ledger first, and returns an operation id', async () => {
  const t = setup();
  const pic = picture(t.dir);
  const r = await callTool(t.client, 'worldlabs_generate_from_image', { path: pic, name: 'Kitchen', max_credits: 300 });
  assert.equal(r.isError, undefined);
  const out = JSON.parse(r.content[0].text);
  assert.equal(out.operation_id, 'op-abc-123');
  const gen = t.api.calls.find((c) => c.path === '/marble/v1/worlds:generate');
  assert.equal(gen.body.model, 'marble-1.0-draft');
  assert.equal(gen.body.permission.public, false);
  assert.equal(gen.body.display_name, 'Kitchen');
  assert.equal(t.ledger().spent, 230);
  assert.equal(t.ledger().runs[0].operationId, 'op-abc-123');
  // the picture's bytes and the key never appear in the tool's answer
  assert.ok(!r.content[0].text.includes(KEY));
  assert.ok(!r.content[0].text.includes('/9j/'));
  t.cleanup();
});

test('generate refuses a call whose ceiling is above max_credits, without sending anything', async () => {
  const t = setup();
  const r = await callTool(t.client, 'worldlabs_generate_from_image', { path: picture(t.dir), max_credits: 100 });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /can cost up to 230 credits; max_credits is 100/);
  assert.equal(t.api.calls.filter((c) => c.method === 'POST').length, 0);
  t.cleanup();
});

test('generate refuses a standard model above the per-call cap even when max_credits allows it', async () => {
  const t = setup(happyRoutes, { maxPerCall: 300 });
  const r = await callTool(t.client, 'worldlabs_generate_from_image', { path: picture(t.dir), model: 'marble-1.1', max_credits: 2000 });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /per-call cap is 300/);
  assert.equal(t.api.calls.filter((c) => c.method === 'POST').length, 0);
  t.cleanup();
});

test('generate refuses when the total cap would be passed by the ledger', async () => {
  const t = setup(happyRoutes, { maxTotal: 400 });
  const pic = picture(t.dir);
  assert.equal((await callTool(t.client, 'worldlabs_generate_from_image', { path: pic, max_credits: 300 })).isError, undefined);
  const second = await callTool(t.client, 'worldlabs_generate_from_image', { path: pic, max_credits: 300 });
  assert.equal(second.isError, true);
  assert.match(second.content[0].text, /would pass the total cap of 400/);
  assert.equal(t.api.calls.filter((c) => c.method === 'POST').length, 1);
  t.cleanup();
});

test('generate refuses when the balance is below the most it could cost', async () => {
  const t = setup((m, p) => (p === '/marble/v1/credits' ? { body: { remaining_credits: 100 } } : happyRoutes(m, p)));
  const r = await callTool(t.client, 'worldlabs_generate_from_image', { path: picture(t.dir), max_credits: 300 });
  assert.match(r.content[0].text, /below the most this could cost \(230\); stopped before sending/);
  assert.equal(t.api.calls.filter((c) => c.method === 'POST').length, 0);
  t.cleanup();
});

test('a refused generate gives its credits back to the ledger', async () => {
  const t = setup((m, p) => (p === '/marble/v1/worlds:generate' ? { status: 429, headers: { 'retry-after': '30' }, body: { detail: 'slow down' } } : happyRoutes(m, p)));
  const r = await callTool(t.client, 'worldlabs_generate_from_image', { path: picture(t.dir), max_credits: 300 });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /refused with 429 \(Retry-After 30\)/);
  assert.equal(t.ledger().spent, 0);
  assert.equal(t.ledger().runs[0].note, 'refused with 429');
  t.cleanup();
});

test('a finished operation replaces the estimate with the real cost in the ledger', async () => {
  const t = setup();
  await callTool(t.client, 'worldlabs_generate_from_image', { path: picture(t.dir), max_credits: 300 });
  const op = await callTool(t.client, 'worldlabs_get_operation', { operation_id: 'op-abc-123' });
  assert.equal(op.isError, undefined);
  assert.equal(t.ledger().spent, 220);
  assert.equal(t.ledger().runs[0].actual, 220);
  // reading it again does not count twice
  await callTool(t.client, 'worldlabs_get_operation', { operation_id: 'op-abc-123' });
  assert.equal(t.ledger().spent, 220);
  const status = JSON.parse((await callTool(t.client, 'worldlabs_spend_status', {})).content[0].text);
  assert.equal(status.spentCredits, 220);
  assert.equal(status.remainingUnderTotalCap, 6000 - 220);
  t.cleanup();
});

test('a world is returned with its addresses described, never given', async () => {
  const t = setup();
  const r = await callTool(t.client, 'worldlabs_get_world', { world_id: 'w-1' });
  const text = r.content[0].text;
  assert.ok(!text.includes('https://'), 'no address in the answer');
  assert.ok(!text.includes('Signature=zzz'));
  const out = JSON.parse(text);
  assert.equal(out.assetsDescribed.thumbnail.host, 'cdn.example');
  assert.equal(out.assetsDescribed.thumbnail.looksSigned, true);
  assert.equal(out.world_id, '<world_id>');
  t.cleanup();
});

test('save_fixture writes a scrubbed copy into the fixture folder', async () => {
  const t = setup();
  const r = await callTool(t.client, 'worldlabs_get_world', { world_id: 'w-1', save_fixture: true });
  const { fixture } = JSON.parse(r.content[0].text);
  const saved = readFileSync(join(t.dir, 'fixtures', fixture), 'utf8');
  assert.ok(!saved.includes('https://') && !saved.includes('w-1'));
  assert.ok(saved.includes('<url>'));
  assert.deepEqual(readdirSync(join(t.dir, 'fixtures')), [fixture]);
  t.cleanup();
});

test('an error that carries the key is redacted before it reaches the caller', async () => {
  const t = setup(() => { throw new Error(`socket closed while sending ${KEY}`); });
  const r = await callTool(t.client, 'worldlabs_get_operation', { operation_id: 'op-x' });
  assert.equal(r.isError, true);
  assert.ok(!r.content[0].text.includes(KEY));
  assert.match(r.content[0].text, /<key>/);
  t.cleanup();
});

test('unknown tools and missing max_credits are refused, not run', async () => {
  const t = setup();
  assert.equal((await callTool(t.client, 'worldlabs_delete_world', {})).isError, true);
  const r = await callTool(t.client, 'worldlabs_generate_from_image', { path: picture(t.dir) });
  assert.match(r.content[0].text, /max_credits is required/);
  assert.equal(t.api.calls.length, 0);
  t.cleanup();
});

test('the protocol answers initialize, tools/list and tools/call, and rejects what it does not know', async () => {
  const t = setup();
  const init = await handleMessage(t.client, { jsonrpc: '2.0', id: 1, method: 'initialize' });
  assert.equal(init.result.serverInfo.name, 'worldlabs-dev');
  assert.equal(await handleMessage(t.client, { jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  const list = await handleMessage(t.client, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(list.result.tools.map((x) => x.name), TOOLS.map((x) => x.name));
  assert.deepEqual(list.result.tools.map((x) => x.name), ['worldlabs_generate_from_image', 'worldlabs_get_operation', 'worldlabs_get_world', 'worldlabs_list_worlds', 'worldlabs_spend_status']);
  assert.equal((await handleMessage(t.client, { jsonrpc: '2.0', id: 3, method: 'nope' })).error.code, -32601);
  assert.equal((await handleMessage(t.client, { id: 4, method: 'ping' })).error.code, -32600);
  assert.equal((await handleMessage(t.client, null)).error.code, -32600);
  t.cleanup();
});

test('generate is the only tool that spends, and it says so in its description', () => {
  const spending = TOOLS.filter((x) => /SPENDS/.test(x.description)).map((x) => x.name);
  assert.deepEqual(spending, ['worldlabs_generate_from_image']);
  for (const tool of TOOLS.filter((x) => x.name !== 'worldlabs_generate_from_image')) assert.ok(!/POST/.test(tool.description));
});

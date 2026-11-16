// Tests for tools/lib/worldlabs-spike.mjs. They run the whole spike against a small server on this machine that behaves
// as the World API is documented to behave. No test reaches the real service or spends anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assetUrls, checkBase, describeUrl, estimateCredits, runSpike, scrub } from '../lib/worldlabs-spike.mjs';

const KEY = 'WLT-SECRET-KEY-for-tests-0123456789';

/** A fake World API. `script` can change what each route answers. */
async function server(script = {}) {
  const seen = [];
  let polls = 0;
  const s = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      seen.push({ method: req.method, url: req.url, key: req.headers['wlt-api-key'], body: body === '' ? null : JSON.parse(body) });
      const base = `http://127.0.0.1:${s.address().port}`;
      const send = (status, json, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(json === undefined ? '' : JSON.stringify(json)); };
      if (req.url === '/marble/v1/credits') return send(...(script.credits?.() ?? [200, { remaining_credits: script.balance ?? 5000 }]));
      if (req.url === '/marble/v1/worlds:generate') return send(...(script.generate?.() ?? [200, { operation_id: 'op-secret-1', done: false, created_at: '2026-11-15T10:00:00Z', expires_at: '2026-11-15T11:00:00Z' }]));
      if (req.url === '/marble/v1/operations/op-secret-1') {
        polls++;
        if (script.operation) return send(...script.operation(polls));
        if (polls < 3) return send(200, { operation_id: 'op-secret-1', done: false, metadata: { progress: { status: 'IN_PROGRESS', description: 'working' } } });
        return send(200, {
          operation_id: 'op-secret-1', done: true, error: null, created_at: '2026-11-15T10:00:00Z', expires_at: '2026-11-15T11:00:00Z',
          cost: { total_credits: 230, line_items: [{ name: 'pano', credits: 80 }, { name: 'world', credits: 150 }] },
          metadata: { progress: { status: 'SUCCEEDED', description: 'done' }, world_id: 'world-secret-1' },
          response: {
            world_id: 'world-secret-1', display_name: 'hauntology-spike', world_marble_url: 'https://marble.worldlabs.ai/world/world-secret-1', model: 'marble-1.0-draft',
            assets: {
              caption: 'A narrow kitchen.', thumbnail_url: `${base}/assets/thumb.jpg?Expires=1&Signature=abc`,
              splats: { spz_urls: { '500k': `${base}/assets/500k.spz`, '100k': `${base}/assets/100k.spz`, full_res: `${base}/assets/full.spz?X-Amz-Expires=3600` }, semantics_metadata: { metric_scale_factor: 1.23, ground_plane_offset: 0.42 } },
              mesh: { collider_mesh_url: `${base}/assets/collider.glb` }, imagery: { pano_url: `${base}/assets/pano.jpg` },
            },
          },
        });
      }
      if (req.url.startsWith('/assets/')) {
        const type = req.url.includes('.spz') ? 'application/octet-stream' : req.url.includes('.glb') ? 'model/gltf-binary' : 'image/jpeg';
        res.writeHead(script.assetStatus?.(req) ?? 200, { 'Content-Type': type, 'Content-Length': '12', 'Accept-Ranges': 'bytes' });
        return res.end(req.method === 'HEAD' ? undefined : 'abcdefghijkl');
      }
      if (req.method === 'DELETE' && req.url === '/marble/v1/worlds/world-secret-1') { script.deleted = true; return send(200, { deleted: true }); }
      return send(404, { detail: 'no route' });
    });
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${s.address().port}`, seen, close: () => new Promise((r) => s.close(r)), script };
}

const work = () => mkdtempSync(join(tmpdir(), 'wl-spike-'));
const picture = (dir, name = 'photo.jpg', bytes = Buffer.from('not really a jpeg but some bytes')) => { const p = join(dir, name); writeFileSync(p, bytes); return p; };
const run = (api, dir, over = {}) => {
  const lines = [];
  const opts = { image: picture(dir), apiKey: KEY, apiBase: api.base, outDir: join(dir, 'out'), ledgerPath: join(dir, 'ledger.json'), pollMs: 1, sleep: async () => {}, log: (l) => lines.push(l), ...over };
  return { lines, done: runSpike(opts) };
};

test('estimateCredits follows the published prices', () => {
  assert.deepEqual(estimateCredits('marble-1.0-draft'), { pano: 80, world: 150, total: 230, ceiling: 230, dollars: 230 / 1250 });
  assert.equal(estimateCredits('marble-1.1').total, 1580);
  assert.equal(estimateCredits('marble-1.1', { isPano: true }).total, 1500);
  assert.equal(estimateCredits('marble-1.0-draft', { isPano: true }).total, 150);
  assert.equal(estimateCredits('marble-1.1-plus').total, 1580);
  assert.equal(estimateCredits('marble-1.1-plus').ceiling, 3080);
  assert.throws(() => estimateCredits('marble-9'), /unknown model/);
});

test('checkBase sends the key only to the real service or this machine', () => {
  assert.equal(checkBase('https://api.worldlabs.ai'), 'https://api.worldlabs.ai');
  assert.equal(checkBase('http://127.0.0.1:9000'), 'http://127.0.0.1:9000');
  assert.equal(checkBase('http://localhost:9000'), 'http://localhost:9000');
  for (const bad of ['https://evil.example', 'http://api.worldlabs.ai', 'https://api.worldlabs.ai.evil.example', 'https://127.0.0.1:1', 'not a url', 'http://10.0.0.1']) assert.throws(() => checkBase(bad), Error, bad);
});

test('scrub turns addresses and ids into placeholders and keeps the shape and the numbers', () => {
  const out = scrub({ operation_id: 'abc', response: { world_id: 'w', id: 'x', world_marble_url: 'https://marble.worldlabs.ai/w', assets: { thumbnail_url: 'https://cdn/x.jpg?Sig=1', caption: 'A kitchen', splats: { spz_urls: { '500k': '//cdn/a.spz' }, semantics_metadata: { metric_scale_factor: 1.5 } } } }, list: ['http://a', 'b'] });
  assert.deepEqual(out, { operation_id: '<operation_id>', response: { world_id: '<world_id>', id: '<id>', world_marble_url: '<world_marble_url>', assets: { thumbnail_url: '<url>', caption: 'A kitchen', splats: { spz_urls: { '500k': '<url>' }, semantics_metadata: { metric_scale_factor: 1.5 } } } }, list: ['<url>', 'b'] });
  assert.equal(scrub(null), null);
  assert.equal(scrub(7), 7);
});

test('describeUrl keeps the host, the extension and the names of the query parameters, and says whether it looks signed', () => {
  assert.deepEqual(describeUrl('https://cdn.example/a/b.spz?Expires=9&Signature=zzz'), { host: 'cdn.example', extension: 'spz', queryParams: ['Expires', 'Signature'], looksSigned: true });
  assert.deepEqual(describeUrl('https://cdn.example/a/b.glb'), { host: 'cdn.example', extension: 'glb', queryParams: [], looksSigned: false });
  assert.deepEqual(describeUrl('nonsense'), { host: null, extension: null, queryParams: [], looksSigned: false });
  assert.equal(describeUrl('https://x/y?X-Amz-Expires=5').looksSigned, true);
  assert.equal(describeUrl('https://x/y?page=2').looksSigned, false);
});

test('assetUrls names every address of a world', () => {
  const urls = assetUrls({ assets: { thumbnail_url: 'a', splats: { spz_urls: { '500k': 'b', full_res: 'c' } }, mesh: { collider_mesh_url: 'd', hq_mesh_url: 'e' }, imagery: { pano_url: 'f' } } });
  assert.deepEqual(urls, { spz_500k: 'b', spz_full_res: 'c', collider_mesh: 'd', hq_mesh: 'e', pano: 'f', thumbnail: 'a' });
  assert.deepEqual(assetUrls({}), {});
  assert.deepEqual(assetUrls(undefined), {});
});

test('a dry run checks the balance, sends nothing that costs, and writes nothing', async () => {
  const api = await server(); const dir = work();
  const { lines, done } = run(api, dir);
  const r = await done;
  assert.equal(r.dryRun, true);
  assert.deepEqual(api.seen.map((s) => s.url), ['/marble/v1/credits']);
  assert.ok(lines.some((l) => /dry run: nothing was sent/.test(l)));
  assert.ok(lines.some((l) => /230 credits/.test(l)));
  assert.equal(existsSync(join(dir, 'out')), false);
  assert.equal(existsSync(join(dir, 'ledger.json')), false);
  assert.ok(!lines.join('\n').includes(KEY));
  assert.ok(!lines.join('\n').includes(Buffer.from('not really a jpeg but some bytes').toString('base64')), 'picture bytes are not printed');
  await api.close(); rmSync(dir, { recursive: true });
});

test('refuses without a key, with a base that is not the real service, over the cap, below the balance, and for a bad picture', async () => {
  const api = await server({ balance: 100 }); const dir = work();
  await assert.rejects(run(api, dir, { apiKey: '' }).done, /WLT_API_KEY is not set/);
  await assert.rejects(run(api, dir, { apiBase: 'https://evil.example' }).done, /only sent to/);
  await assert.rejects(run(api, dir, { maxCredits: 100 }).done, /--max-credits is 100/);
  await assert.rejects(run(api, dir, { model: 'marble-1.1' }).done, /can cost up to 1580/);
  await assert.rejects(run(api, dir, { spend: true }).done, /below the most this could cost/);
  await assert.rejects(run(api, dir, { image: join(dir, 'missing.jpg') }).done, /must be a file that exists/);
  await assert.rejects(run(api, dir, { image: picture(dir, 'x.gif') }).done, /jpg, jpeg, png or webp/);
  await assert.rejects(run(api, dir, { image: picture(dir, 'empty.png', Buffer.alloc(0)) }).done, /between 1 byte/);
  await assert.rejects(run(api, dir, { image: picture(dir, 'big.png', Buffer.alloc(10 * 1024 * 1024 + 1)) }).done, /between 1 byte/);
  assert.ok(!api.seen.some((s) => s.url === '/marble/v1/worlds:generate'), 'nothing that costs was ever asked');
  await api.close(); rmSync(dir, { recursive: true });
});

test('refuses when the ledger says the total cap would be passed', async () => {
  const api = await server(); const dir = work();
  writeFileSync(join(dir, 'ledger.json'), JSON.stringify({ spent: 5900, runs: [] }));
  await assert.rejects(run(api, dir, { spend: true }).done, /would pass the total cap/);
  assert.ok(!api.seen.some((s) => s.url === '/marble/v1/worlds:generate'));
  await api.close(); rmSync(dir, { recursive: true });
});

test('judges the cap by the most a run can cost, and allows a run that lands exactly on the total cap', async () => {
  const api = await server({ balance: 100000 }); const dir = work();
  await assert.rejects(run(api, dir, { model: 'marble-1.1-plus', maxCredits: 2000 }).done, /can cost up to 3080/);
  writeFileSync(join(dir, 'ledger.json'), JSON.stringify({ spent: 5770, runs: [] }));
  const r = await run(api, dir, { spend: true }).done; // 5770 + 230 = 6000, the cap itself
  assert.equal(r.dryRun, false);
  await api.close(); rmSync(dir, { recursive: true });
});

test('refuses when the credit check does not answer like the World API', async () => {
  const api = await server({ credits: () => [401, { detail: 'bad key' }] }); const dir = work();
  await assert.rejects(run(api, dir, { spend: true }).done, /credit check answered 401/);
  await api.close(); rmSync(dir, { recursive: true });
});

test('a full run sends a private image request, polls, records what came back, saves it scrubbed, and updates the ledger', async () => {
  const api = await server(); const dir = work();
  const bytes = Buffer.from('some picture bytes');
  const { lines, done } = run(api, dir, { image: picture(dir, 'kitchen.jpeg', bytes), spend: true, deleteAfter: true });
  const r = await done;
  assert.equal(r.dryRun, false);

  const generate = api.seen.find((s) => s.url === '/marble/v1/worlds:generate');
  assert.equal(generate.key, KEY);
  assert.equal(generate.method, 'POST');
  assert.deepEqual(generate.body, {
    display_name: 'hauntology-spike', model: 'marble-1.0-draft',
    permission: { public: false, allow_id_access: false, allowed_readers: [], allowed_writers: [] },
    world_prompt: { type: 'image', image_prompt: { source: 'data_base64', data_base64: bytes.toString('base64'), extension: 'jpg' } },
  });
  assert.equal(api.seen.filter((s) => s.url === '/marble/v1/operations/op-secret-1').length, 3);

  const s = r.summary;
  assert.equal(s.cost.total_credits, 230);
  assert.equal(s.operationExpiresInMinutes, 60);
  assert.equal(s.world.idField, 'world_id');
  assert.deepEqual(s.world.assetKeys, { top: ['caption', 'thumbnail_url', 'splats', 'mesh', 'imagery'], splats: ['spz_urls', 'semantics_metadata'], mesh: ['collider_mesh_url'], imagery: ['pano_url'] });
  assert.deepEqual(s.world.semantics, { metric_scale_factor: 1.23, ground_plane_offset: 0.42 });
  assert.equal(s.assets.spz_500k.head.contentType, 'application/octet-stream');
  assert.equal(s.assets.spz_500k.head.acceptRanges, 'bytes');
  assert.equal(s.assets.spz_500k.looksSigned, false);
  assert.equal(s.assets.spz_full_res.looksSigned, true);
  assert.equal(s.assets.thumbnail.looksSigned, true);
  assert.equal(s.assets.collider_mesh.head.contentType, 'model/gltf-binary');
  assert.deepEqual(s.delete, { status: 200, assetStatusAfter: 200 });
  assert.equal(s.balanceBefore, 5000);
  assert.deepEqual(s.timeline.map((t) => t.status), ['IN_PROGRESS', 'IN_PROGRESS', 'SUCCEEDED']);
  assert.ok(api.script.deleted);

  // What was saved holds no address, no id and no key.
  const files = readdirSync(join(dir, 'out'));
  assert.equal(files.length, 2);
  for (const f of files) {
    const text = readFileSync(join(dir, 'out', f), 'utf8');
    assert.ok(!text.includes('127.0.0.1:') || /"host": "127.0.0.1"/.test(text), f);
    assert.ok(!/https?:\/\//.test(text), `${f} holds an address`);
    assert.ok(!text.includes('secret-1'), `${f} holds an id`);
    assert.ok(!text.includes(KEY), `${f} holds the key`);
    assert.ok(!text.includes(bytes.toString('base64')), `${f} holds the picture`);
  }
  const fixture = JSON.parse(readFileSync(join(dir, 'out', files.find((f) => !f.includes('summary'))), 'utf8'));
  assert.equal(fixture.response.assets.splats.spz_urls['500k'], '<url>');
  assert.equal(fixture.response.assets.splats.semantics_metadata.metric_scale_factor, 1.23);
  assert.equal(fixture.operation_id, '<operation_id>');

  const ledger = JSON.parse(readFileSync(join(dir, 'ledger.json'), 'utf8'));
  assert.equal(ledger.spent, 230);
  assert.equal(ledger.runs.length, 1);
  assert.equal(ledger.runs[0].actual, 230);
  assert.ok(!lines.join('\n').includes(KEY));
  assert.ok(!/https?:\/\//.test(lines.join('\n').replace(/http:\/\/127\.0\.0\.1:\d+/g, '')), 'no address is printed');
  await api.close(); rmSync(dir, { recursive: true });
});

test('a full run can download the files for inspection', async () => {
  const api = await server(); const dir = work();
  await run(api, dir, { spend: true, downloadDir: join(dir, 'dl') }).done;
  assert.deepEqual(readdirSync(join(dir, 'dl')).sort(), ['collider_mesh.glb', 'pano.jpg', 'spz_100k.spz', 'spz_500k.spz', 'spz_full_res.spz', 'thumbnail.jpg']);
  await api.close(); rmSync(dir, { recursive: true });
});

test('records a refusal of an asset address without failing the run', async () => {
  const api = await server({ assetStatus: (req) => (req.url.includes('thumb') ? 403 : 200) }); const dir = work();
  const r = await run(api, dir, { spend: true }).done;
  assert.equal(r.summary.assets.thumbnail.head.status, 403);
  assert.equal(r.summary.assets.spz_500k.head.status, 200);
  await api.close(); rmSync(dir, { recursive: true });
});

test('stops, and does not count the cost, when generate is refused (402, 400, 429, 422)', async () => {
  for (const [status, detail, extra] of [[402, 'insufficient credits', {}], [400, 'content policy at https://x.example/img.jpg', {}], [429, 'slow down', { 'Retry-After': '30' }], [422, 'bad body', {}]]) {
    const api = await server({ generate: () => [status, { detail }, extra] }); const dir = work();
    await assert.rejects(run(api, dir, { spend: true }).done, (e) => {
      assert.match(e.message, new RegExp(`refused with ${status}`));
      assert.ok(!e.message.includes('https://x.example'), 'an address in the detail is hidden');
      if (status === 429) assert.match(e.message, /Retry-After 30/);
      return true;
    });
    const ledger = JSON.parse(readFileSync(join(dir, 'ledger.json'), 'utf8'));
    assert.equal(ledger.spent, 0);
    assert.equal(existsSync(join(dir, 'out')), false);
    await api.close(); rmSync(dir, { recursive: true });
  }
});

test('records an operation that ends in an error, and saves what there is', async () => {
  const api = await server({ operation: () => [200, { operation_id: 'op-secret-1', done: true, error: { code: 400, message: 'content policy' }, cost: null }] }); const dir = work();
  const r = await run(api, dir, { spend: true }).done;
  assert.deepEqual(r.summary.error, { code: 400, message: 'content policy' });
  assert.deepEqual(r.summary.assets, {});
  assert.equal(readdirSync(join(dir, 'out')).length, 2);
  await api.close(); rmSync(dir, { recursive: true });
});

test('waits out a 429 while polling, and gives up at the timeout, keeping the estimate in the ledger', async () => {
  let n = 0;
  const a = await server({ operation: () => (++n === 1 ? [429, {}, { 'Retry-After': '1' }] : [200, { operation_id: 'op-secret-1', done: true, response: { world_id: 'w', assets: {} }, cost: { total_credits: 230 } }]) });
  const dirA = work();
  const waits = [];
  const okRun = await run(a, dirA, { spend: true, sleep: async (ms) => { waits.push(ms); } }).done;
  assert.equal(okRun.dryRun, false);
  assert.ok(waits.includes(1000), 'it waited the time the service asked for');
  await a.close(); rmSync(dirA, { recursive: true });

  const b = await server({ operation: () => [200, { operation_id: 'op-secret-1', done: false }] });
  const dirB = work();
  let t = 0;
  await assert.rejects(run(b, dirB, { spend: true, timeoutMs: 1000, now: () => (t += 400) }).done, /gave up after the timeout/);
  const ledger = JSON.parse(readFileSync(join(dirB, 'ledger.json'), 'utf8'));
  assert.equal(ledger.spent, 230);
  assert.match(ledger.runs[0].note, /may still charge/);
  await b.close(); rmSync(dirB, { recursive: true });
});

test('a polling error stops the run', async () => {
  const api = await server({ operation: () => [500, { detail: 'oops' }] }); const dir = work();
  await assert.rejects(run(api, dir, { spend: true }).done, /polling answered 500/);
  await api.close(); rmSync(dir, { recursive: true });
});

test('uses the cost the service reports for the ledger when it differs from the estimate', async () => {
  const api = await server({ operation: () => [200, { operation_id: 'op-secret-1', done: true, response: { world_id: 'w', assets: {} }, cost: { total_credits: 300 } }] }); const dir = work();
  await run(api, dir, { spend: true }).done;
  assert.equal(JSON.parse(readFileSync(join(dir, 'ledger.json'), 'utf8')).spent, 300);
  await api.close(); rmSync(dir, { recursive: true });
});

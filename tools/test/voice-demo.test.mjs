// Tests for tools/voice-demo: the pure logic (lib.mjs) against the REAL Library manifest and story banks, and the server (serve.mjs).
// Nothing here calls a model or touches the network beyond 127.0.0.1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULTS, NICKS, ZONES, buildSequence, fillPlaceholders, finiteCombos, hashOf, partySteps, pickLine, placeholdersOf, readingMs, resolve, wanderSteps } from '../voice-demo/lib.mjs';
import { createDemoServer, listenLocal, loadManifest, loadRows } from '../voice-demo/serve.mjs';

const manifest = loadManifest();
const rows = loadRows();
const seq = buildSequence({ manifest, rows });
const pippaFiles = new Set(manifest.entries.filter((e) => e.voice === 'inworld:Pippa').map((e) => hashOf(e.key)));
const line = (id) => seq.lines.find((l) => l.id === id);

test('placeholders: found, filled, and left alone when there is no value', () => {
  assert.deepEqual(placeholdersOf('It is {band}. Look {bearing}, {nick}. {band}'), ['band', 'bearing', 'nick']);
  assert.equal(fillPlaceholders('Look {bearing}, {nick}.', { bearing: 'left' }), 'Look left, {nick}.');
  assert.equal(fillPlaceholders('No placeholders.', { a: 1 }), 'No placeholders.');
  assert.deepEqual(finiteCombos('Hello.', manifest.finite), [{}]);
  assert.equal(finiteCombos('It is {band}. Look {bearing}.', manifest.finite).length, 24);
  assert.equal(finiteCombos('Hello {nick}.', manifest.finite).length, 1, 'a name is not a finite placeholder');
});

test('the real sequence has no holes: every combination a Whisper line can take has audio in the Library', () => {
  assert.deepEqual(seq.holes, []);
  const voiced = seq.lines.filter((l) => l.spoken);
  assert.equal(voiced.length, 69, '36 single-player lines and 33 spoken party lines of the Whisper');
  for (const l of voiced) assert.ok(l.variants.length > 0, `${l.id} has no audio`);
});

test('a combination with no audio in the Library is reported as a hole, not hidden', () => {
  const entry = manifest.entries.find((e) => e.voice === 'inworld:Pippa' && e.sources.includes('hint.soft.1'));
  const cut = { ...manifest, entries: manifest.entries.filter((e) => e !== entry) };
  const holey = buildSequence({ manifest: cut, rows });
  assert.ok(holey.holes.length >= 1);
  assert.ok(holey.holes.every((h) => h.id === 'hint.soft.1'));
  assert.equal(holey.lines.find((l) => l.id === 'hint.soft.1').variants.length, 24 - holey.holes.length);
});

test('every Pippa file in the manifest is reachable from some line, and no line points anywhere else', () => {
  const used = new Set(seq.lines.flatMap((l) => l.variants.map((v) => v.file)));
  assert.equal(used.size, 209);
  assert.deepEqual([...used].sort(), [...pippaFiles].sort());
});

test('lines with placeholders have one variant per combination: 24 for a hint, 6 for the weather, 3 for a tease, 1 for a plain line', () => {
  assert.equal(line('hint.soft.1').variants.length, 24);
  assert.equal(line('ambient.soft.1').variants.length, 6);
  assert.equal(line('ambient.soft.3').variants.length, 8);
  assert.equal(line('tease.soft.1').variants.length, 3);
  assert.equal(line('meet.soft.1').variants.length, 1);
});

test('the Keeper and the text-only lines are kept but silent', () => {
  assert.equal(line('turn-start.dry.1').spoken, false);
  assert.deepEqual(line('turn-start.dry.1').variants, []);
  assert.equal(line('haunt.choose.soft.1').spoken, false);
  assert.equal(line('haunt.rise.soft.1').spoken, false);
  assert.equal(line('cue.bell.dry.1').spoken, false);
  assert.equal(rows.length, 211);
  assert.equal(seq.lines.length, 211);
});

test('a line is resolved for its context: the weather as an adjective, the audio file, and no unspoken tail', () => {
  const r = resolve(line('ambient.soft.1'), { ...DEFAULTS, weather: 'cloudy' });
  assert.equal(r.voiced, true);
  assert.match(r.spoken, /Today it is cloudy\./);
  assert.equal(r.tail, '');
  assert.match(r.file, /^[0-9a-f]{64}$/);
  const clear = resolve(line('ambient.soft.1'), { ...DEFAULTS, weather: 'clear' });
  assert.notEqual(clear.file, r.file, 'a different weather is a different file');
  assert.match(clear.spoken, /Today it is clear\./);
});

test('a sentence that holds a name is shown but never spoken: it becomes the tail, filled in', () => {
  const r = resolve(line('haunt.cold-spot.soft.3'), { ...DEFAULTS, zone: 'cellar' });
  assert.equal(r.voiced, true);
  assert.ok(!r.spoken.includes('cellar'));
  assert.equal(r.tail, 'Something has gathered in the cellar.');
  assert.equal(r.text, `${r.spoken} ${r.tail}`);
  const p = resolve(line('poltergeist.soft.2'), { ...DEFAULTS, nick: 'Sam' });
  assert.equal(p.tail, 'You have joined the haunting, Sam.');
});

test('a Keeper line is text only, filled in; a line with its audio missing is flagged, not played', () => {
  const k = resolve(line('turn-start.dry.1'), { ...DEFAULTS, nick: 'Robin' });
  assert.equal(k.voiced, false);
  assert.equal(k.file, null);
  assert.match(k.text, /Go on, Robin\./);
  const gone = buildSequence({ manifest, rows, hasFile: () => false });
  const m = resolve(gone.lines.find((l) => l.id === 'meet.soft.1'), DEFAULTS);
  assert.equal(m.missing, true);
  assert.equal(m.file, null);
});

test('every variant of every line is found again from its own values', () => {
  for (const l of seq.lines.filter((x) => x.spoken)) for (const v of l.variants) {
    const r = resolve(l, { ...DEFAULTS, ...v.values });
    assert.equal(r.file, v.file, `${l.id} ${JSON.stringify(v.values)}`);
    assert.ok(r.text.startsWith(r.spoken), l.id);
  }
});

test('pickLine avoids lines just said, and handles a kind with one line or none', () => {
  const first = pickLine(seq, 'tease', 'soft', { rng: () => 0 });
  assert.equal(first.id, 'tease.soft.1');
  assert.equal(pickLine(seq, 'tease', 'soft', { rng: () => 0, recent: ['tease.soft.1'] }).id, 'tease.soft.2');
  const all = ['tease.soft.1', 'tease.soft.2', 'tease.soft.3', 'tease.soft.4', 'tease.soft.5'];
  assert.ok(all.includes(pickLine(seq, 'tease', 'soft', { rng: () => 0.99, recent: all }).id), 'when every line was just said, it still says one');
  assert.equal(pickLine(seq, 'meet', 'soft', { recent: ['meet.soft.1'] }).id, 'meet.soft.1');
  assert.equal(pickLine(seq, 'no-such-kind', 'soft'), null);
  assert.equal(pickLine(seq, 'tease', 'soft', { rng: () => 1 }).id, 'tease.soft.5', 'an rng at the top of its range stays in bounds');
});

test('both scripted sessions only ask for lines that exist, and every voiced one resolves to audio in its own context', () => {
  for (const [name, steps] of [['wander', wanderSteps()], ['party', partySteps()]]) {
    assert.ok(steps.length >= 12, name);
    for (const s of steps) {
      const candidates = seq.lines.filter((l) => l.kind === s.kind && l.suffix === s.suffix);
      assert.ok(candidates.length > 0, `${name}: no line of kind ${s.kind} (${s.suffix})`);
      for (const l of candidates) {
        const r = resolve(l, s.ctx);
        assert.equal(r.missing, false, `${name}: ${l.id} has no audio for ${JSON.stringify(s.ctx)}`);
        assert.equal(r.voiced, l.spoken, `${name}: ${l.id}`);
      }
    }
  }
});

test('the Wander ends where a game does: three finds, then the ending twice; the party round has the Whisper and the Keeper', () => {
  const kinds = wanderSteps().map((s) => s.kind);
  assert.equal(kinds.filter((k) => k === 'reveal').length, 2, 'two finds, the third is the ending');
  assert.deepEqual(kinds.slice(-2), ['ending', 'ending']);
  assert.equal(kinds[0], 'meet');
  const party = partySteps();
  assert.ok(party.some((s) => s.suffix === 'soft') && party.some((s) => s.suffix === 'dry'));
  assert.ok(party.some((s) => s.kind === 'haunt.blackout'));
  assert.equal(party.at(-1).kind, 'end.haunting');
  for (const n of NICKS) assert.ok(n.length > 0);
  assert.ok(ZONES.includes(DEFAULTS.zone));
});

test('a silent line stays on screen long enough to read, never under two seconds', () => {
  assert.equal(readingMs('Hi.'), 2000);
  assert.equal(readingMs('x'.repeat(100)), 5500);
});

// ---- the server ----
async function withServer(fn, { voices = ['inworld:Pippa'] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'demo-'));
  const pip = manifest.entries.filter((e) => e.voice === 'inworld:Pippa').slice(0, 2).map((e) => hashOf(e.key));
  const ron = hashOf(manifest.entries.find((e) => e.voice === 'inworld:Ronald').key);
  const bytes = Buffer.from(Array.from({ length: 2000 }, (_, i) => i % 251));
  for (const h of [...pip, ron]) writeFileSync(join(dir, `${h}.take1.mp3`), bytes);
  writeFileSync(join(dir, 'report.json'), '{"secret":"report"}');
  const server = createDemoServer({ libDir: dir, manifest, rows });
  await listenLocal(server, 0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try { return await fn({ base, server, pip, ron, bytes, dir }); } finally { await new Promise((r) => server.close(r)); rmSync(dir, { recursive: true, force: true }); }
}

test('server: listens on 127.0.0.1 only, serves the page and its two scripts with safe headers', async () => {
  await withServer(async ({ base, server }) => {
    assert.equal(server.address().address, '127.0.0.1');
    for (const [path, type] of [['/', 'text/html'], ['/page.mjs', 'text/javascript'], ['/lib.mjs', 'text/javascript']]) {
      const r = await fetch(base + path);
      assert.equal(r.status, 200, path);
      assert.match(r.headers.get('content-type'), new RegExp(type));
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
      await r.arrayBuffer();
    }
    const html = await (await fetch(base + '/')).text();
    assert.match(html, /Pippa play-through/);
    assert.ok(!/<script(?![^>]*src=)/i.test(html), 'no inline script (the policy forbids it)');
  });
});

test('server: /sequence.json is the real sequence, with present audio flagged from the folder', async () => {
  await withServer(async ({ base }) => {
    const j = await (await fetch(base + '/sequence.json')).json();
    assert.equal(j.voice, 'inworld:Pippa');
    assert.equal(j.lines.length, 211);
    assert.deepEqual(j.holes, []);
    const present = j.lines.flatMap((l) => l.variants).filter((v) => v.present).length;
    assert.equal(present, 2, 'only the two files in the folder are present');
  });
});

test('server: audio is served by manifest hash only, with ranges, and nothing else on disk is reachable', async () => {
  await withServer(async ({ base, pip, ron, bytes }) => {
    const ok = await fetch(`${base}/audio/${pip[0]}.mp3`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'audio/mpeg');
    assert.equal(ok.headers.get('accept-ranges'), 'bytes');
    assert.deepEqual(Buffer.from(await ok.arrayBuffer()), bytes);

    const part = await fetch(`${base}/audio/${pip[0]}.mp3`, { headers: { range: 'bytes=10-19' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), 'bytes 10-19/2000');
    assert.deepEqual(Buffer.from(await part.arrayBuffer()), bytes.subarray(10, 20));
    const tail = await fetch(`${base}/audio/${pip[0]}.mp3`, { headers: { range: 'bytes=-5' } });
    assert.equal(tail.status, 206);
    assert.deepEqual(Buffer.from(await tail.arrayBuffer()), bytes.subarray(1995));
    const bad = await fetch(`${base}/audio/${pip[0]}.mp3`, { headers: { range: 'bytes=5000-6000' } });
    assert.equal(bad.status, 416);
    await bad.arrayBuffer();

    for (const path of [`/audio/${ron}.mp3`, `/audio/${'a'.repeat(64)}.mp3`, '/audio/../../etc/passwd', `/audio/..%2f..%2fetc%2fpasswd`, '/audio/report.json', '/report.json', '/.voice-library/report.json', '/serve.mjs', '/index.html', '/../package.json', `/audio/${pip[0].toUpperCase()}.mp3`]) {
      const r = await fetch(base + path);
      assert.equal(r.status, 404, path);
      await r.arrayBuffer();
    }
    // the second Pippa entry exists; a Pippa entry whose file is not in the folder is a 404 too
    const missing = manifest.entries.filter((e) => e.voice === 'inworld:Pippa')[5];
    assert.equal((await fetch(`${base}/audio/${hashOf(missing.key)}.mp3`)).status, 404);
  });
});

test('server: only GET and HEAD are allowed', async () => {
  await withServer(async ({ base, pip }) => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const r = await fetch(`${base}/sequence.json`, { method, body: method === 'DELETE' ? undefined : '{}' });
      assert.equal(r.status, 405, method);
      assert.equal(r.headers.get('allow'), 'GET, HEAD');
    }
    const head = await fetch(`${base}/audio/${pip[0]}.mp3`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), '2000');
  });
});

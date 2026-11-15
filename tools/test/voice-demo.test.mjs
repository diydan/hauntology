// Tests for tools/voice-demo: the pure logic (lib.mjs) against the REAL Library manifest and story banks, and the server (serve.mjs).
// Nothing here calls a model or touches the network beyond 127.0.0.1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AVATAR_OF_SUFFIX, CHARACTERS, CLIPS, DEFAULTS, DEMO_ONLY, NICKS, SUSPECT_IDS, VOICE_OF_SUFFIX, ZONES,
  avatarOf, buildSequence, clipFor, clipKey, fillPlaceholders, finiteCombos, hashOf, lineById, partySteps, pickLine, placeholdersOf, readingMs, resolve, suspectCtx, wanderSteps,
} from '../voice-demo/lib.mjs';
import { AVATAR_IDS, CLIP_NAMES, createDemoServer, listenLocal, loadManifest, loadRows } from '../voice-demo/serve.mjs';

const manifest = loadManifest();
const rows = loadRows();
const seq = buildSequence({ manifest, rows });
const line = (id) => seq.lines.find((l) => l.id === id);
const allFiles = new Set(manifest.entries.map((e) => hashOf(e.key)));

test('placeholders: found, filled, and left alone when there is no value', () => {
  assert.deepEqual(placeholdersOf('It is {band}. Look {bearing}, {nick}. {band}'), ['band', 'bearing', 'nick']);
  assert.equal(fillPlaceholders('Look {bearing}, {nick}.', { bearing: 'left' }), 'Look left, {nick}.');
  assert.equal(fillPlaceholders('No placeholders.', { a: 1 }), 'No placeholders.');
  assert.deepEqual(finiteCombos('Hello.', manifest.finite), [{}]);
  assert.equal(finiteCombos('It is {band}. Look {bearing}.', manifest.finite).length, 24);
  assert.equal(finiteCombos('Hello {nick}.', manifest.finite).length, 1, 'a name is not a finite placeholder');
});

test('the real sequence has no holes: every combination any Speaker can say has audio in the Library', () => {
  assert.deepEqual(seq.holes, []);
  for (const l of seq.lines.filter((x) => x.spoken)) assert.ok(l.variants.length > 0, `${l.id} has no audio`);
});

test('a combination with no audio in the Library is reported as a hole, not hidden', () => {
  const entry = manifest.entries.find((e) => e.voice === 'inworld:Pippa' && e.sources.includes('hint.soft.1'));
  const holey = buildSequence({ manifest: { ...manifest, entries: manifest.entries.filter((e) => e !== entry) }, rows });
  assert.ok(holey.holes.length >= 1);
  assert.ok(holey.holes.every((h) => h.id === 'hint.soft.1'));
  assert.equal(holey.lines.find((l) => l.id === 'hint.soft.1').variants.length, 24 - holey.holes.length);
  const lodgerCut = buildSequence({ manifest: { ...manifest, entries: manifest.entries.filter((e) => !(e.voice === 'inworld:Chloe' && e.sources.includes('lodger.stall.1'))) }, rows });
  assert.deepEqual(lodgerCut.holes, [{ id: 'lodger.stall.1', values: { voice: 'inworld:Chloe' } }]);
});

test('every one of the 503 files in the manifest is reachable from some line, and no line points anywhere else', () => {
  const used = new Set(seq.lines.flatMap((l) => l.variants.map((v) => v.file)));
  assert.equal(used.size, 503);
  assert.deepEqual([...used].sort(), [...allFiles].sort());
});

test('the sequence holds all 227 lines: 168 are voiced, 59 are text only', () => {
  assert.equal(rows.length, 227);
  assert.equal(seq.lines.length, 227);
  assert.equal(seq.lines.filter((l) => l.spoken).length, 168, '69 Whisper, 88 Keeper and 11 Lodger lines');
  assert.equal(seq.lines.filter((l) => !l.spoken).length, 59, '54 party lines and the 5 Lodger asides');
  assert.equal(seq.lines.filter((l) => l.spoken && l.suffix === 'soft').length, 69);
  assert.equal(seq.lines.filter((l) => l.spoken && l.suffix === 'dry').length, 88);
  assert.equal(seq.lines.filter((l) => l.spoken && l.suffix === 'lodger').length, 11);
});

test('lines with placeholders have one variant per combination, and a Lodger line one per Suspect voice', () => {
  assert.equal(line('hint.soft.1').variants.length, 24);
  assert.equal(line('hint.dry.1').variants.length, 24);
  assert.equal(line('ambient.soft.1').variants.length, 6);
  assert.equal(line('ambient.dry.3').variants.length, 8);
  assert.equal(line('tease.soft.1').variants.length, 3);
  assert.equal(line('meet.soft.1').variants.length, 1);
  assert.equal(line('turn-start.dry.1').variants.length, 1);
  for (const id of ['lodger.stall.1', 'lodger.confession.4']) {
    assert.deepEqual(line(id).variants.map((v) => v.values.voice), manifest.lodgerVoices, id);
    assert.equal(new Set(line(id).variants.map((v) => v.file)).size, 6, 'six voices, six files');
  }
});

test('text-only lines are kept but silent: a cue, a nudge, a choice prompt, a Haunt level, an aside', () => {
  for (const id of ['cue.bell.dry.1', 'nudge.help.dry.1', 'haunt.choose.soft.1', 'haunt.rise.soft.1', 'lodger.aside.1']) {
    assert.equal(line(id).spoken, false, id);
    assert.deepEqual(line(id).variants, [], id);
  }
});

test('a line is resolved for its context: the weather as an adjective, the audio file, and no unspoken tail', () => {
  const r = resolve(line('ambient.soft.1'), { ...DEFAULTS, weather: 'cloudy' });
  assert.equal(r.voiced, true);
  assert.match(r.spoken, /Today it is cloudy\./);
  assert.equal(r.tail, '');
  assert.match(r.file, /^[0-9a-f]{64}$/);
  const clear = resolve(line('ambient.soft.1'), { ...DEFAULTS, weather: 'clear' });
  assert.notEqual(clear.file, r.file, 'a different weather is a different file');
});

test('a sentence that holds a name is shown but never spoken: it becomes the tail, filled in', () => {
  const r = resolve(line('haunt.cold-spot.soft.3'), { ...DEFAULTS, zone: 'cellar' });
  assert.equal(r.voiced, true);
  assert.ok(!r.spoken.includes('cellar'));
  assert.equal(r.tail, 'Something has gathered in the cellar.');
  assert.equal(r.text, `${r.spoken} ${r.tail}`);
  assert.equal(resolve(line('poltergeist.soft.2'), { ...DEFAULTS, nick: 'Sam' }).tail, 'You have joined the haunting, Sam.');
});

test('the Keeper is voiced now: his lines play in Ronald\'s files, cut before a name like the Whisper\'s', () => {
  const r = resolve(line('turn-start.dry.1'), { ...DEFAULTS, nick: 'Robin' });
  assert.equal(r.voiced, true);
  assert.equal(r.speaker, 'keeper');
  assert.equal(r.tail, 'Go on, Robin.');
  const ronald = new Set(manifest.entries.filter((e) => e.voice === 'inworld:Ronald').map((e) => hashOf(e.key)));
  assert.ok(ronald.has(r.file));
  const pippa = new Set(manifest.entries.filter((e) => e.voice === 'inworld:Pippa').map((e) => hashOf(e.key)));
  assert.ok(pippa.has(resolve(line('meet.soft.1'), DEFAULTS).file));
  assert.ok(ronald.has(resolve(line('meet.dry.1'), DEFAULTS).file));
});

test('a Lodger line is spoken in the Suspect\'s own voice: the same line is a different file for each Suspect, and with no Suspect it has none', () => {
  const files = SUSPECT_IDS.map((id) => resolve(line('lodger.stall.2'), { ...DEFAULTS, ...suspectCtx(id) }).file);
  assert.equal(new Set(files).size, 6);
  for (const f of files) assert.match(f, /^[0-9a-f]{64}$/);
  const chloe = manifest.entries.find((e) => e.voice === 'inworld:Chloe' && e.sources.includes('lodger.stall.2'));
  assert.equal(resolve(line('lodger.stall.2'), { ...DEFAULTS, ...suspectCtx('cora') }).file, hashOf(chloe.key));
  const none = resolve(line('lodger.stall.2'), { ...DEFAULTS, voice: undefined });
  assert.equal(none.missing, true);
  assert.equal(none.file, null);
  const aside = resolve(line('lodger.aside.1'), { ...DEFAULTS, ...suspectCtx('vane') });
  assert.equal(aside.voiced, false);
  assert.equal(aside.missing, false);
});

test('a line with its audio missing is flagged, not played', () => {
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

test('pickLine avoids lines just said, and handles a kind with one line or none, for every voice', () => {
  assert.equal(pickLine(seq, 'tease', 'soft', { rng: () => 0 }).id, 'tease.soft.1');
  assert.equal(pickLine(seq, 'tease', 'soft', { rng: () => 0, recent: ['tease.soft.1'] }).id, 'tease.soft.2');
  const all = ['tease.soft.1', 'tease.soft.2', 'tease.soft.3', 'tease.soft.4', 'tease.soft.5'];
  assert.ok(all.includes(pickLine(seq, 'tease', 'soft', { rng: () => 0.99, recent: all }).id));
  assert.equal(pickLine(seq, 'meet', 'soft', { recent: ['meet.soft.1'] }).id, 'meet.soft.1');
  assert.equal(pickLine(seq, 'no-such-kind', 'soft'), null);
  assert.equal(pickLine(seq, 'tease', 'soft', { rng: () => 1 }).id, 'tease.soft.5');
  assert.equal(pickLine(seq, 'stall', 'lodger', { rng: () => 0 }).id, 'lodger.stall.1');
  assert.equal(pickLine(seq, 'seal', 'dry', { rng: () => 0 }).id, 'seal.dry.1');
  assert.equal(lineById(seq, 'lodger.confession.1').kind, 'confession');
  assert.equal(lineById(seq, 'nope'), null);
});

// ---- characters and clips ----
test('the eight characters: a portrait id each, the six Suspects with their own voice and their own confession line', () => {
  assert.deepEqual(Object.keys(CHARACTERS).sort(), ['ashby', 'cora', 'dunmore', 'percy', 'pike', 'thorne', 'vane', 'whisper']);
  assert.equal(CHARACTERS.cora.voice, 'Chloe');
  assert.equal(CHARACTERS.dunmore.voice, 'Victoria');
  assert.equal(SUSPECT_IDS.length, 6);
  assert.deepEqual(AVATAR_OF_SUFFIX, { soft: 'whisper', dry: 'ashby' });
  assert.deepEqual(VOICE_OF_SUFFIX, { soft: 'inworld:Pippa', dry: 'inworld:Ronald' });
  assert.equal(new Set(SUSPECT_IDS.map((id) => CHARACTERS[id].voiceId)).size, 6);
  assert.equal(new Set(SUSPECT_IDS.map((id) => CHARACTERS[id].confession)).size, 6);
  for (const id of SUSPECT_IDS) {
    assert.ok(manifest.lodgerVoices.includes(CHARACTERS[id].voiceId), `${id}'s voice is a Lodger voice of the Library`);
    assert.ok(line(CHARACTERS[id].confession), `${id}'s confession line exists`);
    assert.equal(suspectCtx(id).voice, CHARACTERS[id].voiceId);
  }
});

test('who is on screen: the Whisper, Mr. Ashby, or the Suspect in the context', () => {
  assert.equal(avatarOf('whisper', {}), 'whisper');
  assert.equal(avatarOf('keeper', {}), 'ashby');
  assert.equal(avatarOf('lodger', { suspect: 'pike' }), 'pike');
  assert.equal(avatarOf('lodger', {}), null);
});

test('the 17 clips: 9 on bank lines, 6 confessions (each one Suspect on one line), and 2 made for the demo only', () => {
  assert.equal(Object.keys(CLIPS).length, 15);
  assert.equal(DEMO_ONLY.length, 2);
  const names = [...Object.values(CLIPS), ...DEMO_ONLY.map((d) => d.clip)];
  assert.equal(new Set(names).size, 17);
  for (const key of Object.keys(CLIPS)) assert.ok(line(key.split('|')[0]), `${key} is a real line`);
  assert.equal(clipFor('meet.soft.1'), 'hero-whisper-meet');
  assert.equal(clipFor('meet.dry.1'), 'hero-ashby-welcome');
  assert.equal(clipFor('poltergeist.soft.1'), 'demo-n4-whisper-welcome');
  assert.equal(clipFor('ending.soft.1'), 'demo-n2-whisper-farewell');
  assert.equal(clipFor('meet.soft.2'), null, 'a line with no clip');
  assert.equal(clipFor('lodger.confession.1', 'vane'), 'hero-suspect-vane-confession');
  assert.equal(clipFor('lodger.confession.1', 'cora'), null, 'a clip belongs to one Suspect and one line');
  assert.equal(clipFor('lodger.confession.2', 'vane'), null);
  assert.equal(clipKey('lodger.confession.3', 'percy'), 'lodger.confession.3|percy');
  for (const id of SUSPECT_IDS) assert.equal(clipFor(CHARACTERS[id].confession, id), `hero-suspect-${id}-confession`);
});

test('the two demo-only lines are in no bank and no Library', () => {
  const texts = new Set(rows.map((r) => r.text));
  const spoken = new Set(manifest.entries.map((e) => e.spoken));
  for (const d of DEMO_ONLY) {
    assert.ok(!texts.has(d.text), `${d.id} must not be a bank line`);
    assert.ok(![...spoken].some((s) => d.text.startsWith(s) || s.startsWith(d.text)), `${d.id} must not be in the Library`);
  }
});

// ---- the sessions ----
const sessions = [
  ['wander (Whisper)', wanderSteps(DEFAULTS, 'soft')],
  ['wander (Keeper)', wanderSteps(DEFAULTS, 'dry')],
  ['party, the haunting wins', partySteps(DEFAULTS, 'haunted')],
  ['party, the case is solved', partySteps(DEFAULTS, 'solved')],
];

test('every step of every session asks for lines that exist, and every voiced one has audio in its own context', () => {
  for (const [name, steps] of sessions) {
    assert.ok(steps.length >= 11, name);
    for (const s of steps) {
      const candidates = s.forceId ? [line(s.forceId)] : seq.lines.filter((l) => l.kind === s.kind && l.suffix === s.suffix);
      assert.ok(candidates.length > 0 && candidates.every(Boolean), `${name}: no line for ${s.kind} (${s.suffix})`);
      for (const l of candidates) {
        const r = resolve(l, s.ctx);
        assert.equal(r.missing, false, `${name}: ${l.id} has no audio for ${JSON.stringify(s.ctx)}`);
        assert.equal(r.voiced, l.spoken, `${name}: ${l.id}`);
      }
    }
  }
});

test('the Wander ends where a game does, for either ghost: two finds, then the ending twice', () => {
  for (const suffix of ['soft', 'dry']) {
    const steps = wanderSteps(DEFAULTS, suffix);
    const kinds = steps.map((s) => s.kind);
    assert.equal(kinds[0], 'meet');
    assert.equal(kinds.filter((k) => k === 'reveal').length, 2);
    assert.deepEqual(kinds.slice(-2), ['ending', 'ending']);
    assert.ok(steps.every((s) => s.suffix === suffix));
  }
});

test('the party round with a wrong Accusation: the Keeper opens it, a Suspect stalls in their own voice, the Whisper takes the player in and the haunting wins', () => {
  const steps = partySteps(DEFAULTS, 'haunted');
  const kinds = steps.map((s) => s.kind);
  assert.ok(kinds.indexOf('accuse.reveal') < kinds.indexOf('stall') && kinds.indexOf('stall') < kinds.indexOf('accuse.wrong') && kinds.indexOf('accuse.wrong') < kinds.indexOf('poltergeist'));
  const stall = steps.find((s) => s.kind === 'stall');
  assert.equal(stall.suffix, 'lodger');
  assert.equal(stall.ctx.voice, CHARACTERS.thorne.voiceId);
  assert.equal(stall.ctx.suspect, 'thorne');
  assert.ok(steps.some((s) => s.kind === 'haunt.blackout'));
  assert.equal(steps.at(-1).kind, 'end.haunting');
  assert.ok(steps.some((s) => s.suffix === 'soft') && steps.some((s) => s.suffix === 'dry'));
});

test('the party round that is solved: a right Accusation, the Suspect\'s own confession (with the clip made for it), the Keeper closes', () => {
  const steps = partySteps(DEFAULTS, 'solved');
  const confession = steps.find((s) => s.kind === 'confession');
  assert.equal(confession.forceId, CHARACTERS.vane.confession);
  assert.equal(confession.ctx.suspect, 'vane');
  assert.equal(clipFor(confession.forceId, confession.ctx.suspect), 'hero-suspect-vane-confession');
  const kinds = steps.map((s) => s.kind);
  assert.ok(kinds.indexOf('accuse.reveal') < kinds.indexOf('confession') && kinds.indexOf('confession') < kinds.indexOf('accuse.right'));
  assert.deepEqual(kinds.slice(-2), ['accuse.right', 'end.solved']);
  assert.ok(steps.some((s) => s.kind === 'aside' && s.suffix === 'lodger'), 'the Suspect named in a theory (text only)');
  assert.ok(!kinds.includes('stall') && !kinds.includes('poltergeist'));
  for (const n of NICKS) assert.ok(n.length > 0);
  assert.ok(ZONES.includes(DEFAULTS.zone));
});

test('a silent line stays on screen long enough to read, never under two seconds', () => {
  assert.equal(readingMs('Hi.'), 2000);
  assert.equal(readingMs('x'.repeat(100)), 5500);
});

// ---- the server ----
async function withServer(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'demo-'));
  const lib = join(dir, 'lib'); const art = join(dir, 'art');
  mkdirSync(lib); mkdirSync(join(art, 'cutouts'), { recursive: true }); mkdirSync(join(art, 'clips'));
  const hashesOf = (voice) => manifest.entries.filter((e) => e.voice === voice).map((e) => hashOf(e.key));
  const pip = hashesOf('inworld:Pippa').slice(0, 2);
  const ron = hashesOf('inworld:Ronald')[0];
  const bytes = Buffer.from(Array.from({ length: 2000 }, (_, i) => i % 251));
  for (const h of [...pip, ron]) writeFileSync(join(lib, `${h}.take1.mp3`), bytes);
  writeFileSync(join(lib, 'report.json'), '{"secret":"report"}');
  writeFileSync(join(lib, `${'b'.repeat(64)}.take1.mp3`), bytes); // a file named like Library audio whose hash no manifest entry names
  const img = Buffer.from('RIFFxxxxWEBPimage-bytes');
  const mp4 = Buffer.from(Array.from({ length: 3000 }, (_, i) => (i * 7) % 256));
  writeFileSync(join(art, 'cutouts', 'color-whisper-head.webp'), img);
  writeFileSync(join(art, 'cutouts', 'color-secret-head.webp'), 'not a character');
  writeFileSync(join(art, 'clips', 'hero-whisper-meet.mp4'), mp4);
  writeFileSync(join(art, 'clips', 'test-suspect-dunmore-confession-nervous.mp4'), 'a real file that is not in the list');
  writeFileSync(join(art, 'notes.txt'), 'private');
  const server = createDemoServer({ libDir: lib, artDir: art, manifest, rows });
  await listenLocal(server, 0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try { return await fn({ base, server, pip, ron, bytes, img, mp4 }); } finally { await new Promise((r) => server.close(r)); rmSync(dir, { recursive: true, force: true }); }
}
const get = async (url, init) => { const r = await fetch(url, init); const body = Buffer.from(await r.arrayBuffer()); return { r, body }; };

test('server: listens on 127.0.0.1 only, serves the page and its two scripts with safe headers', async () => {
  await withServer(async ({ base, server }) => {
    assert.equal(server.address().address, '127.0.0.1');
    for (const [path, type] of [['/', 'text/html'], ['/page.mjs', 'text/javascript'], ['/lib.mjs', 'text/javascript']]) {
      const { r } = await get(base + path);
      assert.equal(r.status, 200, path);
      assert.match(r.headers.get('content-type'), new RegExp(type));
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
    }
    const html = (await get(base + '/')).body.toString();
    assert.match(html, /play-through/);
    assert.ok(!/<script(?![^>]*src=)/i.test(html), 'no inline script (the policy forbids it)');
  });
});

test('server: /sequence.json is the real sequence, and says which audio, portraits and clips are present', async () => {
  await withServer(async ({ base }) => {
    const j = JSON.parse((await get(base + '/sequence.json')).body.toString());
    assert.equal(j.lines.length, 227);
    assert.deepEqual(j.holes, []);
    assert.equal(j.lines.flatMap((l) => l.variants).filter((v) => v.present).length, 3, 'only the three files in the folder are present');
    assert.equal(j.characters.whisper.present, true);
    assert.equal(j.characters.ashby.present, false);
    assert.equal(j.characters.pike.name, 'Dr. Pike');
    assert.equal(j.clips['meet.soft.1'].present, true);
    assert.equal(j.clips['meet.dry.1'].present, false);
    assert.equal(j.clips['lodger.confession.1|vane'].name, 'hero-suspect-vane-confession');
    assert.deepEqual(j.demoOnly.map((d) => [d.id, d.present]), [['demo-n1', false], ['demo-n3', false]]);
  });
});

test('server: audio is served by manifest hash only, in any voice of the Library, with ranges', async () => {
  await withServer(async ({ base, pip, ron, bytes }) => {
    for (const h of [pip[0], ron]) {
      const { r, body } = await get(`${base}/audio/${h}.mp3`);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('content-type'), 'audio/mpeg');
      assert.equal(r.headers.get('accept-ranges'), 'bytes');
      assert.deepEqual(body, bytes);
    }
    const part = await get(`${base}/audio/${pip[0]}.mp3`, { headers: { range: 'bytes=10-19' } });
    assert.equal(part.r.status, 206);
    assert.equal(part.r.headers.get('content-range'), 'bytes 10-19/2000');
    assert.deepEqual(part.body, bytes.subarray(10, 20));
    assert.deepEqual((await get(`${base}/audio/${pip[0]}.mp3`, { headers: { range: 'bytes=-5' } })).body, bytes.subarray(1995));
    assert.equal((await get(`${base}/audio/${pip[0]}.mp3`, { headers: { range: 'bytes=5000-6000' } })).r.status, 416);
    for (const path of [`/audio/${'b'.repeat(64)}.mp3`, `/audio/${'a'.repeat(64)}.mp3`, '/audio/../../etc/passwd', '/audio/..%2f..%2fetc%2fpasswd', '/audio/report.json', '/report.json', `/audio/${pip[0].toUpperCase()}.mp3`]) {
      assert.equal((await get(base + path)).r.status, 404, path);
    }
    const missing = hashOf(manifest.entries.find((e) => e.voice === 'inworld:Pippa' && !pip.includes(hashOf(e.key))).key);
    assert.equal((await get(`${base}/audio/${missing}.mp3`)).r.status, 404, 'in the manifest but not in the folder');
  });
});

test('server: a portrait is served by character id only, and nothing else in the art folder is reachable', async () => {
  await withServer(async ({ base, img }) => {
    const ok = await get(`${base}/avatar/whisper.webp`);
    assert.equal(ok.r.status, 200);
    assert.equal(ok.r.headers.get('content-type'), 'image/webp');
    assert.deepEqual(ok.body, img);
    assert.equal((await get(`${base}/avatar/ashby.webp`)).r.status, 404, 'a character whose file is missing');
    for (const path of ['/avatar/secret.webp', '/avatar/../notes.txt', '/avatar/..%2fnotes.txt', '/avatar/WHISPER.webp', '/avatar/whisper.png', '/notes.txt', '/cutouts/color-whisper-head.webp', '/art/notes.txt']) {
      assert.equal((await get(base + path)).r.status, 404, path);
    }
    assert.ok(AVATAR_IDS.has('whisper') && !AVATAR_IDS.has('secret'));
  });
});

test('server: a clip is served by name from the fixed list only, with ranges (a video element needs them)', async () => {
  await withServer(async ({ base, mp4 }) => {
    const ok = await get(`${base}/clip/hero-whisper-meet.mp4`);
    assert.equal(ok.r.status, 200);
    assert.equal(ok.r.headers.get('content-type'), 'video/mp4');
    assert.equal(ok.r.headers.get('accept-ranges'), 'bytes');
    assert.deepEqual(ok.body, mp4);
    const part = await get(`${base}/clip/hero-whisper-meet.mp4`, { headers: { range: 'bytes=100-199' } });
    assert.equal(part.r.status, 206);
    assert.equal(part.r.headers.get('content-range'), 'bytes 100-199/3000');
    assert.deepEqual(part.body, mp4.subarray(100, 200));
    assert.equal((await get(`${base}/clip/hero-ashby-welcome.mp4`)).r.status, 404, 'in the list but not in the folder');
    for (const path of ['/clip/test-suspect-dunmore-confession-nervous.mp4', '/clip/../notes.txt', '/clip/..%2fnotes.txt', '/clip/hero-whisper-meet.mp3', '/clip/HERO-WHISPER-MEET.mp4', '/clips/hero-whisper-meet.mp4']) {
      assert.equal((await get(base + path)).r.status, 404, path);
    }
    assert.ok(CLIP_NAMES.has('hero-whisper-meet') && CLIP_NAMES.has('demo-n1-whisper-memory') && !CLIP_NAMES.has('test-suspect-dunmore-confession-nervous'));
    assert.equal(CLIP_NAMES.size, 17);
  });
});

test('server: only GET and HEAD are allowed', async () => {
  await withServer(async ({ base, pip }) => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const { r } = await get(`${base}/sequence.json`, { method, body: method === 'DELETE' ? undefined : '{}' });
      assert.equal(r.status, 405, method);
      assert.equal(r.headers.get('allow'), 'GET, HEAD');
    }
    const head = await get(`${base}/audio/${pip[0]}.mp3`, { method: 'HEAD' });
    assert.equal(head.r.status, 200);
    assert.equal(head.r.headers.get('content-length'), '2000');
    const headClip = await get(`${base}/clip/hero-whisper-meet.mp4`, { method: 'HEAD' });
    assert.equal(headClip.r.headers.get('content-length'), '3000');
  });
});

// Tests for tools/voice-demo: the pure logic (lib.mjs) against the REAL Library manifest and story banks, and the server (serve.mjs).
// Nothing here calls a model or touches the network beyond 127.0.0.1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AVATAR_OF_SUFFIX, BAND_LEVEL, BEARING_ANGLE, CHARACTERS, CLIPS, DEFAULTS, DEMO_ONLY, HAUNT_EVENTS, HAUNT_MAX, MEMORIES, NICKS, SUSPECT_IDS, VOICE_OF_SUFFIX, ZONES,
  avatarOf, bandLevel, buildSequence, clipFor, clipKey, compassAngle, fillPlaceholders, finiteCombos, hashOf, hudAfter, hudAnnouncement, hudDelta, hudReduce, initialHud, lineById, partySteps, pickLine, placeholdersOf, readingMs, resolve, revealFraction, sceneLabel, splitWords, suspectCtx, upNextLabel, wanderSteps, wordsShown,
} from '../voice-demo/lib.mjs';
import { AVATAR_IDS, CLIP_NAMES, FONT_NAMES, createDemoServer, listenLocal, loadManifest, loadRows } from '../voice-demo/serve.mjs';

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

test('every one of the 532 files in the manifest is reachable from some line, and no line points anywhere else', () => {
  const used = new Set(seq.lines.flatMap((l) => l.variants.map((v) => v.file)));
  assert.equal(used.size, 532);
  assert.deepEqual([...used].sort(), [...allFiles].sort());
});

test('the sequence holds all 251 lines: 192 are voiced, 59 are text only', () => {
  assert.equal(rows.length, 251);
  assert.equal(seq.lines.length, 251);
  assert.equal(seq.lines.filter((l) => l.spoken).length, 192, '86 Whisper, 95 Keeper and 11 Lodger lines');
  assert.equal(seq.lines.filter((l) => !l.spoken).length, 59, '54 party lines and the 5 Lodger asides');
  assert.equal(seq.lines.filter((l) => l.spoken && l.suffix === 'soft').length, 86);
  assert.equal(seq.lines.filter((l) => l.spoken && l.suffix === 'dry').length, 95);
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
    assert.equal(j.lines.length, 251);
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

// ---- the look: black, brown, green and yellow; round portraits; readable text ----
const root = resolvePath(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(root, 'tools/voice-demo/index.html'), 'utf8');
// The look is the design system now (design/elements.css, tested in design-system.test.mjs). This file tests the page: what it puts where and how it is wired.
const pageStyle = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
const elementsCss = readFileSync(join(root, 'design/elements.css'), 'utf8');
const css = `${elementsCss}\n${pageStyle}`;
const rule = (selector) => { const m = new RegExp(`(?:^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css); assert.ok(m, `no CSS rule for ${selector}`); return m[1].replace(/\s+/g, ' '); };
/** All the declarations of every top-level rule for a selector, joined (a selector may have several rules). */
const ruleAll = (selector) => { const re = new RegExp(`(?:^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g'); const out = [...css.matchAll(re)].map((m) => m[1].replace(/\s+/g, ' ')).join(' '); assert.ok(out, `no CSS rule for ${selector}`); return out; };

test('server: a font is served by name from a fixed list of four, with the content policy allowing fonts from itself', async () => {
  await withServer(async ({ base }) => {
    for (const name of FONT_NAMES) {
      const { r, body } = await get(`${base}/design/fonts/${name}.woff2`);
      assert.equal(r.status, 200, name);
      assert.equal(r.headers.get('content-type'), 'font/woff2');
      assert.equal(body.subarray(0, 4).toString('latin1'), 'wOF2', name);
      assert.match(r.headers.get('content-security-policy'), /font-src 'self'/);
    }
    for (const path of ['/fonts/newsreader-latin-400-normal.woff2', '/design/fonts/nope.woff2', '/design/fonts/OFL-Newsreader.txt', '/design/fonts/README.md', '/design/fonts/../serve.mjs', '/design/fonts/..%2fserve.mjs', '/design/fonts/NEWSREADER-LATIN-400-NORMAL.woff2', '/design/fonts/newsreader-latin-400-normal.woff', '/design/fonts/', '/design/secret.css', '/design/../serve.mjs', '/design/%2e%2e/serve.mjs']) {
      assert.equal((await get(base + path)).r.status, 404, path);
    }
  });
});

// ---- the HUD and the dialogue (pure) ----
test('hud: the numbers are the rules\' own: three memories, a Haunt maximum of 10 with Events at 3, 6 and 9, eight bearings, three bands', () => {
  assert.equal(MEMORIES, 3);
  assert.equal(HAUNT_MAX, 10, 'the Classic preset (party-mode design: hauntMax 10)');
  assert.deepEqual([...HAUNT_EVENTS], [3, 6, 9]);
  assert.equal(Object.keys(BEARING_ANGLE).length, 8);
  assert.deepEqual(Object.keys(BAND_LEVEL), ['far', 'nearer', 'very close']);
  assert.deepEqual(Object.keys(BEARING_ANGLE), manifest.finite.bearing, 'the bearings are the Library\'s, in the same order');
  assert.deepEqual(Object.keys(BAND_LEVEL), manifest.finite.band);
});

test('hud: the compass turns clockwise from straight ahead, and a distance band fills 1, 2 or 3 bars', () => {
  assert.deepEqual(['ahead', 'ahead-right', 'right', 'behind-right', 'behind', 'behind-left', 'left', 'ahead-left'].map(compassAngle), [0, 45, 90, 135, 180, 225, 270, 315]);
  assert.equal(compassAngle('sideways'), null);
  assert.equal(compassAngle(null), null);
  assert.deepEqual(['far', 'nearer', 'very close', 'x'].map(bandLevel), [1, 2, 3, 0]);
});

test('hud: memories light as the ghost reveals them, the ending makes it three, and never more', () => {
  let h = initialHud();
  h = hudReduce(h, { kind: 'reveal' });
  assert.equal(h.memories, 1);
  h = hudReduce(hudReduce(hudReduce(h, { kind: 'reveal' }), { kind: 'reveal' }), { kind: 'reveal' });
  assert.equal(h.memories, 3, 'capped at three');
  assert.equal(hudReduce(initialHud(), { kind: 'ending' }).memories, 3);
  assert.equal(hudReduce(initialHud(), { kind: 'echo' }).memories, 0, 'going back to a memory finds nothing new');
});

test('hud: a hint sets the bearing and the band, a tease only the band; the HUD is never changed in place', () => {
  const start = initialHud();
  const hint = hudReduce(start, { kind: 'hint', ctx: { bearing: 'behind-left', band: 'very close' } });
  assert.deepEqual(hint.hint, { bearing: 'behind-left', band: 'very close' });
  assert.deepEqual(hudReduce(hint, { kind: 'tease', ctx: { band: 'far' } }).hint, { bearing: null, band: 'far' });
  assert.deepEqual(start, initialHud(), 'the old HUD is untouched');
  assert.deepEqual(hint.hint, { bearing: 'behind-left', band: 'very close' });
});

test('hud: the Haunt rises by one, falls by one, stays between 0 and its maximum, and a script may set it', () => {
  let h = initialHud();
  assert.equal(hudReduce(h, { kind: 'haunt.lull' }).haunt, 0, 'never below 0');
  h = hudReduce(h, { kind: 'haunt.rise' });
  assert.equal(h.haunt, 1);
  assert.equal(hudReduce(h, { kind: 'haunt.lull' }).haunt, 0);
  assert.equal(hudReduce(h, { kind: 'x', haunt: 6 }).haunt, 6);
  assert.equal(hudReduce(h, { kind: 'x', haunt: 99 }).haunt, HAUNT_MAX, 'never above the maximum');
  assert.equal(hudReduce(hudReduce(initialHud(), { kind: 'x', haunt: 10 }), { kind: 'haunt.rise' }).haunt, HAUNT_MAX);
});

test('hud: whose hour it is, and who has joined the haunting (once each)', () => {
  let h = hudReduce(initialHud(), { kind: 'turn-start', ctx: { nick: 'Sam' } });
  assert.equal(h.activeNick, 'Sam');
  h = hudReduce(h, { kind: 'poltergeist', ctx: { nick: 'Robin' } });
  h = hudReduce(h, { kind: 'poltergeist', ctx: { nick: 'Robin' } });
  assert.deepEqual(h.haunting, ['Robin']);
});

test('hud: the Wander ends with three memories and the last hint; the haunted round ends at the Haunt maximum with one player haunting', () => {
  const w = wanderSteps(DEFAULTS, 'soft');
  assert.deepEqual(hudAfter(w, -1), initialHud());
  assert.equal(hudAfter(w, 4).memories, 1, 'the first find is the fifth scene');
  assert.equal(hudAfter(w, 7).memories, 2);
  const endW = hudAfter(w, w.length - 1);
  assert.equal(endW.memories, 3);
  assert.deepEqual(endW.hint, { bearing: 'ahead', band: 'very close' });
  const p = partySteps(DEFAULTS, 'haunted');
  const endP = hudAfter(p, p.length - 1);
  assert.equal(endP.haunt, HAUNT_MAX);
  assert.deepEqual(endP.haunting, ['Robin']);
  assert.equal(endP.activeNick, 'Sam');
  // Back goes to an earlier HUD, because it is worked out from the script and not kept
  assert.deepEqual(hudAfter(p, 3).haunt, 3);
});

test('hud: the party script raises the Haunt as the spec has it: an Event at 3, at 6 and at 9, then the maximum', () => {
  const levels = partySteps(DEFAULTS, 'haunted').filter((s) => s.haunt !== undefined).map((s) => [s.kind, s.haunt]);
  assert.deepEqual(levels, [['haunt.cold-spot', 3], ['haunt.rise', 4], ['haunt.blackout', 6], ['haunt.restless', 9], ['end.haunting', 10]]);
  for (const [kind, level] of levels) if (kind.startsWith('haunt.') && kind !== 'haunt.rise') assert.ok(HAUNT_EVENTS.includes(level), `${kind} is an Event at level ${level}`);
  assert.deepEqual(partySteps(DEFAULTS, 'solved').filter((s) => s.haunt !== undefined).map((s) => s.haunt), [3]);
  // the Haunt falls by one at the lull, from 9 to 8, before it reaches the maximum
  const steps = partySteps(DEFAULTS, 'haunted');
  assert.equal(hudAfter(steps, steps.findIndex((s) => s.kind === 'haunt.lull')).haunt, 8);
});

test('dialogue: words appear as they are spoken, none before it starts, all at the end, and the last one is never late', () => {
  assert.deepEqual(splitWords('  Hello.  I was\nwaiting. '), ['Hello.', 'I', 'was', 'waiting.']);
  assert.deepEqual(splitWords(''), []);
  assert.equal(wordsShown(10, 0), 0);
  assert.equal(wordsShown(10, -1), 0);
  assert.equal(wordsShown(10, Number.NaN), 0);
  assert.equal(wordsShown(10, 0.01), 1, 'the first word shows as soon as it starts');
  assert.equal(wordsShown(10, 0.5), 5);
  assert.equal(wordsShown(10, 1), 10);
  assert.equal(wordsShown(10, 7), 10);
  assert.equal(revealFraction(0, 8), 0);
  assert.equal(revealFraction(4, 0), 0);
  assert.equal(revealFraction(4, Number.NaN), 0);
  assert.equal(revealFraction(7.2, 8), 1, 'complete at 90% of the sound, so the last word is not late');
  assert.equal(revealFraction(8, 8), 1);
  assert.ok(revealFraction(2, 8) > 0.27 && revealFraction(2, 8) < 0.28);
  let last = 0;
  for (let t = 0; t <= 8; t += 0.1) { const n = wordsShown(12, revealFraction(t, 8)); assert.ok(n >= last, 'never goes backwards'); last = n; }
  assert.equal(last, 12);
});

test('scenes: the label says where in the story we are', () => {
  const w = wanderSteps(DEFAULTS, 'soft');
  assert.equal(sceneLabel(w, 0), 'Scene 1 of 12: You step into the place');
  assert.equal(sceneLabel(w, 3), 'Scene 4 of 12: You press Hint (far)');
});

// ---- the page: layout, accessibility, and that the script and the HTML agree ----
const pageJs = readFileSync(join(root, 'tools/voice-demo/page.mjs'), 'utf8');
const libExports = await import('../voice-demo/lib.mjs');

test('page: every id the script uses is in the HTML, and every name it imports exists in lib.mjs', () => {
  const ids = new Set([...html.matchAll(/\sid="([A-Za-z0-9-]+)"/g)].map((m) => m[1]));
  const used = new Set([...pageJs.matchAll(/\$\('([A-Za-z0-9-]+)'\)/g)].map((m) => m[1]));
  for (const id of used) assert.ok(ids.has(id), `page.mjs uses #${id} but the HTML has no such id`);
  assert.ok(used.size > 40, 'the check is looking at the real script');
  const imported = /import\s*\{([^}]*)\}\s*from\s*'\/lib\.mjs'/.exec(pageJs)[1].split(',').map((x) => x.trim()).filter(Boolean);
  for (const name of imported) assert.ok(name in libExports, `page.mjs imports ${name} but lib.mjs does not export it`);
  assert.ok(imported.length > 20);
});

test('page: stage first, and a Director that is a bottom sheet on a phone and a side panel from 900 px', () => {
  const order = ['id="intro"', 'id="stage"', 'class="ui-transport transport-area"', 'class="ui-progress scenes-area"', 'id="director"', 'class="ui-panel journal-area"'].map((s) => html.indexOf(s));
  assert.ok(order.every((i) => i > 0), 'all the regions are there');
  assert.ok(order[1] < order[2] && order[2] < order[3] && order[3] < order[4], 'the stage comes before the controls in the page');
  assert.match(css, /grid-template-areas:"stage" "transport" "scenes" "journal"/, 'a phone gets one column, stage first');
  assert.match(css, /@media \(min-width: 900px\)[\s\S]*grid-template-areas:"stage director"/, 'from 900 px the Director is beside the stage');
  assert.match(html, /id="director" class="ui-sheet sheet-area"/, 'the Director is the shared sheet element');
  assert.match(ruleAll('.ui-sheet'), /position: fixed/);
  assert.match(ruleAll('.ui-sheet'), /transform: translateY\(105%\)/, 'closed, it is below the screen');
  assert.match(rule('.ui-sheet.is-open'), /transform: none/);
  assert.match(elementsCss, /@media \(min-width: 900px\) \{\s*\.ui-sheet \{ position: static;/, 'a side panel on a wide screen');
  assert.match(ruleAll('.ui-transport'), /position: sticky/, 'the transport stays in reach');
  assert.match(ruleAll('.ui-stage'), /min-height: 0/, 'a phone stage is only as tall as its content');
  assert.match(pageStyle, /@media \(min-width: 900px\) \{\s*\.stage-area \{ min-height:35rem; \}/, 'a wide stage has room to breathe');
  assert.ok(!/(?:^|\n)\s*\.(?:ui-)?[a-z-]+\s*\{[^}]*(?:background|color|border)/.test(pageStyle.replace(/@media[\s\S]*$/, '')), 'the page style says where things go, not how they look');
});

test('page: every control is at least 44 px, and the transport buttons are bigger', () => {
  assert.match(rule('.ui-button'), /min-height: var\(--target\)/);
  assert.match(rule('.ui-select, .ui-range, .ui-input'), /min-height: var\(--target\)/);
  assert.match(rule('.ui-fold > summary'), /min-height: var\(--target\)/);
  assert.match(rule('.ui-field--check .ui-field-label'), /min-height: var\(--target\)/, 'the words of a tick box are a target too');
  assert.match(rule('.ui-tool'), /min-height: var\(--target-main\)/);
  assert.match(rule('.ui-button--main'), /min-height: var\(--target-main\)/);
  const tokensCss = readFileSync(join(root, 'web/src/styles/tokens.css'), 'utf8');
  assert.match(tokensCss, /--target: 44px;/);
  assert.match(tokensCss, /--target-main: 52px;/);
  for (const m of html.matchAll(/<button\b[^>]*class="([^"]*)"/g)) assert.match(m[1], /\bui-button\b/, `every button uses the shared button: ${m[1]}`);
});

test('page: accessible: one polite live region, a log for the journal, a modal title card, a skip link, a language, names on every button', () => {
  assert.match(html, /<html lang="en">/);
  assert.equal((html.match(/aria-live="polite"/g) ?? []).length, 1, 'one place announces the line');
  assert.match(html, /id="sr" class="ui-sr-only" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /class="ui-log" id="log" role="log"/);
  assert.match(html, /id="intro" class="ui-modal" role="dialog" aria-modal="true" aria-labelledby="introTitle"/);
  assert.match(html, /id="introTitle"/);
  assert.match(html, /<a class="ui-skip" href="#stage">/);
  assert.match(html, /id="sub" class="ui-speech" aria-hidden="true"/, 'the word-by-word text is not announced twice');
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const name = /aria-label="([^"]+)"/.exec(m[1])?.[1] ?? m[2].replace(/<[^>]+>/g, '').trim();
    assert.ok(name.length > 0, `a button with no name: ${m[0].slice(0, 80)}`);
  }
  for (const id of ['weather', 'time', 'moon', 'bearing', 'band', 'nick', 'zone', 'suspect', 'persona', 'pause', 'vol', 'useClips']) assert.match(html, new RegExp(`for="${id}"`), `${id} has a label`);
});

test('page: the title card carries the first click that unlocks the sound, and the steering voice', () => {
  assert.match(html, /&gt; look/);
  assert.match(html, /You are in a place\./);
  for (const id of ['introWander', 'introParty', 'introSolved', 'introExplore']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(pageJs, /app\.inert = true/, 'the page behind the card cannot be reached until it is closed');
  assert.match(pageJs, /Escape/);
});

test('page: every button is a short label, with no subtitle line under it', () => {
  assert.doesNotMatch(html, /ui-button-sub|ui-story-sub/, 'no subtitle under a button');
  for (const m of html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) {
    const label = m[1].replace(/<[^>]+>/g, '').trim();
    assert.ok(label.length <= 40, `a button label over 40 characters: ${label}`);
  }
});

test('page: the transport and the keyboard: pause, back, next, stop, sound, and Space, arrows, Esc, M', () => {
  for (const id of ['btnBack', 'btnPause', 'btnNext', 'btnStop', 'btnMute', 'btnDirector']) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html, /Space pause/, 'the page shows no line of key hints: only short labels');
  for (const key of [`' '`, `'ArrowRight'`, `'ArrowLeft'`, `'Escape'`, `'m'`, `'r'`]) assert.ok(pageJs.includes(key), `the keyboard handles ${key}`);
  assert.match(html, /aria-pressed="false" disabled/, 'pause starts disabled until something plays');
});

test('page: motion is slow and small, and it all stops under prefers-reduced-motion, in the style and in the script', () => {
  assert.match(elementsCss, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.ui-orb\.is-speaking \{ animation: none; \}/, 'the looping breath stops');
  assert.match(readFileSync(join(root, 'web/src/styles/tokens.css'), 'utf8'), /@media \(prefers-reduced-motion: reduce\) \{\s*:root \{\s*--fade: 0ms;\s*--fade-quick: 0ms;\s*--fade-slow: 0ms;/, 'every fade is 0 ms, so every transition stops');
  assert.match(pageJs, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(pageJs, /reduceMotion\.matches/);
  assert.match(pageJs, /duration: tokenMs\('--fade-slow'\), easing: tokenCss\('--ease'\)/, 'the pulse takes its time and easing from the tokens');
  assert.ok(!/@keyframes\s+(shake|flash|flicker|blink)/i.test(css), 'no screen shake or flicker');
});

test('page: the HUD shows only what the rules give: memories, a compass with bars, the Haunt with Event marks, the players', () => {
  assert.match(css, /\.ui-seg--event::after/, 'the marks at 3, 6 and 9');
  assert.match(css, /\.ui-seg--max\.is-on \{ border-color: var\(--danger\); background: var\(--danger\)/, 'the last segment is the end of the game');
  assert.match(css, /\.ui-lamp\.is-on \{ border-color: var\(--accent\); background: var\(--accent\)/);
  assert.match(css, /\.ui-needle \{ transition: transform/, 'the needle turns, it does not jump');
  assert.match(pageJs, /classList\.add\(`ui-stage--\$\{kind\}`\)/, 'the stage is lit by whoever speaks');
  assert.match(pageJs, /shortest way|delta = \(\(angle - needleAngle \+ 540\) % 360\) - 180/, 'the needle takes the short way round');
  assert.match(pageJs, /Haunt \$\{hud\.haunt\} of \$\{HAUNT_MAX\}/);
  assert.match(pageJs, /joined the haunting/);
});

// ---- the second pass: palette depth, story cards, feedback, again, loading ----
test('hud feedback: what just changed is found by index, and only increases count (going back is not celebrated)', () => {
  const a = initialHud();
  const b = hudReduce(hudReduce(a, { kind: 'reveal' }), { kind: 'x', haunt: 4 });
  assert.deepEqual(hudDelta(a, b), { newLamps: [0], newSegs: [0, 1, 2, 3], newActive: null, newlyHaunting: [], newHint: false });
  assert.deepEqual(hudDelta(b, a), { newLamps: [], newSegs: [], newActive: null, newlyHaunting: [], newHint: false }, 'going back lights nothing');
  const c = hudReduce(hudReduce(b, { kind: 'turn-start', ctx: { nick: 'Sam' } }), { kind: 'poltergeist', ctx: { nick: 'Robin' } });
  assert.equal(hudDelta(b, c).newActive, 'Sam');
  assert.deepEqual(hudDelta(b, c).newlyHaunting, ['Robin']);
  assert.equal(hudDelta(c, c).newActive, null, 'the same player again is not new');
  assert.equal(hudDelta(a, hudReduce(a, { kind: 'hint', ctx: { bearing: 'left', band: 'far' } })).newHint, true);
});

test('hud feedback: the changes are also said in words for a screen reader, and nothing is said when nothing changed', () => {
  const a = initialHud();
  assert.equal(hudAnnouncement(a, a), '');
  assert.equal(hudAnnouncement(a, hudReduce(a, { kind: 'reveal' })), 'Memory 1 of 3 found.');
  assert.equal(hudAnnouncement(a, hudReduce(a, { kind: 'x', haunt: 3 })), 'The Haunt rises to 3 of 10. A Haunt Event fires at 3.');
  assert.equal(hudAnnouncement(hudReduce(a, { kind: 'x', haunt: 4 }), hudReduce(a, { kind: 'x', haunt: 4 })), '');
  assert.equal(hudAnnouncement(hudReduce(a, { kind: 'x', haunt: 4 }), hudReduce(a, { kind: 'x', haunt: 9 })), 'The Haunt rises to 9 of 10. A Haunt Event fires at 6. A Haunt Event fires at 9.');
  assert.match(hudAnnouncement(hudReduce(a, { kind: 'x', haunt: 9 }), hudReduce(a, { kind: 'x', haunt: 10 })), /The Haunt has reached its maximum\./);
  assert.equal(hudAnnouncement(hudReduce(a, { kind: 'x', haunt: 9 }), hudReduce(a, { kind: 'x', haunt: 8 })), 'The Haunt falls to 8.');
  assert.equal(hudAnnouncement(a, hudReduce(a, { kind: 'turn-start', ctx: { nick: 'Alex' } })), "Alex's hour.");
  assert.equal(hudAnnouncement(a, hudReduce(a, { kind: 'poltergeist', ctx: { nick: 'Robin' } })), 'Robin has joined the haunting.');
  assert.equal(hudAnnouncement(a, hudReduce(a, { kind: 'hint', ctx: { bearing: 'behind-left', band: 'very close' } })), 'Hint: behind-left, very close.');
  assert.equal(hudAnnouncement(a, hudReduce(a, { kind: 'tease', ctx: { band: 'far' } })), 'Hint: no bearing, far.');
});

test('scenes: "up next" says what is coming, and that the last scene is the last', () => {
  const w = wanderSteps(DEFAULTS, 'soft');
  assert.equal(upNextLabel(w, 0), 'Up next: A quiet moment (the weather)');
  assert.equal(upNextLabel(w, 10), 'Up next: You visit the ghost once more');
  assert.equal(upNextLabel(w, 11), 'The last scene.');
  assert.equal(upNextLabel([], 0), 'The last scene.');
});

test('ux: the title card says it is loading, cannot be used until the Library is there, and says so if it fails', () => {
  assert.match(html, /class="ui-status" id="introStatus" role="status">Loading the Library…/);
  for (const id of ['introWander', 'introParty', 'introSolved', 'introExplore']) assert.match(html, new RegExp(`id="${id}"[^>]* disabled>`), `${id} starts disabled`);
  assert.match(pageJs, /for \(const b of introButtons\) b\.disabled = false/);
  assert.match(pageJs, /The Library could not be loaded/);
  assert.match(pageJs, /Is \\`pnpm voice-demo\\` still running\?/);
  assert.match(pageJs, /Ready: \$\{voiced\.length\} voiced lines/);
  assert.match(css, /\.ui-status\.is-bad \{ color: var\(--danger\)/);
});

test('ux: a line can be said again (a button and R), the same line, in a story or on its own', () => {
  assert.match(html, /id="btnAgain" class="ui-button ui-button--quiet ui-dialogue-action" type="button" aria-label="Say it again" hidden>/);
  assert.match(pageJs, /function again\(\)/);
  assert.match(pageJs, /forceNext = lastSay\.forceId/, 'in a story it asks for the same line, not a new one');
  assert.match(pageJs, /lastSay = \{ kind, suffix, scene, over, forceId: line\.id \}/, 'it remembers the line that was said, not the kind');
  assert.match(pageJs, /\$\('btnAgain'\)\.hidden = false/);
});

test('ux: what the HUD did is said to a screen reader with the line, and each change pulses once, not under reduced motion', () => {
  assert.match(pageJs, /pendingAnnounce/);
  assert.match(pageJs, /\$\('sr'\)\.textContent = `\$\{speakerName\(r, id\)\}: \$\{r\.text\}\$\{pendingAnnounce/);
  assert.match(pageJs, /function pulse\(node\) \{\s*if \(reduceMotion\.matches/);
  assert.match(pageJs, /delta\.newLamps\.forEach/);
  assert.match(pageJs, /delta\.newSegs\.forEach/);
  assert.match(pageJs, /function resetHud\(\) \{ hud = initialHud\(\); shownHud = hud; pendingAnnounce = ''/, 'a reset is not announced as a fall');
  assert.match(html, /id="upNext" class="ui-progress-next"/);
  assert.match(pageJs, /upNextLabel\(steps, i\)/);
});

test('ux: opening the Director on a phone puts focus on its title, not on the first row', () => {
  assert.match(html, /<h2 class="ui-sheet-title" tabindex="-1" id="dirTitle">Director<\/h2>/);
  assert.match(pageJs, /if \(open\) \$\('dirTitle'\)\.focus\(\)/);
  assert.match(css, /\.ui-sheet-title:focus \{ outline: none; \}/);
});

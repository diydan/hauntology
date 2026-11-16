// The footage test page and its clip (Requirement 18 of .kiro/specs/puzzles): the files and the rules at source level, the page in jsdom
// with the media element stubbed, and the build. Page tests skip themselves when jsdom is not installed (it lives in web/node_modules).
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { JSDOM, install, root, tick, click } from './helpers.js';

const skip = !JSDOM && 'jsdom not installed';
const media = resolve(root, 'media');
const read = (f) => readFileSync(resolve(root, f), 'utf8');
const clips = readdirSync(media).filter((n) => /\.mp4$/.test(n)).map((n) => n.replace(/\.mp4$/, ''));
/** 18.5: a video file over 1 MB must say preload="metadata", so a long scene does not download before its screen needs it. */
const preloadOk = (videoTag, bytes) => bytes <= 1024 * 1024 || /\bpreload="metadata"/.test(videoTag);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

/** PROVENANCE.md as { heading: { row label: value } }: each `## heading` holds a two-column table. */
function records() {
  const out = {};
  for (const block of readFileSync(resolve(media, 'PROVENANCE.md'), 'utf8').split(/^## /m).slice(1)) {
    const [heading, ...rest] = block.split('\n');
    out[heading.trim()] = Object.fromEntries(rest.filter((l) => /^\| [^|]+ \| /.test(l) && !/^\| (-+|) /.test(l)).map((l) => l.split('|').slice(1, 3).map((c) => c.trim())));
  }
  return out;
}

/**
 * The AI clips (the "AI clips" section of PROVENANCE.md): each has a `#### name` entry, a table of its own shape. They are generated, not cut from a
 * film, so the rules of Requirement 18 for public-domain footage (a source record, no sound) do not cover them: that section says so itself.
 */
function aiRecords() {
  const out = {};
  const section = readFileSync(resolve(media, 'PROVENANCE.md'), 'utf8').split(/^## /m).find((b) => b.startsWith('AI clips')) ?? '';
  for (const block of section.split(/^#### /m).slice(1)) {
    const [heading, ...rest] = block.split('\n');
    out[heading.trim()] = Object.fromEntries(rest.filter((l) => /^\| [^|]+ \| /.test(l) && !/^\| (-+|) /.test(l)).map((l) => l.split('|').slice(1, 3).map((c) => c.trim())));
  }
  return out;
}
const aiClips = Object.keys(aiRecords());
/** The clips cut from a public-domain film: the AI clips are the rest. */
const filmClips = clips.filter((c) => !aiClips.includes(c));

/** The rule on a file's streams: a film clip is picture only (18.4); an AI clip is a picture and may keep the model's own sound. */
const streamsOk = (kinds, isAi) => (isAi ? kinds.includes('video') && kinds.every((k) => k === 'video' || k === 'audio') : kinds.length === 1 && kinds[0] === 'video');

/** The highest mean saturation (of 255) over the frames of a clip, sampled twice a second. */
function maxSaturation(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vf', 'fps=2,signalstats,metadata=print:key=lavfi.signalstats.SATAVG', '-f', 'null', '-'], { encoding: 'utf8' });
  const v = [...r.stderr.matchAll(/SATAVG=([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(v.length > 0, `no frames measured in ${file}`);
  return Math.max(...v);
}
const MAX_AI_SATURATION = 10; // of 255: the AI clips measure 0.02 to 4.6 on their worst frame (one frame of wander-letter-take2 is the highest), a tinted film frame is above 30

test('18.2 each clip has an mp4, a webm and a poster, and a full entry in PROVENANCE.md that points to a full source record', () => {
  assert.ok(filmClips.length >= 1, 'there is at least one clip');
  const rec = records();
  const sources = Object.keys(rec).filter((h) => h.startsWith('Source record: '));
  assert.ok(sources.length >= 1, 'there is a source record');
  for (const h of sources) for (const label of ['Film', 'Source', 'What that file is', 'Credited makers', 'Why it is free', 'Open point', 'Checked']) assert.ok(rec[h][label], `${h} has a "${label}" row`);
  for (const c of filmClips) {
    for (const ext of ['mp4', 'webm', 'jpg']) assert.ok(existsSync(resolve(media, `${c}.${ext}`)), `${c}.${ext}`);
    assert.ok(rec[c], `${c} has a heading in PROVENANCE.md`);
    for (const label of ['Record', 'Shot', 'Picture only', 'Cut by', 'Size', 'Flash check']) assert.ok(rec[c][label], `${c} has a "${label}" row`);
    assert.ok(sources.includes(rec[c].Record), `${c} points to a source record that exists (${rec[c].Record})`);
    assert.match(rec[c]['Flash check'], /at most \d+ flash/, `${c}: the flash check has a result`);
  }
  assert.deepEqual(Object.keys(rec).filter((h) => !h.startsWith('Source record: ') && !h.startsWith('AI clips')).sort(), [...filmClips].sort(), 'every entry is a clip in media/ and every film clip has an entry');
});

test('18.2 for the AI clips: an mp4, a webm and a poster, and an entry of the AI shape (model, take, sound, cut, size, flash check, where it came from, terms), every AI clip in media/ and every entry a clip', () => {
  const ai = aiRecords();
  assert.ok(aiClips.length >= 1, 'the AI section lists clips');
  for (const c of aiClips) {
    assert.ok(clips.includes(c), `${c} is a clip in media/`);
    for (const ext of ['mp4', 'webm', 'jpg']) assert.ok(existsSync(resolve(media, `${c}.${ext}`)), `${c}.${ext}`);
    for (const label of ['Record', 'Scene', 'Model', 'Take', 'Sound', 'Picture', 'Cut by', 'Size', 'Flash check', 'Where it came from', 'Terms']) assert.ok(ai[c][label], `${c} has a "${label}" row`);
    assert.match(ai[c].Record, /^AI clip\./, `${c}: the record says it is an AI clip, not footage`);
    assert.match(ai[c]['Flash check'], /at most \d+ flash/, `${c}: the flash check has a result`);
    assert.match(ai[c].Terms, /have not been read|label/i, `${c}: the terms row says what is still to do before the game is sold`);
  }
  assert.deepEqual([...aiClips].sort(), clips.filter((c) => !filmClips.includes(c)).sort());
  assert.match(readFileSync(resolve(media, 'PROVENANCE.md'), 'utf8'), /The prompts, exactly as submitted/, 'the section gives the prompts the clips were made from');
});

test('18.6 a scene is within the limits: at most 40 MB a video file, the poster at most 50 KB', () => {
  for (const c of clips) {
    assert.ok(statSync(resolve(media, `${c}.mp4`)).size <= 40 * 1024 * 1024, `${c}.mp4`);
    assert.ok(statSync(resolve(media, `${c}.webm`)).size <= 40 * 1024 * 1024, `${c}.webm`);
    assert.ok(statSync(resolve(media, `${c}.jpg`)).size <= 50 * 1024, `${c}.jpg`);
  }
});

const probe = spawnSync('ffprobe', ['-version']);
test('18.4 and 18.6 a film scene has no audio track (an AI clip may keep the model\'s own), and every scene runs at most 10 minutes and is at most 480 pixels high', { skip: probe.status !== 0 && 'ffprobe not installed' }, () => {
  for (const c of clips) for (const ext of ['mp4', 'webm']) {
    const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,height:format=duration', '-of', 'json', resolve(media, `${c}.${ext}`)], { encoding: 'utf8' });
    const j = JSON.parse(r.stdout);
    const kinds = [...new Set(j.streams.map((s) => s.codec_type))];
    assert.ok(streamsOk(kinds, aiClips.includes(c)), `${c}.${ext} has the streams [${kinds}]: a film clip is picture only, an AI clip is a picture with at most the model's own sound`); // generated clips keep the model's audio (PROVENANCE.md, AI clips)
    assert.ok(Number(j.format.duration) <= 600, `${c}.${ext} is at most 10 minutes`);
    assert.ok(j.streams[0].height <= 480, `${c}.${ext} is at most 480 pixels high`);
  }
});

test('18.3, 18.5 and 18.6 the page: muted, no controls, own origin only, a poster and both formats on every video, no network calls', () => {
  const html = strip(read('footage.html'));
  const js = strip(read('js/footage.js'));
  const css = strip(read('css/footage.css'));
  const scenes = strip(read('js/scenes.js'));
  const scenesPage = strip(read('js/scenes-page.js'));
  const videos = html.match(/<video\b[\s\S]*?<\/video>/g) || [];
  assert.ok(videos.length >= 1);
  // The one exception is the talking ghost of section 8 (#ft-lip): a lip-synced clip has its own voice, so it has controls, is not muted, and plays only when tapped.
  const lip = videos.filter((v) => /\bid="ft-lip"/.test(v));
  assert.equal(lip.length, 1, 'one lip-synced video');
  assert.match(lip[0], /\bcontrols\b/); assert.match(lip[0], /\bplaysinline\b/); assert.doesNotMatch(lip[0], /\bautoplay\b|\bmuted\b/); assert.doesNotMatch(lip[0], /\bsrc="https?:/);
  for (const v of videos.filter((x) => !lip.includes(x))) {
    assert.match(v, /\bmuted\b/, 'muted');
    assert.match(v, /\bplaysinline\b/, 'playsinline');
    assert.doesNotMatch(v, /\bcontrols\b|\bautoplay\b/, 'no controls, no autoplay attribute');
    assert.match(v, /\bposter="media\/[^"]+\.jpg"/, 'a poster');
    const biggest = Math.max(...[...v.matchAll(/<source src="(media\/[^"]+)"/g)].map((m) => statSync(resolve(root, m[1])).size));
    assert.ok(preloadOk(v, biggest), 'a scene over 1 MB loads only its metadata until it is played');
    for (const [ext, type] of [['webm', 'video/webm'], ['mp4', 'video/mp4']]) {
      const m = v.match(new RegExp(`<source src="(media/[^"]+\\.${ext})" type="${type}">`));
      assert.ok(m, `a ${ext} source`);
      assert.ok(existsSync(resolve(root, m[1])), `${m[1]} exists`);
    }
  }
  for (const m of html.matchAll(/<div class="ft-film"([^>]*)>/g)) {
    if (/data-shape="square"/.test(m[1])) assert.doesNotMatch(m[1], /aria-hidden/, 'the talking ghost has controls, so it is not hidden'); // section 8
    else assert.match(m[1], /aria-hidden="true"/, 'the picture is decoration');
  }
  for (const [name, src] of [['footage.html', html], ['footage.js', js], ['footage.css', css], ['scenes.js', scenes], ['scenes-page.js', scenesPage], ['lipsync-page.js', strip(read('js/lipsync-page.js'))], ['lipsync-data.js', strip(read('js/lipsync-data.js'))]]) assert.doesNotMatch(src, /https?:\/\//, `${name} loads nothing from another origin`);
  for (const [name, src] of [['footage.js', js], ['scenes.js', scenes], ['scenes-page.js', scenesPage]]) assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|MediaRecorder|captureStream|drawImage/, `${name}: no network, no recording`);
  assert.match(js, /prefers-reduced-motion/);
  assert.match(js, /visibilitychange/);
  assert.match(js, /saveData/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/, 'no colour of its own: tokens only');
});

test('18.3 the build copies the clip files, the poster and the two Reel sounds, and not the provenance note', () => {
  const dist = mkdtempSync(resolve(tmpdir(), 'playtest-dist-')); // not dist/: other test files read it while they run
  try {
    const r = spawnSync(process.execPath, [resolve(root, 'build.mjs')], { cwd: root, encoding: 'utf8', env: { ...process.env, PLAYTEST_DIST: dist } });
    assert.equal(r.status, 0, r.stderr);
    const built = readdirSync(resolve(dist, 'media')).sort();
    // narration (voice-<line id>.mp3) and lip-synced clips (lip-<name>.mp4) come from folders that are not in git, so they are there only when those folders are
    assert.ok(built.filter((n) => /^voice-/.test(n)).every((n) => /^voice-((scene|wander)\.[a-z-]+|reveal)\.(soft|dry)\.1\.mp3$/.test(n)), 'narration files are named by line id');
    assert.ok(built.filter((n) => /^lip-/.test(n)).every((n) => /^lip-hero-[a-z-]+\.mp4$/.test(n)), 'lip-synced clips are named lip-hero-<name>.mp4');
    assert.deepEqual(built.filter((n) => !/^(voice|lip)-/.test(n)), [...clips.flatMap((c) => [`${c}.jpg`, `${c}.mp4`, `${c}.webm`]), 'knock.m4a', 'scrape.m4a'].sort());
    for (const n of ['knock', 'scrape']) assert.deepEqual(readFileSync(resolve(dist, 'media', `${n}.m4a`)), readFileSync(resolve(root, '..', '..', 'web', 'public', 'sounds', `${n}.m4a`)), `${n}.m4a is the game's own file`);
    assert.ok(existsSync(resolve(dist, 'footage.html')));
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

// ---- the page in jsdom
function open({ reduce = false, hidden = false } = {}) {
  const dom = install('footage');
  const w = dom.window;
  const listeners = [];
  w.matchMedia = () => ({ matches: reduce, addEventListener: (t, f) => listeners.push([t, f]) });
  globalThis.matchMedia = w.matchMedia;
  const log = [];
  // the sounds: an Audio that records the file it was asked to play (jsdom has none that plays), and can be made to refuse
  const heard = [];
  const played = []; // every narration Audio made, so a test can end one
  const voices = []; // the narration files asked for (media/voice-<id>.mp3), kept apart from the two Reel sounds
  const audio = { refuse: false, broken: false };
  globalThis.Audio = class { constructor(src) { if (audio.broken) throw new Error('no audio'); this.src = src; this.currentTime = 0; } pause() { this.paused = true; } addEventListener(t, f) { if (t === 'ended') this.onended = f; } play() { if (this.src.endsWith('.mp3')) played.push(this);
    (this.src.endsWith('.mp3') ? voices : heard).push(this.src); return audio.refuse ? Promise.reject(new Error('blocked')) : Promise.resolve(); } };
  w.HTMLMediaElement.prototype.play = function () { log.push(['play', this.id || this.className]); this.__playing = true; return Promise.resolve(); };
  w.HTMLMediaElement.prototype.pause = function () { log.push(['pause', this.id || this.className]); this.__playing = false; };
  Object.defineProperty(w.document, 'hidden', { value: hidden, configurable: true });
  // the media element's time, length and load, which jsdom does not implement
  Object.defineProperty(w.HTMLMediaElement.prototype, 'currentTime', { get() { return this.__t || 0; }, set(v) { this.__t = v; }, configurable: true });
  Object.defineProperty(w.HTMLMediaElement.prototype, 'duration', { get() { return 4.2; }, configurable: true });
  w.HTMLMediaElement.prototype.load = function () { this.__loads = (this.__loads || 0) + 1; };
  return { w, log, listeners, heard, voices, played, audio };
}
let n = 0;
const load = () => import(`../js/footage.js?run=${++n}`);
const looping = () => [...document.querySelectorAll('video[loop]')];
const btn = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

test('18.5 the looping clips play on load, and Pause footage stops them', { skip }, async () => {
  const { log } = open();
  await load(); await tick(5);
  assert.equal(looping().length, 2);
  assert.ok(looping().every((v) => v.__playing === true), 'both loops play');
  assert.equal(document.querySelector('#ft-once').__playing, undefined, 'the once-clip waits for Replay');
  click(btn('Pause footage')); await tick(5);
  assert.ok(looping().every((v) => v.__playing === false), 'both loops stop');
  assert.ok(btn('Play footage'));
  assert.match(document.querySelector('#ft-status').textContent, /still frame/);
  log.length = 0;
  click(btn('Play footage')); await tick(5);
  assert.ok(looping().every((v) => v.__playing === true));
});

test('18.5 reduced motion starts with still frames, and a tap on Play is the Player\'s own choice', { skip }, async () => {
  const { log } = open({ reduce: true });
  await load(); await tick(5);
  assert.equal(log.filter(([a]) => a === 'play').length, 0, 'nothing plays');
  assert.match(document.querySelector('#ft-status').textContent, /Reduced motion/);
  click(document.querySelector('#ft-replay')); await tick(5);
  assert.ok(!document.querySelector('#ft-once').__playing, 'Replay does nothing while footage is off');
  click(btn('Play footage')); await tick(5);
  assert.ok(looping().every((v) => v.__playing === true));
});

test('18.5 a hidden page never plays, and showing it again resumes what was wanted', { skip }, async () => {
  const { w } = open({ hidden: true });
  await load(); await tick(5);
  assert.ok(looping().every((v) => !v.__playing), 'hidden: nothing plays');
  Object.defineProperty(w.document, 'hidden', { value: false, configurable: true });
  w.document.dispatchEvent(new w.Event('visibilitychange')); await tick(5);
  assert.ok(looping().every((v) => v.__playing === true), 'visible: they play');
  Object.defineProperty(w.document, 'hidden', { value: true, configurable: true });
  w.document.dispatchEvent(new w.Event('visibilitychange')); await tick(5);
  assert.ok(looping().every((v) => v.__playing === false), 'hidden again: they stop');
});

test('the look buttons set the look and say which is on; Replay plays the once-clip', { skip }, async () => {
  open();
  await load(); await tick(5);
  const radios = [...document.querySelectorAll('[role="radio"][data-look]')];
  assert.deepEqual(radios.map((r) => r.dataset.look), ['tint', 'mono', 'ink']);
  click(btn('Yellow ink'));
  assert.equal(document.body.dataset.look, 'ink');
  assert.deepEqual(radios.map((r) => r.getAttribute('aria-checked')), ['false', 'false', 'true']);
  click(btn('Black and white'));
  assert.equal(document.body.dataset.look, 'mono');
  assert.deepEqual(radios.map((r) => r.getAttribute('aria-checked')), ['false', 'true', 'false']);
  click(document.querySelector('#ft-replay')); await tick(5);
  assert.equal(document.querySelector('#ft-once').__playing, true);
});

test('18.5 a browser set to save data starts with still frames, and a tap on Play is the Player\'s own choice', { skip }, async () => {
  const { w } = open();
  Object.defineProperty(w.navigator, 'connection', { value: { saveData: true }, configurable: true });
  await load(); await tick(5);
  assert.ok(looping().every((v) => !v.__playing), 'nothing plays');
  assert.match(document.querySelector('#ft-status').textContent, /Data saver/);
  click(btn('Play footage')); await tick(5);
  assert.ok(looping().every((v) => v.__playing === true));
});

test('18.4 the stream rule tells a film clip from an AI clip: film is picture only, an AI clip may keep the model\'s own sound and nothing else', () => {
  assert.equal(streamsOk(['video'], false), true);
  assert.equal(streamsOk(['video', 'audio'], false), false, 'a film clip with a sound track is refused');
  assert.equal(streamsOk([], false), false);
  assert.equal(streamsOk(['video', 'audio'], true), true);
  assert.equal(streamsOk(['video'], true), true);
  assert.equal(streamsOk(['audio'], true), false, 'a clip with no picture is refused');
  assert.equal(streamsOk(['video', 'audio', 'subtitle'], true), false, 'an AI clip may carry sound and nothing else');
});

test('AI clips are black and white (decided 2026-11-15): the measure tells colour from grey, and every AI clip is grey', { skip: probe.status !== 0 && 'ffprobe not installed' }, () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'saturation-'));
  try {
    const make = (name, vf) => { const f = resolve(dir, name); const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:duration=2:rate=12', '-vf', vf, '-pix_fmt', 'yuv420p', f], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return f; };
    assert.ok(MAX_AI_SATURATION < 30, 'the limit sits well under a tinted film frame');
    assert.ok(maxSaturation(make('colour.mp4', 'null')) > MAX_AI_SATURATION, 'a colour picture measures above the limit');
    assert.ok(maxSaturation(make('grey.mp4', 'hue=s=0')) <= MAX_AI_SATURATION, 'a grey picture measures at or under it');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  for (const c of aiClips) assert.ok(maxSaturation(resolve(media, `${c}.mp4`)) <= MAX_AI_SATURATION, `${c}.mp4 is black and white (saturation of at most ${MAX_AI_SATURATION} of 255)`);
});

test('18.5 the preload rule: a small clip may preload, a big scene may not', () => {
  assert.ok(preloadOk('<video preload="auto">', 100 * 1024));
  assert.ok(!preloadOk('<video preload="auto">', 5 * 1024 * 1024));
  assert.ok(!preloadOk('<video>', 5 * 1024 * 1024));
  assert.ok(preloadOk('<video preload="metadata">', 5 * 1024 * 1024));
});

// ---- the scene demos: the clock shadow, the Reel and the endings
const $ = (sel) => document.querySelector(sel);
const near = (a, b, eps = 0.06) => Math.abs(a - b) < eps;
async function withClock(fn) {
  const real = Date.now;
  const clock = { t: 1_000_000 };
  Date.now = () => clock.t;
  try { await fn(clock); } finally { Date.now = real; }
}

test('19 the clock shadow follows the Turn Clock; Help steps it back, Spook forward, and at zero it is at the top', { skip }, () => withClock(async (clock) => {
  open();
  await load(); await tick(5);
  const scrub = $('#ft-scrub');
  assert.equal($('#ft-clock-text').textContent, 'Turn Clock 0:30');
  click(btn('Start turn'));
  clock.t += 15000; await tick(130);
  assert.equal($('#ft-clock-text').textContent, 'Turn Clock 0:15');
  assert.ok(near(scrub.currentTime, 0.5 * (4.2 - 0.06)), `half way: ${scrub.currentTime}`);
  click(btn('Help +10 s')); await tick(130);
  assert.equal($('#ft-clock-text').textContent, 'Turn Clock 0:25');
  assert.ok(near(scrub.currentTime, (1 - 25 / 30) * (4.2 - 0.06)), `after Help: ${scrub.currentTime}`);
  assert.match($('#ft-status').textContent, /Help/);
  click(btn('Spook −10 s')); click(btn('Spook −10 s')); await tick(130);
  assert.equal($('#ft-clock-text').textContent, 'Turn Clock 0:05');
  assert.ok(near(scrub.currentTime, (1 - 5 / 30) * (4.2 - 0.06)), `after two Spooks: ${scrub.currentTime}`);
  clock.t += 6000; await tick(130);
  assert.equal($('#ft-clock-text').textContent, 'Turn Clock 0:00');
  assert.ok(near(scrub.currentTime, 4.2 - 0.06), `at zero the shadow is at the top: ${scrub.currentTime}`);
  assert.match($('#ft-status').textContent, /ran out/);
  const at = scrub.currentTime;
  clock.t += 5000; await tick(130);
  assert.equal(scrub.currentTime, at, 'the clock stopped, so the shadow stays');
}));

test('19 pausing the clock stops the shadow, and resuming carries on from the same place', { skip }, () => withClock(async (clock) => {
  open();
  await load(); await tick(5);
  click(btn('Start turn'));
  clock.t += 10000; await tick(130);
  click(btn('Pause clock'));
  const frozen = $('#ft-scrub').currentTime;
  clock.t += 8000; await tick(130);
  assert.equal($('#ft-clock-text').textContent, 'Turn Clock 0:20');
  assert.equal($('#ft-scrub').currentTime, frozen);
  click(btn('Resume clock'));
  clock.t += 5000; await tick(130);
  assert.equal($('#ft-clock-text').textContent, 'Turn Clock 0:15');
}));

test('19.4 with footage off (reduced motion) the shadow moves once a second', { skip }, () => withClock(async (clock) => {
  open({ reduce: true });
  await load(); await tick(5);
  click(btn('Start turn'));
  clock.t += 14500; await tick(130); // 15.5 s left: the shadow stands where 16 s left puts it
  assert.ok(near($('#ft-scrub').currentTime, (1 - 16 / 30) * (4.2 - 0.06)), `${$('#ft-scrub').currentTime}`);
  clock.t += 400; await tick(130); // 15.1 s left: still the same step
  assert.ok(near($('#ft-scrub').currentTime, (1 - 16 / 30) * (4.2 - 0.06)));
  clock.t += 300; await tick(130); // 14.8 s left: the next step
  assert.ok(near($('#ft-scrub').currentTime, (1 - 15 / 30) * (4.2 - 0.06)));
}));

test('20 the Reel: each Haunt rise swaps the shot, says an Event in words, and the maximum is the house', { skip }, async () => {
  open();
  await load(); await tick(5);
  const reel = $('#ft-reel');
  const src = () => reel.querySelector('source[type="video/webm"]').getAttribute('src');
  assert.equal(src(), 'media/reel-ship.webm');
  assert.equal($('#ft-meter').children.length, 10);
  for (let i = 0; i < 3; i++) click(btn('Haunt +1'));
  assert.equal($('#ft-haunt-text').textContent, 'Haunt 3 of 10');
  assert.equal(src(), 'media/reel-coffin.webm');
  assert.equal(reel.querySelector('source[type="video/mp4"]').getAttribute('src'), 'media/reel-coffin.mp4');
  assert.equal(reel.getAttribute('poster'), 'media/reel-coffin.jpg');
  assert.equal(reel.__playing, true, 'the new shot plays');
  assert.match($('#ft-reel-text').textContent, /^Haunt Event\. /);
  const segs = [...$('#ft-meter').children];
  assert.equal(segs.filter((x) => x.classList.contains('is-on')).length, 3);
  assert.deepEqual(segs.map((x, i) => x.classList.contains('ui-seg--event') && i + 1), [false, false, 3, false, false, 6, false, false, 9, false]);
  assert.ok(segs[9].classList.contains('ui-seg--max'));
  for (let i = 0; i < 3; i++) click(btn('Haunt +1'));
  assert.equal(src(), 'media/reel-mirror.webm', 'the Haunt 6 Event is the mirror (Frankenstein, 1910), not the stair shadow');
  for (let i = 0; i < 4; i++) click(btn('Haunt +1'));
  assert.equal($('#ft-haunt-text').textContent, 'Haunt 10 of 10');
  assert.equal(src(), 'media/ai-lights-out-take1.webm');
  assert.match($('#ft-reel-text').textContent, /^The house wins\. /);
  click(btn('Haunt +1'));
  assert.equal($('#ft-haunt-text').textContent, 'Haunt 10 of 10', 'the Haunt stops at the maximum');
  click(btn('Max 8'));
  assert.equal($('#ft-haunt-text').textContent, 'Haunt 8 of 8', 'a lower maximum holds the level at the maximum');
  assert.equal($('#ft-meter').children.length, 8);
  assert.deepEqual([...document.querySelectorAll('[role="radio"][data-max]')].map((b) => b.getAttribute('aria-checked')), ['true', 'false', 'false']);
  for (let i = 0; i < 8; i++) click(btn('Haunt −1'));
  assert.equal($('#ft-haunt-text').textContent, 'Haunt 0 of 8');
  assert.equal(src(), 'media/reel-ship.webm');
});

test('20 with footage off the Reel still swaps the shot and says it in words, and plays nothing', { skip }, async () => {
  const { log } = open({ reduce: true });
  await load(); await tick(5);
  click(btn('Haunt +1')); click(btn('Haunt +1')); click(btn('Haunt +1'));
  assert.equal(log.filter(([a]) => a === 'play').length, 0);
  assert.equal($('#ft-reel').querySelector('source[type="video/webm"]').getAttribute('src'), 'media/reel-coffin.webm');
  assert.match($('#ft-reel-text').textContent, /Something rises/);
});

// Sounds wait for their moment in the shot, so these tests run setTimeout on a clock they move (the clips are not really played).
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }; // lets the promise of a play() settle
async function onClock(fn) {
  mock.timers.enable({ apis: ['setTimeout'] });
  try { await fn(async (ms) => { await flush(); mock.timers.tick(ms); await flush(); }); } finally { mock.timers.reset(); }
}
const rise = (n) => { for (let i = 0; i < n; i++) click(btn('Haunt +1')); };
const SETTLE = 12000; // long enough for any sound or line to have its moment (the latest is the knock at 9.0 s)

test('20.6 the scrape starts 3.1 seconds into its shot and the knock 9.0 seconds into its shot, not before', { skip }, async () => {
  const { heard } = open();
  await load(); await tick(5);
  await onClock(async (go) => {
    rise(3);
    await go(3099);
    assert.deepEqual(heard, [], 'not yet: 3099 ms');
    await go(1);
    assert.deepEqual(heard, ['media/scrape.m4a'], 'at 3.1 s the claw is on the rim');
    rise(4); // 4, 5, 6 and 7
    await go(8999);
    assert.equal(heard.length, 1, 'the knock waits for the first rap on the door');
    await go(1);
    assert.deepEqual(heard, ['media/scrape.m4a', 'media/knock.m4a']);
  });
});

test('20.6 the Reel scrapes at Haunt 3 and knocks at 7 and 8, once for each rise, and is silent at every other level', { skip }, async () => {
  const { heard } = open();
  await load(); await tick(5);
  await onClock(async (go) => {
    const rises = [];
    for (let i = 1; i <= 11; i++) { const before = heard.length; rise(1); await go(SETTLE); rises.push(heard.slice(before)); }
    const none = [];
    assert.deepEqual(rises, [none, none, ['media/scrape.m4a'], none, none, none, ['media/knock.m4a'], ['media/knock.m4a'], none, none, none], 'level 1 to 10, then a tap at the maximum');
  });
});

test('20.6 a step back never makes the sound, even onto a level that has one, and drops one that is waiting', { skip }, async () => {
  const { heard } = open();
  await load(); await tick(5);
  await onClock(async (go) => {
    rise(9); await go(SETTLE);
    heard.length = 0;
    for (let i = 0; i < 9; i++) { click(btn('Haunt −1')); await go(SETTLE); } // 8, 7 (knock levels) and 3 (the scrape level) on the way down
    assert.deepEqual(heard, []);
    rise(3); // the scrape is waiting for its moment...
    await go(1000);
    click(btn('Haunt −1')); // ...and the Reel steps back to the ship
    await go(SETTLE);
    assert.deepEqual(heard, [], 'the waiting scrape is dropped');
  });
});

test('20.6 a sound still waiting is dropped when the Reel moves on: the next level, a new maximum, or Sound switched off', { skip }, async () => {
  const { heard } = open();
  await load(); await tick(5);
  await onClock(async (go) => {
    rise(3); await go(1000); rise(1); await go(SETTLE); // Haunt 3 then 4: the street has no sound
    assert.deepEqual(heard, [], 'the scrape of level 3 never sounds over the street');
    rise(3); await go(SETTLE); // 5, 6, 7: the knock
    heard.length = 0;
    rise(1); await go(1000); rise(0); click(btn('Max 12')); await go(SETTLE); // 8 is waiting; a new maximum redraws the Reel
    assert.deepEqual(heard, [], 'a new maximum drops the waiting knock');
    rise(1); await go(2100); // 9 at max 12 is the bed: silent
    click(btn('Haunt −1')); click(btn('Haunt −1')); // back to 7
    heard.length = 0;
    rise(1); await go(500); // 8 again: knock waiting
    click($('#ft-sound')); // Sound off
    await go(SETTLE);
    assert.deepEqual(heard, [], 'Sound switched off while the knock waits: silence');
  });
});

test('20.6 a rise straight after the one to a sound, before its picture has started, drops that sound', { skip }, async () => {
  const { heard } = open();
  await load(); await tick(5);
  await onClock(async (go) => {
    rise(3); rise(1); // 3 and at once 4, in the same moment: the play() of level 3 has not settled yet
    await go(SETTLE);
    assert.deepEqual(heard, [], 'the scrape of level 3 never sounds over the street');
    rise(2); rise(1); // 5, 6 and at once 7: a knock for 7 only
    await go(SETTLE);
    assert.deepEqual(heard, ['media/knock.m4a']);
  });
});

test('20.6 two rises in a row to levels of the same shot sound once, from the later rise', { skip }, async () => {
  const { heard } = open();
  await load(); await tick(5);
  await onClock(async (go) => {
    rise(6); await go(SETTLE); // 6
    heard.length = 0;
    rise(1); await go(1000); // 7: the knock waits
    rise(1); // 8: a new turn starts its own wait
    await go(8999);
    assert.deepEqual(heard, [], 'the later rise waits its own 9.0 s: the earlier knock was dropped, not played at 8.0 s');
    await go(1);
    assert.deepEqual(heard, ['media/knock.m4a'], 'one knock, not two');
    await go(SETTLE);
    assert.equal(heard.length, 1);
  });
});

test('20.6 the words of a sound are always on screen: the scrape and the knock are said, other levels say no sound', { skip }, async () => {
  open();
  await load(); await tick(5);
  const text = () => $('#ft-reel-text').textContent;
  rise(3);
  assert.match(text(), /A claw scrapes the wooden rim\.$/);
  rise(1);
  assert.doesNotMatch(text(), /scrapes|knocks/);
  rise(3);
  assert.match(text(), /Someone knocks, slowly, at a door\.$/);
});

test('20.6 the Sound switch is on to begin with, silences both sounds when off, and the words stay', { skip }, async () => {
  const { heard } = open();
  await load(); await tick(5);
  const sw = $('#ft-sound');
  assert.equal(sw.getAttribute('role'), 'switch');
  assert.equal(sw.getAttribute('aria-checked'), 'true');
  assert.equal(sw.querySelector('.ui-switch-state').textContent, 'On');
  await onClock(async (go) => {
    click(sw);
    assert.equal(sw.getAttribute('aria-checked'), 'false');
    assert.equal(sw.querySelector('.ui-switch-state').textContent, 'Off');
    assert.equal($('#ft-status').textContent, 'Sound off.');
    rise(3); await go(SETTLE);
    assert.deepEqual(heard, [], 'with Sound off the scrape does not play');
    assert.match($('#ft-reel-text').textContent, /A claw scrapes the wooden rim\./, 'and its words are still there');
    assert.equal($('#ft-reel').querySelector('source[type="video/webm"]').getAttribute('src'), 'media/reel-coffin.webm', 'the shot still changes');
    click(sw);
    assert.equal($('#ft-status').textContent, 'Sound on.');
    rise(4); await go(SETTLE);
    assert.deepEqual(heard, ['media/knock.m4a'], 'switched on again, the next rise to a sound plays it');
  });
});

test('20.6 a still picture has no moment: with footage off the sound is at once, and Sound is what silences it', { skip }, async () => {
  const { heard, log } = open({ reduce: true });
  await load(); await tick(5);
  rise(3);
  assert.deepEqual(heard, ['media/scrape.m4a'], 'at once, with no wait');
  assert.equal(log.filter(([a, id]) => a === 'play' && id === 'ft-reel').length, 0, 'and the picture stays still');
});

test('20.6 a picture the browser blocked has no moment either: its sound is at once', { skip }, async () => {
  const { w, heard } = open();
  w.HTMLMediaElement.prototype.play = function () { return Promise.reject(new Error('blocked')); };
  await load(); await tick(5);
  await onClock(async () => {
    rise(3); await flush();
    assert.deepEqual(heard, ['media/scrape.m4a']);
    assert.match($('#ft-status').textContent, /blocked the clip/);
  });
});

test('20.6 a blocked sound, a missing Audio and a failed load change nothing: the words carry the shot', { skip }, async () => {
  const { audio, heard } = open();
  await load(); await tick(5);
  await onClock(async (go) => {
    audio.refuse = true;
    rise(3); await go(SETTLE); // a rejected play() must not surface as an error
    await flush();
    assert.deepEqual(heard, ['media/scrape.m4a'], 'it tried');
    assert.match($('#ft-reel-text').textContent, /scrapes/);
    assert.deepEqual(window.__errors, []);
    audio.broken = true;
    rise(4); await go(SETTLE); // the knock at 7, with no Audio at all
    assert.match($('#ft-reel-text').textContent, /knocks/);
    assert.equal($('#ft-haunt-text').textContent, 'Haunt 7 of 10', 'the page carried on');
    assert.deepEqual(window.__errors, []);
  });
});

test('21 the endings: a hero shot, then our own title card; the house card names who joined the haunting', { skip }, async () => {
  open();
  await load(); await tick(5);
  const end = $('#ft-end');
  assert.equal($('#ft-card').hidden, true);
  click(btn('The house wins')); await tick(5);
  assert.equal(end.querySelector('source[type="video/webm"]').getAttribute('src'), 'media/ai-lights-out-take1.webm');
  assert.equal(end.__playing, true);
  assert.equal($('#ft-card').hidden, true, 'the card waits for the shot to end');
  end.dispatchEvent(new window.Event('ended')); await tick(5);
  assert.equal($('#ft-card').hidden, false);
  assert.equal($('#ft-card-title').textContent, 'The haunting continues.');
  assert.equal($('#ft-card-lines').textContent, 'No one won. Mara and Joss joined the haunting.');
  assert.doesNotMatch(document.body.textContent, /poltergeist/i);
  click(btn('Detectives win')); await tick(5);
  assert.equal($('#ft-card').hidden, true, 'a new ending hides the old card');
  assert.equal(end.querySelector('source[type="video/webm"]').getAttribute('src'), 'media/ai-dawn-door-take3.webm');
  click(btn('Skip')); await tick(5);
  assert.equal(end.__playing, false, 'Skip stops the shot');
  assert.equal($('#ft-card-title').textContent, 'The night is over.');
  assert.equal($('#ft-card').hidden, false, 'Skip shows the card at once');
});

test('21 with footage off an ending shows its card at once and plays nothing', { skip }, async () => {
  const { log } = open({ reduce: true });
  await load(); await tick(5);
  click(btn('The house wins')); await tick(5);
  assert.equal($('#ft-card').hidden, false);
  assert.equal(log.filter(([a]) => a === 'play').length, 0);
});

test('21 every control of the scene demos is a real button with a name, and the pictures are hidden from a screen reader', { skip }, async () => {
  open();
  await load(); await tick(5);
  for (const id of ['ft-clock-start', 'ft-clock-help', 'ft-clock-spook', 'ft-clock-pause', 'ft-haunt-up', 'ft-haunt-down', 'ft-sound', 'ft-voice', 'ft-end-detectives', 'ft-end-house', 'ft-end-skip', 'ft-wander-find', 'ft-wander-stop']) {
    const b = $(`#${id}`);
    assert.equal(b.tagName, 'BUTTON', id);
    assert.ok(b.textContent.trim().length > 2, `${id} has a name`);
  }
  for (const f of document.querySelectorAll('.ft-film')) assert.equal(f.getAttribute('aria-hidden'), f.dataset.shape === 'square' ? null : 'true'); // the talking ghost's frame holds a video with controls, so it is not hidden
  assert.equal($('#ft-reel-text').getAttribute('role'), 'status');
});

test('Wander: Find plays the film from the start with the Whisper line and a Stop; the card comes at the end or on Stop', { skip }, async () => {
  open();
  await load(); await tick(5);
  const v = $('#ft-wander');
  assert.equal(v.getAttribute('preload'), 'metadata', 'a file over 1 MB loads only its metadata');
  assert.equal($('#ft-wander-stop').hidden, true);
  assert.equal($('#ft-wander-card').hidden, true);
  v.currentTime = 33;
  click(btn('Find the memory')); await tick(5);
  assert.equal(v.__playing, true);
  assert.equal(v.currentTime, 0, 'it starts from the beginning');
  assert.equal($('#ft-wander-whisper').hidden, false);
  assert.equal($('#ft-wander-whisper').textContent, 'Here. I have kept this a long time, and shown it to no one. Hold it gently. I have kept you a little while too, and I find I like it.');
  assert.equal($('#ft-wander-stop').hidden, false, 'a Stop shows while a scene over 5 seconds plays');
  assert.equal($('#ft-wander-card').hidden, true, 'the card waits for the film');
  v.dispatchEvent(new window.Event('ended')); await tick(5);
  assert.equal($('#ft-wander-card').hidden, false);
  assert.equal($('#ft-wander-card-title').textContent, 'A memory, found.');
  assert.match($('#ft-wander-card-lines').textContent, /watched for the sails/);
  assert.equal($('#ft-wander-stop').hidden, true);
  click(btn('Find the memory')); await tick(5);
  assert.equal($('#ft-wander-card').hidden, true, 'finding it again hides the old card');
  click(btn('Stop')); await tick(5);
  assert.equal(v.__playing, false, 'Stop stops the film');
  assert.equal($('#ft-wander-card').hidden, false, 'and shows the card at once');
});

test('Wander: with footage off the card shows at once, the film never plays, and the same words are there', { skip }, async () => {
  const { log } = open({ reduce: true });
  await load(); await tick(5);
  click(btn('Find the memory')); await tick(5);
  assert.equal(log.filter(([a]) => a === 'play').length, 0);
  assert.equal($('#ft-wander-card').hidden, false);
  assert.equal($('#ft-wander-stop').hidden, true);
  assert.match($('#ft-wander-whisper').textContent, /^Here\. I have kept this/);
});

// ---- 20.7 and 20.8: the line written for a shot's picture, on screen as words at its moment ----
const reelLineEl = () => $('#ft-reel-line');
const HAND = 'That is me, at the door.';
const BED = 'I sit on the edge of the bed';
const HOUSE = 'One window, then the next';
const SHIP = 'A ship comes in, and I know that ship.';
const CRATE = 'Something below is waking. It is not me.';
const STREET = 'The street is empty. I emptied it myself.';
const MIRROR = 'Look in the glass. There is someone in it.';

test('20.8 the line of the hand shot is hidden until its moment (0.8 s into the shot), then shows in its own live region', { skip }, async () => {
  open();
  await load(); await tick(5);
  assert.equal(reelLineEl().getAttribute('role'), 'status');
  assert.equal(reelLineEl().hidden, true, 'no line before the Reel has risen');
  await onClock(async (go) => {
    rise(7);
    await go(799);
    assert.equal(reelLineEl().hidden, true, 'not yet: 799 ms');
    await go(1);
    assert.equal(reelLineEl().hidden, false, 'at 0.8 s the line is on screen');
    assert.match(reelLineEl().textContent, new RegExp(`^${HAND}`));
    assert.equal(reelLineEl().dataset.speaker, 'whisper');
  });
});

test('20.7 the line is the shot\'s own, on every rise: the film shots too', { skip }, async () => {
  open();
  await load(); await tick(5);
  await onClock(async (go) => {
    const seen = [];
    for (let i = 1; i <= 10; i++) { rise(1); await go(SETTLE); seen.push(reelLineEl().hidden ? null : reelLineEl().textContent.slice(0, 24)); }
    assert.deepEqual(seen, [SHIP, SHIP, CRATE, STREET, STREET, MIRROR, HAND, HAND, BED, HOUSE].map((x) => x.slice(0, 24)), 'Haunt 1 to 10');
    assert.equal(reelLineEl().dataset.speaker, 'whisper');
  });
});

test('20.8 a line is said only on a rise, and a line still waiting is dropped when the Reel moves on', { skip }, async () => {
  open();
  await load(); await tick(5);
  await onClock(async (go) => {
    rise(9); await go(SETTLE); // the bed
    assert.equal(reelLineEl().hidden, false);
    click(btn('Haunt −1')); await go(SETTLE); // 8: the hand, by a step back
    assert.equal(reelLineEl().hidden, true, 'a step back clears the line and says none');
    rise(1); await go(300); // 9: the bed line is waiting for 0.5 s
    rise(1); await go(SETTLE); // 10: the house takes over before the bed line came
    assert.match(reelLineEl().textContent, new RegExp(`^${HOUSE}`), 'only the house line, from the later rise');
    click(btn('Haunt −1')); click(btn('Haunt −1')); // back to 8
    rise(1); await go(100); // 9 again: waiting
    click(btn('Max 12')); await go(SETTLE); // a new maximum redraws the Reel
    assert.equal(reelLineEl().hidden, true, 'a new maximum drops the waiting line');
  });
});

test('20.8 rises in the same moment, before the first picture has started, leave only the last shot\'s line', { skip }, async () => {
  open();
  await load(); await tick(5);
  await onClock(async (go) => {
    rise(9); // 7, 8 and 9 in one breath: the play() of the hand has not settled when the bed arrives
    await go(SETTLE);
    assert.match(reelLineEl().textContent, new RegExp(`^${BED}`), 'the bed line, and not the hand line of a rise that was already over');
    assert.equal(reelLineEl().textContent.includes(HAND), false);
  });
});

test('20.8 a still picture has no moment: with footage off the line shows at once, and the footage stays still', { skip }, async () => {
  const { log } = open({ reduce: true });
  await load(); await tick(5);
  rise(7);
  assert.equal(reelLineEl().hidden, false, 'at once, with no wait');
  assert.match(reelLineEl().textContent, new RegExp(`^${HAND}`));
  assert.equal(log.filter(([a, id]) => a === 'play' && id === 'ft-reel').length, 0);
});

test('20.8 a picture the browser blocked has no moment either: the line shows at once', { skip }, async () => {
  const { w } = open();
  w.HTMLMediaElement.prototype.play = function () { return Promise.reject(new Error('blocked')); };
  await load(); await tick(5);
  await onClock(async () => {
    rise(7); await flush();
    assert.equal(reelLineEl().hidden, false);
  });
});

test('21 the endings have their lines at their moments: the house at 1.2 s, the dawn at 4.3 s, and Skip drops one that is waiting', { skip }, async () => {
  open();
  await load(); await tick(5);
  const endLine = () => $('#ft-end-line');
  assert.equal(endLine().hidden, true);
  await onClock(async (go) => {
    click(btn('The house wins')); await flush();
    await go(1199);
    assert.equal(endLine().hidden, true, 'not yet');
    await go(1);
    assert.match(endLine().textContent, new RegExp(`^${HOUSE}`));
    assert.equal(endLine().dataset.speaker, 'whisper');
    click(btn('Detectives win')); await flush();
    assert.equal(endLine().hidden, true, 'a new ending clears the old line');
    await go(4299);
    assert.equal(endLine().hidden, true, 'the dawn line is not yet there at 4.299 s');
    await go(1);
    assert.match(endLine().textContent, /^Well done. The case is closed/);
    assert.equal(endLine().dataset.speaker, 'keeper');
    click(btn('The house wins')); await flush(); await go(500);
    click(btn('Skip')); await flush(); await go(SETTLE);
    assert.equal(endLine().hidden, true, 'Skip drops the line that was waiting');
    assert.equal($('#ft-card').hidden, false);
  });
});

test('21 with footage off an ending shows its line and its card at once', { skip }, async () => {
  open({ reduce: true });
  await load(); await tick(5);
  click(btn('Detectives win')); await tick(5);
  assert.equal($('#ft-end-line').hidden, false);
  assert.equal($('#ft-card').hidden, false);
  assert.equal($('#ft-end-line').dataset.speaker, 'keeper');
});

// ---- 23: the scenes of Wander, by kind of memory ----
const kindBtn = (k) => document.querySelector(`[role="radio"][data-kind="${k}"]`);
const wsrc = () => $('#ft-wander').querySelector('source[type="video/webm"]').getAttribute('src');
const CHIMES = 'Do you hear that? A row of small bells';
const CHAIR = 'The tea is still warm';
const says = (el, start) => assert.ok(el.textContent.startsWith(start), `${el.id} says "${el.textContent.slice(0, 40)}", expected it to start with "${start}"`);

test('23.1 Wander begins on the promise memory with the sealed envelope in its 4 by 3 frame, and its line', { skip }, async () => {
  open();
  await load(); await tick(5);
  assert.deepEqual([...document.querySelectorAll('[role="radio"][data-kind]')].map((b) => [b.dataset.kind, b.getAttribute('aria-checked')]), [['sound', 'false'], ['person', 'false'], ['promise', 'true']]);
  assert.equal(wsrc(), 'media/wander-envelope-take1.webm');
  assert.equal($('#ft-wander').closest('.ft-film').dataset.shape, 'landscape');
  assert.equal($('#ft-wander-line').getAttribute('role'), 'status');
  await onClock(async (go) => {
    click(btn('Find the memory')); await flush();
    await go(1999);
    assert.equal($('#ft-wander-line').hidden, true, 'not before its moment');
    await go(1);
    assert.match($('#ft-wander-line').textContent, /^A sealed envelope, and a pair of gloves/);
  });
});

test('23.1 choosing a kind swaps the scene and its frame, stops what played, and clears the old words', { skip }, async () => {
  open();
  await load(); await tick(5);
  const v = $('#ft-wander');
  click(btn('Find the memory')); await tick(5);
  assert.equal(v.__playing, true);
  click(kindBtn('sound')); await tick(5);
  assert.equal(v.__playing, false, 'a new kind stops the scene that was playing');
  assert.equal(wsrc(), 'media/wander-chimes-take1.webm');
  assert.equal(v.querySelector('source[type="video/mp4"]').getAttribute('src'), 'media/wander-chimes-take1.mp4');
  assert.equal(v.getAttribute('poster'), 'media/wander-chimes-take1.jpg');
  assert.equal(v.closest('.ft-film').dataset.shape, 'portrait', 'a 3 by 4 scene gets a portrait frame');
  assert.equal(kindBtn('sound').getAttribute('aria-checked'), 'true');
  assert.equal(kindBtn('promise').getAttribute('aria-checked'), 'false');
  assert.equal($('#ft-wander-whisper').hidden, true);
  assert.equal($('#ft-wander-card').hidden, true);
  assert.equal($('#ft-wander-stop').hidden, true);
  assert.match($('#ft-status').textContent, /A memory of a sound\./);
  click(kindBtn('person')); await tick(5);
  assert.equal(wsrc(), 'media/wander-chair-take1.webm');
  click(kindBtn('promise')); await tick(5);
  assert.equal(wsrc(), 'media/wander-envelope-take1.webm');
  assert.equal(v.closest('.ft-film').dataset.shape, 'landscape');
});

test('23.3 the line of a Wander scene is hidden until its moment: the chimes at 5.0 s, the chair at 1.5 s, in words only', { skip }, async () => {
  open();
  await load(); await tick(5);
  await onClock(async (go) => {
    click(kindBtn('sound')); click(btn('Find the memory')); await flush();
    assert.match($('#ft-status').textContent, /wind chimes/, 'the scene is said in words');
    assert.equal($('#ft-wander-whisper').hidden, false, 'the reveal line is first');
    await go(4999);
    assert.equal($('#ft-wander-line').hidden, true, 'not yet: 4999 ms');
    await go(1);
    says($('#ft-wander-line'), CHIMES);
    assert.equal($('#ft-wander-line').dataset.speaker, 'whisper');
    click(kindBtn('person')); click(btn('Find the memory')); await flush();
    assert.equal($('#ft-wander-line').hidden, true, 'a new Find clears the old line');
    await go(1499);
    assert.equal($('#ft-wander-line').hidden, true, 'not yet: 1499 ms');
    await go(1);
    says($('#ft-wander-line'), CHAIR);
  });
});

test('23.3 a line still waiting is dropped by Stop, by another kind, and by a new Find', { skip }, async () => {
  open();
  await load(); await tick(5);
  await onClock(async (go) => {
    click(kindBtn('sound')); click(btn('Find the memory')); await flush(); await go(2000);
    click(btn('Stop')); await flush(); await go(SETTLE);
    assert.equal($('#ft-wander-line').hidden, true, 'Stop drops the waiting line');
    assert.equal($('#ft-wander-card').hidden, false, 'and shows the card');
    click(btn('Find the memory')); await flush(); await go(2000);
    click(kindBtn('person')); await flush(); await go(SETTLE);
    assert.equal($('#ft-wander-line').hidden, true, 'another kind drops the waiting line');
    click(btn('Find the memory')); await flush(); await go(1000);
    click(btn('Find the memory')); await flush(); await go(1000); // the second Find restarts its own wait: 1.5 s from now
    assert.equal($('#ft-wander-line').hidden, true, 'the first Find\'s wait is gone');
    await go(500);
    assert.equal($('#ft-wander-line').hidden, false);
  });
});

test('23.3 a Find followed at once by Stop or another kind, before its picture has started, leaves no line', { skip }, async () => {
  open();
  await load(); await tick(5);
  await onClock(async (go) => {
    click(kindBtn('sound')); click(btn('Find the memory')); click(btn('Stop')); // the play() of the Find has not settled when Stop comes
    await flush(); await go(SETTLE);
    assert.equal($('#ft-wander-line').hidden, true, 'Stop in the same moment: no line');
    click(btn('Find the memory')); click(kindBtn('person')); // and a new kind in the same moment
    await flush(); await go(SETTLE);
    assert.equal($('#ft-wander-line').hidden, true, 'another kind in the same moment: no line');
  });
});

test('23.5 with footage off a Wander scene gives its line and its card at once; a blocked clip does the same', { skip }, async () => {
  { open({ reduce: true });
    await load(); await tick(5);
    click(kindBtn('person')); click(btn('Find the memory')); await tick(5);
    says($('#ft-wander-line'), CHAIR);
    assert.equal($('#ft-wander-card').hidden, false); }
  const { w } = open();
  w.HTMLMediaElement.prototype.play = function () { return Promise.reject(new Error('blocked')); };
  await load(); await tick(5);
  await onClock(async () => {
    click(kindBtn('sound')); click(btn('Find the memory')); await flush();
    says($('#ft-wander-line'), CHIMES);
    assert.equal($('#ft-wander-card').hidden, false);
  });
});


// ---- narration and the talking ghost (section 8)
test('22 the narration is said when a scene line comes, one voice at a time, and the Narration switch silences it', { skip }, async () => {
  const { voices } = open();
  await load(); await tick(5);
  await onClock(async (go) => {
    click(btn('Detectives win')); await flush();
    await go(4299);
    assert.deepEqual(voices, [], 'the dawn line is not said before its moment');
    await go(1);
    assert.deepEqual(voices, ['media/voice-scene.dawn-door.dry.1.mp3']);
    click(btn('The house wins')); await flush(); await go(1200);
    assert.deepEqual(voices, ['media/voice-scene.dawn-door.dry.1.mp3', 'media/voice-scene.lights-out.soft.1.mp3']);
    click($('#ft-voice')); await flush();
    assert.equal($('#ft-voice').getAttribute('aria-checked'), 'false');
    voices.length = 0;
    click(btn('Detectives win')); await flush(); await go(4300);
    assert.deepEqual(voices, [], 'Narration off: the words only');
    assert.match($('#ft-end-line').textContent, /^Well done/, 'the words are there either way');
  });
});

test('22 the talking ghost: one lip-synced video with its own controls, the line as words, and a picker over all 13 clips', { skip }, async () => {
  open();
  await load(); await tick(5);
  const video = $('#ft-lip');
  const pick = $('#ft-lip-pick');
  assert.equal(pick.options.length, 13);
  assert.equal(video.getAttribute('src'), 'media/lip-hero-whisper-meet.mp4');
  assert.match($('#ft-lip-text').textContent, /^Hello\. I was waiting/);
  pick.value = '6'; pick.dispatchEvent(new window.Event('change'));
  assert.equal(video.getAttribute('src'), 'media/lip-hero-ashby-closing.mp4');
  assert.match($('#ft-lip-who').textContent, /Mr\. Ashby/);
  assert.match($('#ft-lip-text').textContent, /^Well\. That is that/);
});

test('22 Wander: the Whisper says the reveal first, and the scene line waits until she has finished', { skip }, async () => {
  const { voices, played } = open();
  await load(); await tick(5);
  await onClock(async (go) => {
    click(btn('A person')); await flush();
    click(btn('Find the memory')); await flush();
    assert.deepEqual(voices, ['media/voice-reveal.soft.1.mp3'], 'the reveal at once');
    await go(5000);
    assert.match($('#ft-wander-line').textContent, /^The tea is still warm/, 'the words come on time');
    assert.deepEqual(voices, ['media/voice-reveal.soft.1.mp3'], 'the scene line is not said over the reveal');
    played[0].onended(); await flush();
    assert.deepEqual(voices, ['media/voice-reveal.soft.1.mp3', 'media/voice-wander.chair.soft.1.mp3'], 'it follows when she has finished');
  });
});

test('22 Wander: Stop and the Narration switch cut the reveal, and a queued line is dropped with it', { skip }, async () => {
  const { voices, played } = open();
  await load(); await tick(5);
  await onClock(async (go) => {
    click(btn('A person')); await flush();
    click(btn('Find the memory')); await flush();
    await go(5000);
    click(btn('Stop')); await flush();
    assert.equal(played[0].paused, true, 'the reveal is cut');
    played[0].onended?.(); await flush();
    assert.deepEqual(voices, ['media/voice-reveal.soft.1.mp3'], 'the queued scene line never sounds');
  });
});

test('19 the turn timer plays its 30 second clip while the clock runs (smooth, not a seek every tenth of a second), and holds it still when paused', { skip }, () => withClock(async (clock) => {
  const { log } = open();
  await load(); await tick(5);
  const scrub = $('#ft-scrub');
  assert.equal(scrub.querySelector('source[type="video/webm"]').getAttribute('src'), 'media/clock-shadow.webm');
  Object.defineProperty(scrub, 'paused', { get() { return !this.__playing; }, configurable: true });
  click(btn('Start turn'));
  clock.t += 3000; await tick(130);
  assert.ok(log.some(([op, id]) => op === 'play' && id === 'ft-scrub'), 'the clip plays');
  const plays = log.filter(([op, id]) => op === 'play' && id === 'ft-scrub').length;
  let seeks = 0;
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(scrub), 'currentTime') ?? Object.getOwnPropertyDescriptor(window.HTMLMediaElement.prototype, 'currentTime');
  Object.defineProperty(scrub, 'currentTime', { get() { return desc.get.call(this); }, set(v) { seeks += 1; desc.set.call(this, v); }, configurable: true });
  scrub.__t = (3 / 30) * (4.2 - 0.06); // the film is where the clock is
  clock.t += 100; await tick(130);
  scrub.__t = (3.1 / 30) * (4.2 - 0.06);
  clock.t += 100; await tick(130);
  assert.equal(seeks, 0, 'no seek while the film keeps time with the clock');
  assert.equal(log.filter(([op, id]) => op === 'play' && id === 'ft-scrub').length, plays, 'and no new play');
  click(btn('Pause clock')); await tick(130);
  assert.equal(scrub.__playing, false, 'paused clock, still film');
}));

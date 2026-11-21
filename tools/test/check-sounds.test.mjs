// The sound build check (party-mode Requirement 20.3): a file with no credit, over a size limit, in the wrong format, too long, too quiet
// or clipped fails; a stale credit row only warns. Real .m4a files are made with ffmpeg; the deep tests skip without it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AMBIENT_WEATHER, NAMES, SCENE_NAMES, checkSounds, readCredits } from '../check-sounds.mjs';
import { encode } from '../sounds/encode-sounds.mjs';

const repo = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const skip = !ffmpeg && 'ffmpeg not installed';
const sh = (args) => { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]); assert.equal(r.status, 0, String(r.stderr)); };

const ROW = (n) => `| \`${n}.m4a\` | "${n}", the Hauntology project | tools/sounds/make-sounds.py | CC0 1.0 | levelled and encoded |`;
const CREDITS = (names) => `# Sound credits\n\n| File | Title and author | Source (link) | Licence | Changes made |\n|---|---|---|---|---|\n${names.map(ROW).join('\n')}\n`;

/** A scratch folder holding a good file for each name (a levelled sine), and a credits file. */
function setup(names = NAMES, { seconds = 2 } = {}) {
  const root = mkdtempSync(resolve(tmpdir(), 'check-sounds-'));
  const dir = resolve(root, 'sounds');
  mkdirSync(dir);
  sh(['-f', 'lavfi', '-i', `sine=frequency=500:duration=${seconds}`, resolve(root, 'src.wav')]);
  for (const n of names) encode(resolve(root, 'src.wav'), resolve(dir, `${n}.m4a`));
  const credits = resolve(root, 'CREDITS.md');
  writeFileSync(credits, CREDITS(names));
  return { root, dir, credits, done: () => rmSync(root, { recursive: true, force: true }) };
}
const check = (s, extra = {}) => checkSounds({ dir: s.dir, credits: s.credits, ...extra });
const mentions = (r, re) => r.errors.some((e) => re.test(e));

test('the real sound files of the repo pass', () => {
  const r = checkSounds({ dir: resolve(repo, 'web/public/sounds'), credits: resolve(repo, 'docs/sounds/CREDITS.md') });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.files.filter((f) => !f.startsWith('ambient/')), [...NAMES, ...SCENE_NAMES].map((n) => `${n}.m4a`).sort(), 'the seven and the two of the footage scenes');
  assert.deepEqual(r.files.filter((f) => f.startsWith('ambient/')), AMBIENT_WEATHER.flatMap((w) => [`ambient/${w}-day.m4a`, `ambient/${w}-night.m4a`]).sort(), 'the twelve ambient loops of the conditions spec');
});

test('readCredits reads one row a file and ignores the header and the divider', () => {
  const rows = readCredits(CREDITS(['creak', 'bell']));
  assert.deepEqual([...rows.keys()], ['creak.m4a', 'bell.m4a']);
  assert.equal(rows.get('bell.m4a').length, 4);
});

test('seven good files with a credit each pass, with nothing to warn about', { skip }, () => {
  const s = setup();
  try { const r = check(s); assert.deepEqual(r.errors, []); assert.deepEqual(r.warnings, []); } finally { s.done(); }
});

test('a file with no row in the credits fails, and so does a row with an empty cell', { skip }, () => {
  const s = setup();
  try {
    writeFileSync(s.credits, CREDITS(NAMES.filter((n) => n !== 'creak')));
    assert.ok(mentions(check(s), /creak\.m4a: no row/));
    writeFileSync(s.credits, CREDITS(NAMES).replace('| CC0 1.0 |', '|  |'));
    assert.ok(mentions(check(s), /empty cell/));
  } finally { s.done(); }
});

test('a name that is not one of the nine, or not .m4a, fails; the two scene sounds are allowed', { skip }, () => {
  const s = setup(['creak']);
  try {
    copyFileSync(resolve(s.dir, 'creak.m4a'), resolve(s.dir, 'boom.m4a'));
    copyFileSync(resolve(s.dir, 'creak.m4a'), resolve(s.dir, 'bell.mp3'));
    copyFileSync(resolve(s.dir, 'creak.m4a'), resolve(s.dir, 'knock.m4a'));
    writeFileSync(s.credits, CREDITS(['creak', 'knock']));
    const r = check(s);
    assert.ok(mentions(r, /boom\.m4a: not one of the sound files/));
    assert.ok(mentions(r, /bell\.mp3: not one of the sound files/));
    assert.ok(!mentions(r, /^knock\.m4a:/), 'a knock is a sound of the footage scenes');
  } finally { s.done(); }
});

test('over the size of a file, or all together, fails', { skip }, () => {
  const s = setup(['creak', 'bell']);
  try {
    assert.ok(mentions(check(s, { limits: { perFile: 2000 } }), /creak\.m4a: \d+ bytes is over the limit of 2000/));
    assert.ok(mentions(check(s, { limits: { total: 5000 } }), /all files together are \d+ bytes, over the limit of 5000/));
    assert.deepEqual(check(s).errors, []);
  } finally { s.done(); }
});

test('not mono fails', { skip }, () => {
  const s = setup(['creak']);
  try {
    sh(['-i', resolve(s.root, 'src.wav'), '-ac', '2', '-c:a', 'aac', '-b:a', '64k', resolve(s.dir, 'creak.m4a')]);
    assert.ok(mentions(check(s), /creak\.m4a: 2 channels, not mono/));
  } finally { s.done(); }
});

test('too long fails: 3 seconds for a clip, 4 for the becoming', { skip }, () => {
  const s = setup(['creak', 'becoming'], { seconds: 3.6 });
  try {
    const r = check(s);
    assert.ok(mentions(r, /creak\.m4a: 3\.\d+ s is over the limit of 3 s/));
    assert.ok(!mentions(r, /becoming\.m4a/), 'the becoming may run to 4 seconds');
  } finally { s.done(); }
  const t = setup(['becoming'], { seconds: 4.6 });
  try { assert.ok(mentions(check(t), /becoming\.m4a: 4\.\d+ s is over the limit of 4 s/)); } finally { t.done(); }
});

test('far from -16 LUFS fails, and a clipped file fails', { skip }, () => {
  const s = setup(['creak', 'bell']);
  try {
    sh(['-i', resolve(s.dir, 'creak.m4a'), '-af', 'volume=-14dB', '-c:a', 'aac', '-b:a', '64k', resolve(s.root, 'quiet.m4a')]);
    copyFileSync(resolve(s.root, 'quiet.m4a'), resolve(s.dir, 'creak.m4a'));
    sh(['-i', resolve(s.dir, 'bell.m4a'), '-af', 'volume=14dB', '-c:a', 'aac', '-b:a', '64k', resolve(s.root, 'loud.m4a')]);
    copyFileSync(resolve(s.root, 'loud.m4a'), resolve(s.dir, 'bell.m4a'));
    const r = check(s);
    assert.ok(mentions(r, /creak\.m4a: -\d+(\.\d+)? LUFS is not about -16/));
    assert.ok(mentions(r, /bell\.m4a: peak .* dBFS clips/));
  } finally { s.done(); }
});

test('a credit row for a file that is not there only warns', { skip }, () => {
  const s = setup(['creak']);
  try {
    writeFileSync(s.credits, CREDITS(['creak', 'wind']));
    const r = check(s);
    assert.deepEqual(r.errors, []);
    assert.ok(r.warnings.some((w) => /wind\.m4a, which is not in/.test(w)));
  } finally { s.done(); }
});

test('the command exits 0 on good files and 1 on a bad one, and says what is wrong', { skip }, () => {
  const s = setup(['creak']);
  try {
    const run = () => spawnSync(process.execPath, [resolve(repo, 'tools/check-sounds.mjs'), s.dir, s.credits], { encoding: 'utf8' });
    const good = run();
    assert.equal(good.status, 0, good.stderr);
    assert.match(good.stdout, /OK: 1 sound file checked/);
    writeFileSync(s.credits, CREDITS([]));
    const bad = run();
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /error: creak\.m4a: no row/);
  } finally { s.done(); }
});

test('a missing credits file is an error, and a missing sounds folder is no files and no error', () => {
  const r = checkSounds({ dir: '/nonexistent-sounds-folder', credits: '/nonexistent/CREDITS.md' });
  assert.deepEqual(r.files, []);
  assert.ok(r.errors.some((e) => /CREDITS\.md does not exist/.test(e)));
  assert.equal(readFileSync(resolve(repo, 'docs/sounds/CREDITS.md'), 'utf8').includes('creak.m4a'), true);
});

// The ambient loops (conditions task 4.3): optional, in `<dir>/ambient/`, credited as `ambient/<name>.m4a`.
const AROW = (n) => `| \`ambient/${n}.m4a\` | "${n}", the Hauntology project | tools/sounds/make-ambient.py | CC0 1.0 | levelled and encoded |`;
function withAmbient(s, names, { seconds = 8 } = {}) {
  const amb = resolve(s.dir, 'ambient');
  mkdirSync(amb, { recursive: true });
  sh(['-f', 'lavfi', '-i', `sine=frequency=300:duration=${seconds}`, resolve(s.root, 'loop.wav')]);
  for (const n of names) encode(resolve(s.root, 'loop.wav'), resolve(amb, `${n}.m4a`));
  writeFileSync(s.credits, CREDITS(NAMES) + names.map(AROW).join('\n') + '\n');
}

test('no ambient folder is fine, and good loops with a credit each pass', { skip }, () => {
  const s = setup();
  try {
    assert.deepEqual(check(s).errors, []);
    withAmbient(s, ['rain-day', 'storm-night']);
    const r = check(s);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
    assert.deepEqual(r.files.filter((f) => f.startsWith('ambient/')), ['ambient/rain-day.m4a', 'ambient/storm-night.m4a']);
  } finally { s.done(); }
});

test('an ambient loop with no credit row, a wrong name, a clip-length or too-long file, or a thirteenth file fails', { skip }, () => {
  const s = setup();
  try {
    withAmbient(s, ['rain-day']);
    writeFileSync(s.credits, CREDITS(NAMES));
    assert.ok(mentions(check(s), /ambient\/rain-day\.m4a: no row/));
    withAmbient(s, ['rain-day', 'hail-day']);
    assert.ok(mentions(check(s), /ambient\/hail-day\.m4a: not one of/));
    withAmbient(s, ['fog-day'], { seconds: 2 });
    assert.ok(mentions(check(s), /not a loop length/));
    withAmbient(s, ['fog-day'], { seconds: 30 });
    assert.ok(mentions(check(s), /not a loop length|over the limit/));
  } finally { s.done(); }
});

test('a stale ambient credit row only warns, and the ambient files do not count against the clips\' total', { skip }, () => {
  const s = setup();
  try {
    withAmbient(s, ['snow-night']);
    writeFileSync(s.credits, CREDITS(NAMES) + AROW('snow-night') + '\n' + AROW('snow-day') + '\n');
    const r = check(s, { limits: { total: 350 * 1024 } });
    assert.deepEqual(r.errors, []);
    assert.ok(r.warnings.some((w) => /ambient\/snow-day\.m4a, which is not in/.test(w)));
  } finally { s.done(); }
});

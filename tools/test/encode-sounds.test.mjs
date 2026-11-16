// The levelling of sound clips (tools/sounds/encode-sounds.mjs): gain only for a steady clip, a soft-clip drive for a peaky one, padding for a
// clip too short to measure, and a safety re-encode when AAC would clip on decoding. Clips are made with ffmpeg; most tests skip without it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DRIVES_DB, MAX_PEAK_DB, MIN_LUFS, PRESETS, TARGET, encode, fileStats, meetsRules, predicted } from '../sounds/encode-sounds.mjs';

const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const skip = !ffmpeg && 'ffmpeg not installed';
const sh = (args) => { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };

function scratch() {
  const dir = mkdtempSync(resolve(tmpdir(), 'encode-sounds-'));
  const make = (name, lavfi, af) => { const out = resolve(dir, `${name}.wav`); sh(['-f', 'lavfi', '-i', lavfi, ...(af ? ['-af', af] : []), out]); return out; };
  return { dir, make, out: (n) => resolve(dir, `${n}.m4a`), done: () => rmSync(dir, { recursive: true, force: true }) };
}

test('predicted: gain only, never past the true peak ceiling, never louder than the target', () => {
  assert.equal(predicted({ I: -26, TP: -6 }), -21.5, 'the ceiling allows 4.5 dB, not the 10 wanted');
  assert.equal(predicted({ I: -20, TP: -3 }), -18.5);
  assert.equal(predicted({ I: -26, TP: -20 }), -16, 'plenty of room: it reaches the target');
  assert.equal(predicted({ I: -12, TP: -2 }), -16, 'too loud: it is brought down to the target');
  assert.equal(predicted({ I: TARGET.I, TP: TARGET.TP }), TARGET.I);
});

test('meetsRules: within 1.5 LU of -16 and not above the peak ceiling, each side on its own', () => {
  assert.equal(meetsRules({ lufs: -16, peak: -1 }), true);
  assert.equal(meetsRules({ lufs: -17.5, peak: -1 }), true);
  assert.equal(meetsRules({ lufs: -14.5, peak: -1 }), true);
  assert.equal(meetsRules({ lufs: -17.6, peak: -1 }), false, 'too quiet');
  assert.equal(meetsRules({ lufs: -14.4, peak: -1 }), false, 'too loud');
  assert.equal(meetsRules({ lufs: -16, peak: MAX_PEAK_DB }), true);
  assert.equal(meetsRules({ lufs: -16, peak: MAX_PEAK_DB + 0.1 }), false, 'clipping, whatever the loudness');
  assert.equal(meetsRules({ lufs: -16, peak: 0.2 }), false);
  assert.equal(meetsRules({ lufs: -16, peak: -3 }, -2), true, 'the ceiling can be given');
  assert.equal(meetsRules({ lufs: -16, peak: -1 }, -2), false);
});

test('the treatments go from the lightest to the heaviest: a limiter alone, then more drive into a soft clipper', () => {
  assert.equal(PRESETS.length, 1 + DRIVES_DB.length);
  assert.ok(!/volume|asoftclip/.test(PRESETS[0]), 'the first is a limiter alone, so a steady clip is left as it was');
  assert.deepEqual(DRIVES_DB, [...DRIVES_DB].sort((a, b) => a - b), 'each step drives harder');
  PRESETS.slice(1).forEach((p, i) => assert.match(p, new RegExp(`volume=${DRIVES_DB[i]}dB,asoftclip=type=tanh`)));
  assert.ok(MIN_LUFS > TARGET.I - 1.5 && MIN_LUFS < TARGET.I, 'a treatment is enough when it lands within the check\'s tolerance');
});

test('a steady clip takes the lightest treatment, lands on -16 LUFS and is not re-encoded', { skip }, () => {
  const s = scratch();
  try {
    const wav = s.make('steady', 'sine=frequency=500:duration=2.5');
    const r = encode(wav, s.out('steady'));
    assert.equal(r.preset, 0);
    assert.equal(r.safe, false);
    assert.equal(r.ok, true);
    assert.ok(Math.abs(r.lufs - TARGET.I) <= 0.3, `${r.lufs}`);
    assert.deepEqual(fileStats(s.out('steady')), { lufs: r.lufs, peak: r.peak }, 'what it reports is what the file measures');
  } finally { s.done(); }
});

test('a quiet steady clip is brought up by gain alone', { skip }, () => {
  const s = scratch();
  try {
    const wav = s.make('quiet', 'sine=frequency=500:duration=2.5', 'volume=-30dB');
    const r = encode(wav, s.out('quiet'));
    assert.equal(r.preset, 0);
    assert.ok(Math.abs(r.lufs - TARGET.I) <= 0.3, `${r.lufs}`);
  } finally { s.done(); }
});

test('a clip shorter than 400 ms is padded so it can be measured, and is levelled', { skip }, () => {
  const s = scratch();
  try {
    const wav = s.make('click', 'aevalsrc=0.9*sin(2*PI*900*t)*exp(-60*t):s=44100:d=0.2');
    const r = encode(wav, s.out('click'));
    assert.equal(r.padded, true);
    assert.ok(r.preset > 0, 'a lone click needs a drive');
    assert.equal(r.ok, true, JSON.stringify(r));
    const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', s.out('click')], { encoding: 'utf8' }).stdout);
    assert.ok(Math.abs(dur - 0.8) < 0.1, `padded to about 0.8 s, got ${dur}`);
  } finally { s.done(); }
});

test('a peaky clip never clips when decoded, and says so honestly when it cannot also reach -16', { skip }, () => {
  const s = scratch();
  try {
    const wav = s.make('pings', 'aevalsrc=0.9*sin(2*PI*600*t)*exp(-25*mod(t\\,0.7)):s=44100:d=2.8');
    const r = encode(wav, s.out('pings'));
    assert.ok(r.peak <= MAX_PEAK_DB, `peak ${r.peak}`);
    assert.equal(r.safe, true, 'AAC overshoots this one, so it was re-encoded');
    assert.equal(r.ok, Math.abs(r.lufs - TARGET.I) <= 1.5 && r.peak <= MAX_PEAK_DB, 'ok is exactly the two rules');
    assert.ok(statSync(s.out('pings')).size <= 50 * 1024, 'still under 50 KB for under 3 seconds');
  } finally { s.done(); }
});

test('the safety re-encode is bounded and keeps a usable file even when the ceiling cannot be met', { skip }, () => {
  const s = scratch();
  try {
    const wav = s.make('steady', 'sine=frequency=500:duration=2.5');
    const normal = encode(wav, s.out('normal'));
    const forced = encode(wav, s.out('forced'), { maxPeakDb: -60 });
    assert.equal(normal.safe, false);
    assert.equal(forced.safe, true);
    assert.ok(existsSync(s.out('forced')) && statSync(s.out('forced')).size > statSync(s.out('normal')).size, 'it used more bits');
    assert.equal(forced.ok, false, 'a ceiling nothing can meet is reported, not hidden');
  } finally { s.done(); }
});

test('a treatment that does not exist is refused', { skip }, () => {
  const s = scratch();
  try {
    const wav = s.make('steady', 'sine=frequency=500:duration=1');
    assert.throws(() => encode(wav, s.out('x'), { preset: 99 }), RangeError);
    assert.throws(() => encode(wav, s.out('x'), { preset: -1 }), RangeError);
    assert.equal(existsSync(s.out('x')), false);
  } finally { s.done(); }
});

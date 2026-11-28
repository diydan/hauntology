// Tests for tools/lib/reel.mjs and `tools/prerender-voice.mjs --reel`. A fake label voice replaces macOS `say`, so these run anywhere
// ffmpeg does. A reel never touches the Library files and never goes near the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { probeDuration, toolsAvailable } from '../lib/audio-check.mjs';
import { fileNameFor, resolveVoice } from '../lib/prerender-plan.mjs';
import { GAP_MS, buildReel, fmtTime, labelFor, planReel } from '../lib/reel.mjs';
import { makeMp3 } from './mp3-helper.mjs';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = JSON.parse(readFileSync(join(root, 'shared/fixtures/voice-library.json'), 'utf8'));
const cli = join(root, 'tools/prerender-voice.mjs');
const skip = !toolsAvailable() && 'ffmpeg or ffprobe is missing';
const MARK = resolveVoice('Mark', manifest);
const CHLOE = resolveVoice('Chloe', manifest);
const entriesOf = (voice) => manifest.entries.filter((e) => e.voice === voice);
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

/** A fake `say`: a half-second tone in a file, no macOS needed. */
const fakeSay = (text, dest) => {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=0.5', '-f', 'wav', dest]);
  return r.status === 0;
};
const noSay = () => false;
const volume = (path) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-i', path, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }); return Number(/max_volume:\s*(-?[\d.]+) dB/.exec(r.stderr)[1]); };

function lib(voice, { clipFor = (i) => makeMp3({ seconds: 1.5 + (i % 3) * 0.5 }) } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'reel-'));
  const entries = entriesOf(voice).map((e, i) => {
    const file = fileNameFor(e.key, 1);
    writeFileSync(join(dir, file), clipFor(i));
    return { key: e.key, file, spoken: e.spoken, sources: e.sources };
  });
  return { dir, entries, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test('labelFor says the line the way a person would', () => {
  assert.equal(labelFor('lodger.stall.1'), 'stall one');
  assert.equal(labelFor('lodger.confession.6'), 'confession six');
  assert.equal(labelFor('haunt.cold-spot.soft.2'), 'haunt cold spot two');
  assert.equal(labelFor('reveal.dry.14'), 'reveal fourteen');
  assert.equal(labelFor('turn-start.dry.30'), 'turn start 30');
  assert.equal(labelFor('meet.soft'), 'meet');
});

test('fmtTime is minutes and seconds', () => {
  assert.equal(fmtTime(0), '00:00');
  assert.equal(fmtTime(67_000), '01:07');
  assert.equal(fmtTime(59_999), '00:59');
});

test('planReel: one reel per voice in manifest order; not rendered and bad files are listed, not guessed at', () => {
  const state = (file) => (file === fileNameFor(entriesOf(MARK)[1].key, 1) ? 'bad' : file === fileNameFor(entriesOf(MARK)[2].key, 1) ? 'missing' : 'ok');
  const all = planReel({ manifest, voice: null, fileState: state });
  assert.equal(all.length, 8);
  assert.equal(all.find((r) => r.voice === 'inworld:Pippa').entries.length, 257);
  const mark = all.find((r) => r.voice === MARK);
  assert.equal(mark.entries.length, 9);
  assert.equal(mark.bad.length, 1);
  assert.equal(mark.missing.length, 1);
  assert.deepEqual(mark.entries.map((e) => e.sources[0]).slice(0, 2), ['lodger.stall.1', 'lodger.stall.4']);
  const one = planReel({ manifest, voice: CHLOE, fileState: () => 'ok' });
  assert.equal(one.length, 1);
  assert.equal(one[0].entries.length, 11);
});

test('buildReel with labels: one MP3 whose length is the intro, every label, every clip and the gaps; an index in time order', { skip }, async () => {
  const w = lib(MARK);
  try {
    const r = await buildReel({ voice: MARK, entries: w.entries, libDir: w.dir, outDir: w.dir, say: fakeSay });
    assert.equal(r.path, join(w.dir, 'reels', 'reel-mark.mp3'));
    const clips = w.entries.reduce((n, e) => n + probeDuration(join(w.dir, e.file)), 0);
    const expected = (500 + 2 * GAP_MS) + clips + w.entries.length * (500 + GAP_MS + 3 * GAP_MS);
    assert.ok(Math.abs(r.durationMs - expected) < 500, `reel ${r.durationMs} ms, expected about ${expected} ms`);
    assert.equal(r.labelled, true);
    assert.equal(r.index.length, 11);
    for (let i = 1; i < r.index.length; i += 1) assert.ok(r.index[i].startMs > r.index[i - 1].startMs);
    // each line starts after its own label and gap: first line at intro + label + gap
    assert.equal(r.index[0].startMs, 500 + 2 * GAP_MS + 500 + GAP_MS);
    const text = readFileSync(r.indexPath, 'utf8');
    assert.match(text, /^inworld:Mark: 11 lines, spoken labels/);
    assert.equal(text.split('\n').filter((l) => /^\d\d:\d\d  lodger\./.test(l)).length, 11);
    assert.ok(text.includes(w.entries[0].spoken));
  } finally { w.done(); }
});

test('buildReel without a label voice still works, with no labels and shorter gaps', { skip }, async () => {
  const w = lib(MARK);
  try {
    const r = await buildReel({ voice: MARK, entries: w.entries, libDir: w.dir, outDir: w.dir, say: noSay });
    assert.equal(r.labelled, false);
    const clips = w.entries.reduce((n, e) => n + probeDuration(join(w.dir, e.file)), 0);
    assert.ok(Math.abs(r.durationMs - (clips + w.entries.length * 3 * GAP_MS)) < 500);
    assert.match(readFileSync(r.indexPath, 'utf8'), /no spoken labels/);
    assert.equal(r.index[0].startMs, 0);
  } finally { w.done(); }
});

test('every clip is brought to the same loudness: a very quiet clip comes out far louder than it went in', { skip }, async () => {
  const quiet = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=2,volume=0.03', '-ac', '1', '-b:a', '64k', '-f', 'mp3', 'pipe:1'], { maxBuffer: 10 * 1024 * 1024 }).stdout;
  const w = lib(MARK, { clipFor: () => quiet });
  try {
    const before = volume(join(w.dir, w.entries[0].file));
    const r = await buildReel({ voice: MARK, entries: w.entries.slice(0, 1), libDir: w.dir, outDir: w.dir, say: noSay });
    const after = volume(r.path);
    assert.ok(before < -25, `source max ${before} dB`);
    assert.ok(after - before >= 10, `reel max ${after} dB vs source ${before} dB: not levelled`);
  } finally { w.done(); }
});

test('a reel never changes the Library files and is rebuilt on each run', { skip }, async () => {
  const w = lib(MARK);
  try {
    const before = w.entries.map((e) => sha(join(w.dir, e.file)));
    await buildReel({ voice: MARK, entries: w.entries, libDir: w.dir, outDir: w.dir, say: noSay });
    const first = sha(join(w.dir, 'reels', 'reel-mark.mp3'));
    await buildReel({ voice: MARK, entries: w.entries.slice(0, 3), libDir: w.dir, outDir: w.dir, say: noSay });
    assert.notEqual(sha(join(w.dir, 'reels', 'reel-mark.mp3')), first, 'the reel was replaced');
    assert.deepEqual(w.entries.map((e) => sha(join(w.dir, e.file))), before);
    assert.deepEqual(readdirSync(join(w.dir, 'reels')).sort(), ['reel-mark.index.txt', 'reel-mark.mp3']);
  } finally { w.done(); }
});

test('buildReel refuses an empty reel', async () => {
  await assert.rejects(buildReel({ voice: MARK, entries: [], libDir: '.', outDir: '.', say: noSay }), /no rendered files/);
});

// ---- the CLI ----
const runCli = async (args) => {
  try { const { stdout, stderr } = await exec('node', [cli, ...args]); return { status: 0, stdout, stderr }; } catch (e) { return { status: e.code, stdout: e.stdout, stderr: e.stderr }; }
};

test('CLI --reel: builds one reel per voice with --all, says what is not rendered yet, and writes only under reels/', { skip }, async () => {
  const w = lib(MARK);
  try {
    const chloe = entriesOf(CHLOE).slice(0, 4);
    chloe.forEach((e, i) => writeFileSync(join(w.dir, fileNameFor(e.key, 1)), makeMp3({ seconds: 1.2 + i * 0.2 })));
    const before = readdirSync(w.dir).sort();
    const r = await runCli(['--reel', '--all', '--no-labels', '--out', w.dir]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /inworld:Mark: 11 lines, 0\d:\d\d, no spoken labels/);
    assert.match(r.stdout, /inworld:Chloe: 4 lines/);
    assert.match(r.stdout, /not rendered yet: inworld:Chloe  lodger\.confession\.6/);
    assert.match(r.stdout, /inworld:Conrad: no rendered lines, no reel\./);
    assert.deepEqual(readdirSync(join(w.dir, 'reels')).sort(), ['reel-chloe.index.txt', 'reel-chloe.mp3', 'reel-mark.index.txt', 'reel-mark.mp3']);
    assert.deepEqual(readdirSync(w.dir).filter((n) => n !== 'reels').sort(), before.filter((n) => n !== 'reels'));
  } finally { w.done(); }
});

test('CLI --reel: a bad file is left out and fails the run, and nothing rendered is an error', { skip }, async () => {
  const w = lib(MARK);
  try {
    writeFileSync(join(w.dir, w.entries[2].file), 'junk');
    const r = await runCli(['--reel', '--voice', 'Mark', '--no-labels', '--out', w.dir]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /inworld:Mark: 10 lines/);
    assert.match(r.stderr, /bad file, left out: inworld:Mark  lodger\.stall\.3/);
    const empty = mkdtempSync(join(tmpdir(), 'reel-empty-'));
    try {
      const r2 = await runCli(['--reel', '--voice', 'Mark', '--out', empty]);
      assert.equal(r2.status, 1);
      assert.match(r2.stderr, /nothing rendered/);
    } finally { rmSync(empty, { recursive: true, force: true }); }
  } finally { w.done(); }
});

test('CLI --reel: the options are checked, each with its own message', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'reel-opts-'));
  try {
    const bad = [
      [['--reel'], /needs --voice/],
      [['--reel', '--voice', 'Mark', '--all'], /not both/],
      [['--reel', '--voice', 'Mark', '--upload'], /cannot be combined/],
      [['--reel', '--voice', 'Mark', '--render', '--budget-usd', '1'], /cannot be combined/],
      [['--reel', '--voice', 'Mark', '--takes', '2'], /take 1/],
      [['--no-labels', '--voice', 'Mark'], /only goes with --reel/],
      [['--all'], /only goes with --upload or --reel/],
      [['--reel', '--voice', 'Loretta'], /no voice called/],
    ];
    for (const [args, pattern] of bad) {
      const r = await runCli([...args, '--out', dir]);
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, pattern, args.join(' '));
    }
    assert.deepEqual(readdirSync(dir), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

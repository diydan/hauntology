// The blank-Place check (puzzles Requirement 22.3 and 22.10, Property 31): grey frames in, a verdict out, with a clip that has a mark and one that has none.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOOR, GRAIN_FACTOR, boxPixels, checkClip, checkFrames, edgeEnergy, grainEnergy, grainSigma, placeRecordProblems, writeLuma } from '../place-check.mjs';
import { PLACES } from '../js/places.js';
import { SHOTS } from '../js/scenes.js';

const here = dirname(fileURLToPath(import.meta.url));
const W = 160;
const H = 120;
const place = { corners: [[0.55, 0.25], [0.8, 0.25], [0.8, 0.45], [0.55, 0.45]], from: 0, to: 2, luma: 0.5 };

/** A tiny seeded generator, so the frames are the same on every run. */
const rng = (seed) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
/** A grey frame with a slow gradient and grain of `sigma`; `mark` paints dark bars (letters, in effect) in the Place. */
function frame(seed, sigma, mark = false) {
  const r = rng(seed);
  const f = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) f[y * W + x] = Math.max(0, Math.min(255, 110 + x * 0.1 + y * 0.05 + gauss(r) * sigma));
  if (mark) for (let k = 0; k < 4; k++) for (let y = 34; y < 52; y++) for (let x = 92 + k * 8; x < 96 + k * 8; x++) f[y * W + x] = 30;
  return f;
}
const clip = (n, sigma, mark) => Array.from({ length: n }, (_, i) => frame(i + 1, sigma, mark));

test('edge energy is the mean absolute gradient of a box, and zero for a flat one', () => {
  const flat = new Uint8Array(W * H).fill(100);
  assert.equal(edgeEnergy(flat, W, { x: 10, y: 10, w: 20, h: 20 }), 0);
  const step = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) step[y * W + x] = x < 20 ? 0 : 100;
  assert.ok(Math.abs(edgeEnergy(step, W, { x: 10, y: 10, w: 20, h: 20 }) - (100 / 2) / 20) < 1e-9); // one column of 20 changes by 100, the other axis by 0
  assert.equal(edgeEnergy(flat, W, { x: 0, y: 0, w: 0, h: 0 }), 0);
});

test('the grain estimate follows the noise and is not moved by hard edges', () => {
  for (const sigma of [2, 5, 9]) {
    const est = grainSigma(frame(3, sigma), W, H);
    assert.ok(Math.abs(est - sigma) < sigma * 0.25 + 0.3, `sigma ${sigma} read as ${est}`);
  }
  const clean = grainSigma(frame(4, 4), W, H);
  const edged = grainSigma(frame(4, 4, true), W, H);
  assert.ok(Math.abs(edged - clean) < 1, 'a mark in a few blocks does not change the quietest quarter');
  assert.ok(Math.abs(grainEnergy(5) - 5.64) < 1e-9);
});

test('22.3 a blank Place passes at every grain, and a Place with a mark fails at grains up to 6, in every frame of the window', () => {
  for (const sigma of [1, 3, 6]) {
    const blank = checkFrames(clip(12, sigma, false), W, H, place);
    assert.equal(blank.ok, true, `blank at grain ${sigma}: ${JSON.stringify(blank.worst)}`);
    assert.equal(checkFrames(clip(12, 9, false), W, H, place).ok, true, 'a blank Place at heavy grain still passes');
    const marked = checkFrames(clip(12, sigma, true), W, H, place);
    assert.equal(marked.ok, false, `marked at grain ${sigma}`);
    assert.ok(marked.frames.every((f) => f.marked), `every frame at grain ${sigma} shows the mark`);
    assert.ok(marked.worst && marked.worst.energy > marked.worst.limit);
  }
});

test('22.3 a mark in a single frame of the window fails the clip, and a mark outside the Place does not', () => {
  const frames = clip(12, 4, false);
  frames[7] = frame(8, 4, true);
  const r = checkFrames(frames, W, H, place);
  assert.equal(r.ok, false);
  assert.equal(r.worst.frame, 7);
  assert.deepEqual(r.frames.map((f) => f.marked).filter(Boolean).length, 1);
  const elsewhere = clip(6, 4, false).map((f, i) => { const g = frame(i + 1, 4, false); for (let y = 90; y < 108; y++) for (let x = 20; x < 24; x++) g[y * W + x] = 30; return g; });
  assert.equal(checkFrames(elsewhere, W, H, place).ok, true);
  assert.equal(checkFrames([], W, H, place).ok, false, 'no frames, no pass');
});

test('the threshold is pinned: a mark just under it passes and just over it fails (mutation guard)', () => {
  assert.equal(GRAIN_FACTOR, 1.6);
  assert.equal(FLOOR, 0.8);
  const frames = clip(4, 3, false);
  const base = checkFrames(frames, W, H, place);
  const worst = Math.max(...base.frames.map((f) => f.energy / (f.limit - FLOOR)));
  // a factor that is lower than the blank frames need must fail them, and one far above lets a mark through
  assert.equal(checkFrames(frames, W, H, place, { grainFactor: worst * 0.5, floor: 0 }).ok, false);
  assert.equal(checkFrames(clip(4, 3, true), W, H, place, { grainFactor: 50 }).ok, true);
  assert.equal(checkFrames(clip(4, 3, true), W, H, place, { grainFactor: GRAIN_FACTOR, floor: FLOOR }).ok, false);
});

test('the Place box is read in pixels and kept inside the picture; the brightness is the Place\'s own', () => {
  assert.deepEqual(boxPixels([[0.5, 0.5], [0.75, 0.5], [0.75, 0.75], [0.5, 0.75]], 400, 300), { x: 200, y: 150, w: 100, h: 75 });
  const b = boxPixels([[0.9, 0.9], [1, 0.9], [1, 1], [0.9, 1]], 400, 300);
  assert.ok(b.x + b.w <= 398 && b.y + b.h <= 298);
  const bright = checkFrames([new Uint8Array(W * H).fill(204)], W, H, place);
  assert.equal(bright.luma, 0.8);
});

test('writing the measured brightness changes only the luma of that shot', () => {
  const src = "export const PLACES = {\n  hand: { corners: [[1, 2]], surface: 'plate', luma: 0.71 },\n  bed: { corners: [[3, 4]], surface: 'pane', luma: 0.12 },\n};\n";
  const out = writeLuma(src, 'bed', 0.33);
  assert.match(out, /hand: \{[^\n]*luma: 0\.71/);
  assert.match(out, /bed: \{[^\n]*luma: 0\.33/);
  assert.throws(() => writeLuma(src, 'dawn', 0.5), /no Place line/);
});

// ------------------------------------------------------------------ real clips made by ffmpeg
const ff = spawnSync('ffmpeg', ['-version']);
const skip = ff.status !== 0 && 'ffmpeg not installed';
const base = 'color=c=0x808080:s=480x360:d=2:r=12,noise=alls=7:allf=t';
const bars = 'drawbox=x=300:y=100:w=6:h=34:color=black:t=fill,drawbox=x=320:y=100:w=30:h=5:color=black:t=fill,drawbox=x=320:y=118:w=30:h=5:color=black:t=fill,drawbox=x=320:y=136:w=30:h=5:color=black:t=fill';
const make = (dir, name, filter) => { const f = resolve(dir, `${name}.mp4`); const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', filter, '-pix_fmt', 'yuv420p', f]); assert.equal(r.status, 0, String(r.stderr)); return f; };
const clipPlace = { corners: [[0.62, 0.27], [0.79, 0.27], [0.79, 0.4], [0.62, 0.4]], from: 0, to: 2, luma: 0.5 };

test('22.3 a real grainy clip with nothing at the Place passes, and the same clip with a lettered mark fails', { skip }, () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'place-check-'));
  try {
    const blank = checkClip(make(dir, 'blank', base), clipPlace);
    assert.equal(blank.ok, true, JSON.stringify(blank.worst));
    assert.ok(blank.frames.length >= 10);
    assert.ok(Math.abs(blank.luma - 0.5) < 0.05, `brightness ${blank.luma}`);
    const marked = checkClip(make(dir, 'marked', `${base},${bars}`), clipPlace);
    assert.equal(marked.ok, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------------------------------------------ 15.6 Property 31
test('Property 31: every clip that has a Place has a record, and one made by a model names its model, take, date and prompt', () => {
  const prov = readFileSync(resolve(here, '../media/PROVENANCE.md'), 'utf8');
  for (const shot of Object.keys(PLACES)) assert.deepEqual(placeRecordProblems(SHOTS[shot], prov), [], shot);
  // the check can disagree: a clip with no entry, and a model clip with a row removed, are refused
  assert.ok(placeRecordProblems('nothing-here', prov).length);
  const from = prov.indexOf('#### ai-hand-door-take1');
  const inEntry = (re, to) => prov.slice(0, from) + prov.slice(from).replace(re, to);
  const stripped = inEntry(/^\| Model \|.*$/m, '| Model | |');
  assert.ok(placeRecordProblems('ai-hand-door-take1', stripped).some((p) => /model/.test(p)));
  assert.deepEqual(placeRecordProblems('ai-hand-door-take1', prov), []);
  assert.ok(placeRecordProblems('ai-hand-door-take1', inEntry(/\d{4}-\d{2}-\d{2}/g, 'some day')).some((p) => /date/.test(p)));
  assert.deepEqual(placeRecordProblems('stair-shadow', prov), [], 'a film clip needs only its entry');
  assert.ok(placeRecordProblems('ai-hand-door-take1', prov.replace(/exactly as submitted/g, 'as given')).some((p) => /prompt/.test(p)));
  assert.ok(placeRecordProblems('ai-hand-door-take1', inEntry(/\| Take \|[^\n]*/, '| Take | |')).some((p) => /take/.test(p)));
});

test('the command with no Place declared says so and passes (the root script check-places)', () => {
  const r = spawnSync('node', [resolve(here, '../place-check.mjs'), '--all'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /no shot has a Place/);
  const bad = spawnSync('node', [resolve(here, '../place-check.mjs'), 'unknown-shot'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
});

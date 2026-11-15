// The flash screen (Requirement 18.6): the counting on made-up brightness series, and the real clip through ffmpeg.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { LIMIT, maxFlashesPerSecond, readLumas } from '../flash-check.mjs';
import { root } from './helpers.js';

const FPS = 18;
const rep = (v, n) => Array(n).fill(v);

test('a steady picture, a cut and a slow fade are not flashes', () => {
  assert.equal(maxFlashesPerSecond(rep(120, 60), FPS), 0);
  assert.equal(maxFlashesPerSecond([...rep(10, 30), ...rep(240, 30)], FPS), 0, 'one change is a cut, not a flash');
  assert.equal(maxFlashesPerSecond(Array.from({ length: 72 }, (_, i) => (i * 255) / 71), FPS), 0, 'a fade has no opposing change');
});

test('one bright blink is one flash, and a strobe is many', () => {
  assert.equal(maxFlashesPerSecond([...rep(5, 20), ...rep(250, 3), ...rep(5, 20)], FPS), 1);
  const strobe = Array.from({ length: 54 }, (_, i) => (i % 2 ? 250 : 5)); // 9 flashes a second
  assert.ok(maxFlashesPerSecond(strobe, FPS) > LIMIT);
});

test('three flashes in a second pass and four fail', () => {
  const blink = (n) => Array.from({ length: n }, () => [...rep(5, 1), ...rep(250, 1)]).flat();
  assert.equal(maxFlashesPerSecond([...rep(5, 4), ...blink(3), ...rep(5, 4)], FPS), 3);
  assert.equal(maxFlashesPerSecond([...rep(5, 2), ...blink(4), ...rep(5, 2)], FPS), 4);
});

test('a flicker between two bright greys (darker side above 0.80) does not count', () => {
  const flicker = Array.from({ length: 54 }, (_, i) => (i % 2 ? 255 : 235));
  assert.equal(maxFlashesPerSecond(flicker, FPS), 0);
});

test('a small swing (under 0.1 of the maximum luminance) does not count, a middling one does', () => {
  const swing = (a, b) => Array.from({ length: 54 }, (_, i) => (i % 2 ? a : b));
  assert.equal(maxFlashesPerSecond(swing(100, 118), FPS), 0, 'about 0.06 of the maximum');
  assert.ok(maxFlashesPerSecond(swing(100, 160), FPS) > LIMIT, 'about 0.23 of the maximum');
});

test('flashes spread over more than a second are not counted together', () => {
  const blink = [...rep(5, 8), ...rep(250, 2)]; // one flash every 10 frames: 1.8 a second
  const series = [...Array(3).fill(blink).flat(), ...rep(5, 40), ...Array(3).fill(blink).flat()];
  assert.ok(maxFlashesPerSecond(series, FPS) <= 2);
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
test('every clip in media/ passes the screen', { skip: !hasFfmpeg && 'ffmpeg not installed' }, () => {
  const clips = readdirSync(resolve(root, 'media')).filter((n) => /\.mp4$/.test(n));
  assert.ok(clips.length >= 1);
  for (const c of clips) {
    const { lumas, fps } = readLumas(resolve(root, 'media', c));
    assert.ok(lumas.length > 10, `${c}: frames were read`);
    assert.ok(maxFlashesPerSecond(lumas, fps) <= LIMIT, c);
  }
});

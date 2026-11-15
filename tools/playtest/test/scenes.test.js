// The scene logic (Requirements 19 to 21 of .kiro/specs/puzzles): the clock shadow, the Reel and the endings. Pure functions, tested over
// their whole small domains (every Haunt level for every maximum, a grid of clock readings) and not by sample.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EVENT_LEVELS, SHOTS, SHOT_TEXT, endingCard, frameTime, isEventLevel, reelShot, shadowPosition, stepPosition } from '../js/scenes.js';
import { root } from './helpers.js';

const MAXES = [8, 10, 12];
const ORDER = ['ship', 'coffin', 'streets', 'stairs', 'hand', 'bed', 'house'];

test('20.1 the Reel for the default maximum: the film plays forward and each Event has a shot of its own', () => {
  const got = Array.from({ length: 11 }, (_, l) => reelShot(l, 10));
  assert.deepEqual(got, ['ship', 'ship', 'ship', 'coffin', 'streets', 'streets', 'stairs', 'hand', 'hand', 'bed', 'house']);
});

test('20.1 for every maximum the Reel never goes backwards, ends on the house at the maximum, and an Event always changes the picture', () => {
  for (const max of MAXES) {
    let prev = -1;
    for (let level = 0; level <= max; level++) {
      const shot = reelShot(level, max);
      assert.ok(shot in SHOTS, `${shot} is a shot`);
      const at = ORDER.indexOf(shot);
      assert.ok(at >= prev, `max ${max}, level ${level}: ${shot} does not come before the shot of level ${level - 1}`);
      if (isEventLevel(level, max)) assert.notEqual(shot, reelShot(level - 1, max), `max ${max}: the Event at ${level} changes the shot`);
      prev = at;
    }
    assert.equal(reelShot(max, max), 'house', `max ${max}: the maximum is the ending`);
    assert.notEqual(reelShot(max - 1, max), 'house', `max ${max}: one below the maximum is not yet the ending`);
  }
});

test('20.1 the Reel is total: any input gives a shot and a level past either end is held at that end', () => {
  for (const [level, max] of [[NaN, 10], [-5, 10], [99, 10], [3.7, 10], [undefined, undefined], [5, NaN], [5, 0], [5, -3], [Infinity, 10], [0, Infinity]]) {
    assert.ok(reelShot(level, max) in SHOTS, `reelShot(${level}, ${max})`);
  }
  assert.equal(reelShot(-5, 10), reelShot(0, 10));
  assert.equal(reelShot(99, 10), reelShot(10, 10));
});

test('20.2 an Event level is 3, 6 or 9 and below the maximum', () => {
  assert.deepEqual(EVENT_LEVELS, [3, 6, 9]);
  assert.deepEqual([...Array(13).keys()].filter((l) => isEventLevel(l, 10)), [3, 6, 9]);
  assert.deepEqual([...Array(9).keys()].filter((l) => isEventLevel(l, 8)), [3, 6]);
  assert.equal(isEventLevel(9, 9), false, 'at the maximum it is the ending, not an Event');
});

test('19.1 the clock shadow stands at the foot at the start of a Turn and at the top when the clock runs out', () => {
  assert.equal(shadowPosition(30000, 30000), 0);
  assert.equal(shadowPosition(30000, 0), 1);
  assert.equal(shadowPosition(30000, 15000), 0.5);
});

test('19.2 Help steps the shadow back and Spook steps it forward, by the share of the Turn that 10 seconds is', () => {
  for (const base of [30000, 45000, 60000, 90000]) {
    for (let remaining = 12000; remaining <= base - 12000; remaining += 3000) {
      const here = shadowPosition(base, remaining);
      assert.ok(shadowPosition(base, remaining + 10000) < here, `help at ${remaining} of ${base}`);
      assert.ok(shadowPosition(base, remaining - 10000) > here, `spook at ${remaining} of ${base}`);
      assert.ok(Math.abs(here - shadowPosition(base, remaining + 10000) - 10000 / base) < 1e-9, `help moves it by 10 s of ${base}`);
    }
  }
});

test('19.1 the shadow never leaves the stairs and only the clock moves it', () => {
  let prev = -1;
  for (let remaining = 40000; remaining >= -2000; remaining -= 250) {
    const p = shadowPosition(30000, remaining);
    assert.ok(p >= 0 && p <= 1, `${remaining}`);
    assert.ok(p >= prev, 'as the clock runs down the shadow only climbs');
    prev = p;
  }
  for (const bad of [[0, 5], [-1, 5], [NaN, 5], [30000, NaN], [30000, undefined]]) assert.equal(shadowPosition(...bad), 0, `${bad}`);
});

test('19.1 frameTime maps a position inside the clip, and the last frame can show', () => {
  assert.equal(frameTime(0, 4.2), 0);
  assert.ok(Math.abs(frameTime(1, 4.2) - 4.14) < 1e-9);
  assert.equal(frameTime(2, 4.2), frameTime(1, 4.2));
  assert.equal(frameTime(-1, 4.2), 0);
  assert.equal(frameTime(0.5, 0), 0);
  assert.equal(frameTime(0.5, NaN), 0);
});

test('19.4 under reduced motion the shadow moves once a second, never ahead of the clock, and still ends at the top', () => {
  const seen = new Set();
  for (let remaining = 30000; remaining >= 0; remaining -= 100) {
    const step = stepPosition(30000, remaining);
    seen.add(step);
    assert.ok(step <= shadowPosition(30000, remaining) + 1e-12, `${remaining}`);
  }
  assert.ok(seen.size <= 31, `at most 31 positions for 30 seconds, got ${seen.size}`);
  assert.equal(stepPosition(30000, 0), 1);
  assert.equal(stepPosition(30000, 30000), 0);
});

test('21.1 and 21.2 the endings: the shots, the words, and never the word Poltergeist', () => {
  const d = endingCard('detectives');
  assert.equal(d.shot, 'dawn');
  assert.ok(d.title && d.lines.length >= 1);
  const h = endingCard('house', ['Mara', 'Joss']);
  assert.equal(h.shot, 'house');
  assert.match(h.title, /haunting continues/i);
  assert.ok(h.lines.includes('No one won.'));
  assert.ok(h.lines.includes('Mara and Joss joined the haunting.'));
  for (const c of [d, h, endingCard('house'), endingCard('house', ['A', 'B', 'C']), endingCard('detectives', ['X'])]) {
    assert.doesNotMatch(JSON.stringify(c), /poltergeist/i);
  }
});

test('21.2 the names on the house card: none, one, two, three, and blanks left out', () => {
  assert.deepEqual(endingCard('house', []).lines, ['No one won.']);
  assert.deepEqual(endingCard('house', ['Mara']).lines, ['No one won.', 'Mara joined the haunting.']);
  assert.deepEqual(endingCard('house', ['A', 'B', 'C']).lines, ['No one won.', 'A, B and C joined the haunting.']);
  assert.deepEqual(endingCard('house', ['  ', '', 'Joss']).lines, ['No one won.', 'Joss joined the haunting.']);
  assert.deepEqual(endingCard('house', [null, 4, 'Pim']).lines, ['No one won.', 'Pim joined the haunting.']);
});

test('20.3 and 21.3 every shot has its three files, a line of words for the live region, and a record', () => {
  const prov = readFileSync(resolve(root, 'media', 'PROVENANCE.md'), 'utf8');
  for (const [name, file] of Object.entries(SHOTS)) {
    for (const ext of ['webm', 'mp4', 'jpg']) assert.ok(existsSync(resolve(root, 'media', `${file}.${ext}`)), `${file}.${ext}`);
    assert.ok(SHOT_TEXT[name] && SHOT_TEXT[name].length > 5, `${name} has its words`);
    assert.match(prov, new RegExp(`^## ${file}$`, 'm'), `${file} has an entry`);
  }
  assert.deepEqual(Object.keys(SHOT_TEXT).sort(), Object.keys(SHOTS).sort());
});

test('21.2 no player-facing string of the scenes says Poltergeist', () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '').replace(/[ \t]\/\/ .*$/gm, '');
  for (const f of ['js/scenes.js', 'js/scenes-page.js', 'footage.html']) assert.doesNotMatch(strip(readFileSync(resolve(root, f), 'utf8')), /poltergeist/i, f);
});

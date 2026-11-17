// The Secret knock lock's logic: the pattern a seed gives, how knocks are read, and when the door opens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, PLAY, READ, describe, isDone, judge, makePattern, playTimes, readKnocks } from '../js/secret-knock-core.js';

/** Knock times for groups, with a gap inside a group and a gap (or a long one at `long`) between groups. */
const knockTimes = (groups, { inGroup = 300, pause = 1000, long = null, longPause = 1800 } = {}) => {
  const out = [];
  let t = 0;
  groups.forEach((g, i) => {
    for (let k = 0; k < g; k++) { out.push(t); t += inGroup; }
    t += (long === i ? longPause : pause) - inGroup;
  });
  return out;
};

test('every seed on every level gives a valid pattern, the same one each time', () => {
  for (const level of LEVELS) for (let seed = 1; seed <= 300; seed++) {
    const p = makePattern(level, seed);
    assert.deepEqual(makePattern(level, seed), p, 'the same seed, the same knock');
    assert.equal(p.groups.length, level === 'easy' ? 2 : 3, `${level} ${seed}`);
    assert.ok(p.groups.every((g) => Number.isInteger(g) && g >= 1 && g <= 4), `${level} ${seed}: ${p.groups}`);
    assert.ok(p.groups.every((g, i) => i === 0 || g !== p.groups[i - 1]), `${level} ${seed}: no two equal groups side by side`);
    if (level === 'easy') assert.ok(p.groups[0] + p.groups[1] >= 4, `${seed}: at least four knocks`);
    if (level === 'hard') assert.ok(Number.isInteger(p.long) && p.long >= 0 && p.long < p.groups.length - 1);
    else assert.equal(p.long, null);
  }
  assert.equal(makePattern('nonsense', 3).level, 'easy');
});

test('the ghost plays the pattern so that it reads back as itself', () => {
  for (const level of LEVELS) for (let seed = 1; seed <= 100; seed++) {
    const p = makePattern(level, seed);
    const at = playTimes(p);
    assert.equal(at.length, p.groups.reduce((a, b) => a + b, 0));
    assert.equal(judge(p, at).ok, true, `${level} ${seed}: its own knock opens the door`);
  }
  assert.ok(PLAY.inGroup < READ.groupGapMs && PLAY.pause > READ.groupGapMs && PLAY.pause < READ.longMs && PLAY.longPause >= READ.longMs);
});

test('knocks are read into groups by the pauses between them', () => {
  assert.deepEqual(readKnocks([]), { groups: [], pauses: [] });
  assert.deepEqual(readKnocks(knockTimes([3, 2])), { groups: [3, 2], pauses: [1000] });
  assert.deepEqual(readKnocks([500, 0, 250]).groups, [3], 'out of order times are sorted');
});

test('the door opens only to the right groups, and on hard only with the long pause in its place', () => {
  const easy = { level: 'easy', groups: [3, 2], long: null };
  assert.equal(judge(easy, knockTimes([3, 2])).ok, true);
  assert.deepEqual(judge(easy, knockTimes([2, 3])).reason, 'groups');
  assert.deepEqual(judge(easy, knockTimes([3, 2, 1])).reason, 'groups');
  assert.deepEqual(judge(easy, knockTimes([5])).reason, 'groups');
  assert.deepEqual(judge(easy, []).reason, 'none');
  assert.equal(judge(easy, knockTimes([3, 2], { long: 0 })).ok, true, 'below hard a long pause is fine');
  const hard = { level: 'hard', groups: [2, 1, 3], long: 1 };
  assert.equal(judge(hard, knockTimes([2, 1, 3], { long: 1 })).ok, true);
  assert.equal(judge(hard, knockTimes([2, 1, 3])).reason, 'pause', 'no long pause');
  assert.equal(judge(hard, knockTimes([2, 1, 3], { long: 0 })).reason, 'pause', 'the long pause in the wrong place');
});

test('an attempt ends after a quiet spell, never before the first knock', () => {
  assert.equal(isDone([], 99999), false);
  assert.equal(isDone([1000], 1000 + READ.quietMs - 1), false);
  assert.equal(isDone([1000], 1000 + READ.quietMs), true);
});

test('the clue says the knock in words and marks, with no digit in the marks', () => {
  const d = describe({ level: 'hard', groups: [2, 1, 3], long: 1 });
  assert.equal(d.words, '2, pause, 1, long pause, 3');
  assert.doesNotMatch(d.marks, /\d/);
  assert.equal((d.marks.match(/●/g) || []).length, 6);
});

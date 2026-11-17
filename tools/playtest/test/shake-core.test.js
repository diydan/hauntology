// Shared actions and Shake: how many Players an action needs, how a shake is read, and what a phone feels by where it is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, CHAIR_STEPS, INITIAL_STATE, REACH, SHAKE, WINDOW_MS, applyAction, cleanState, feel, makeShakeDetector, makeTogether } from '../js/shake-core.js';

test('a one-Player action fires at once; a two-Player action waits for a second Player', () => {
  assert.equal(makeTogether('knock').add('a', 0).fired, true);
  const t = makeTogether('chair');
  assert.deepEqual(t.add('a', 0), { fired: false, count: 1, need: 2, who: ['a'] });
  const r = t.add('b', 500);
  assert.equal(r.fired, true);
  assert.deepEqual(r.who, ['a', 'b']);
});

test('the same Player twice is still one Player', () => {
  const t = makeTogether('chair');
  for (let i = 0; i < 5; i++) assert.equal(t.add('a', i * 100).fired, false);
});

test('acts further apart than the window do not count together, and the count starts again after it fires', () => {
  const t = makeTogether('wind');
  t.add('a', 0);
  assert.equal(t.add('b', WINDOW_MS + 1).fired, false, 'a is too old');
  assert.equal(t.add('a', WINDOW_MS + 2).fired, true, 'b and a are inside one window');
  assert.equal(t.add('a', WINDOW_MS + 3).fired, false, 'it started again');
});

test('the big door needs three; an unknown action never fires', () => {
  const t = makeTogether('bigDoor');
  assert.equal(t.add('a', 0).fired, false);
  assert.equal(t.add('b', 10).fired, false);
  assert.equal(t.add('c', 20).fired, true);
  assert.equal(makeTogether('nothing').add('a', 0).fired, false);
  assert.ok(Object.values(ACTIONS).every((a) => Number.isInteger(a.need) && a.need >= 1 && a.need <= 3));
});

test('three hard jolts inside a second are a shake; one bump or slow jolts are not; it then rests', () => {
  const d = makeShakeDetector();
  assert.equal(d.motion(0, SHAKE.min + 1), false);
  assert.equal(d.motion(100, SHAKE.min - 1), false, 'too soft');
  assert.equal(d.motion(200, SHAKE.min + 1), false);
  assert.equal(d.motion(300, SHAKE.min + 1), true);
  assert.equal(d.motion(400, 20), false, 'resting');
  const slow = makeShakeDetector();
  for (const t of [0, 800, 1600, 2400, 3200]) assert.equal(slow.motion(t, 20), false, 'too slow');
});

test('near and facing it is strong with a buzz; far is soft with no buzz; out of reach is nothing', () => {
  const src = { x: 0, y: 0 };
  const near = feel(src, { x: 2, y: 0, facing: 180 });
  assert.deepEqual([near.level, near.buzz, near.picture, near.sound], ['strong', true, true, 1]);
  const far = feel(src, { x: 5, y: 0, facing: 180 });
  assert.deepEqual([far.level, far.buzz, far.picture], ['soft', false, true]);
  assert.equal(feel(src, { x: REACH.far + 0.1, y: 0, facing: 180 }).level, 'none');
});

test('a phone facing away from the source gets only a faint sound, near or far', () => {
  for (const x of [1, 5]) {
    const f = feel({ x: 0, y: 0 }, { x, y: 0, facing: 0 }); // looking east, the source is behind (west)
    assert.deepEqual([f.level, f.buzz, f.picture, f.sound], ['faint', false, false, 0.2]);
  }
});

test('the facing wraps round: 540 degrees is 180', () => {
  assert.equal(feel({ x: 0, y: 0 }, { x: 1, y: 0, facing: 540 }).level, 'strong');
  assert.equal(feel({ x: 0, y: 0 }, { x: 1, y: 0, facing: -180 }).level, 'strong');
});

test('the big door swings open and shut, the chair moves a step each time and comes back; knock and wind leave nothing', () => {
  let st = INITIAL_STATE;
  st = applyAction(st, 'bigDoor'); assert.equal(st.bigDoor, 'open');
  st = applyAction(st, 'bigDoor'); assert.equal(st.bigDoor, 'shut');
  const seen = [];
  for (let i = 0; i < CHAIR_STEPS; i++) { st = applyAction(st, 'chair'); seen.push(st.chair); }
  assert.deepEqual(seen, [1, 2, 3, 0]);
  assert.deepEqual(applyAction(st, 'knock'), st);
  assert.deepEqual(applyAction(st, 'wind'), st);
  assert.deepEqual(applyAction(INITIAL_STATE, 'chair'), { bigDoor: 'shut', chair: 1 }, 'the first state is not changed');
  assert.deepEqual(INITIAL_STATE, { bigDoor: 'shut', chair: 0 });
});

test('a stored state is cleaned: anything unexpected falls back to the start', () => {
  assert.deepEqual(cleanState(undefined), INITIAL_STATE);
  assert.deepEqual(cleanState({ bigDoor: 'open', chair: 2, extra: '<script>' }), { bigDoor: 'open', chair: 2 });
  assert.deepEqual(cleanState({ bigDoor: 'ajar', chair: 99 }), INITIAL_STATE);
  assert.deepEqual(cleanState({ chair: '2' }), INITIAL_STATE);
});

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

test('feel: the reach and the facing are pinned at their edges, and a far phone hears at half volume', () => {
  const src = { x: 5, y: 5 };
  const at = (m, facing = 0) => ({ x: 5 + m, y: 5, facing }); // m metres east of the source
  // a phone east of the source looks at it when it faces west (180)
  assert.equal(feel(src, at(REACH.near, 180)).level, 'strong', 'exactly near is still strong');
  assert.equal(feel(src, at(REACH.near + 0.01, 180)).level, 'soft');
  assert.equal(feel(src, at(REACH.far, 180)).level, 'soft', 'exactly far is still soft');
  assert.equal(feel(src, at(REACH.far + 0.01, 180)).level, 'none');
  // facing: 100 degrees off is still in view, 101 is not, and straight away is faint
  assert.equal(feel(src, at(3, 180 - 100)).level, 'soft');
  assert.equal(feel(src, at(3, 180 - 101)).level, 'faint');
  assert.equal(feel(src, at(3, 180 - 135)).level, 'faint');
  assert.equal(feel(src, at(3, 0)).level, 'faint');
  // what each level gives
  assert.deepEqual(pick(feel(src, at(1, 180))), { level: 'strong', buzz: true, picture: true, sound: 1 });
  assert.deepEqual(pick(feel(src, at(4, 180))), { level: 'soft', buzz: false, picture: true, sound: 0.5 });
  assert.deepEqual(pick(feel(src, at(3, 0))), { level: 'faint', buzz: false, picture: false, sound: 0.2 });
});
const pick = ({ level, buzz, picture, sound }) => ({ level, buzz, picture, sound });

// ---- facing from the phone's own orientation (Requirement 25.6)
import { bearingOnPlan, headingOf, makeFacing, makeFacingReporter, turnBetween, cleanPos, SPOTS } from '../js/shake-core.js';

test('a heading comes from the iPhone compass, else from alpha turned the other way, else nothing', () => {
  assert.equal(headingOf({ webkitCompassHeading: 90, alpha: 10 }), 90);
  assert.equal(headingOf({ alpha: 90 }), 270);
  assert.equal(headingOf({ alpha: 0 }), 0);
  assert.equal(headingOf({ alpha: 360 }), 0);
  for (const bad of [null, undefined, {}, { alpha: null }, { alpha: NaN }, { webkitCompassHeading: Infinity }, { alpha: '5' }]) assert.equal(headingOf(bad), null);
});

test('the turn between two headings goes the short way round', () => {
  assert.equal(turnBetween(350, 10), 20);
  assert.equal(turnBetween(10, 350), -20);
  assert.equal(turnBetween(0, 180), 180);
  assert.equal(turnBetween(90, 90), 0);
});

test('the way from one place to another on the plan: 0 is east and 90 is south', () => {
  assert.equal(bearingOnPlan({ x: 5, y: 5 }, { x: 9, y: 5 }), 0);
  assert.equal(bearingOnPlan({ x: 5, y: 5 }, { x: 5, y: 9 }), 90);
  assert.equal(bearingOnPlan({ x: 5, y: 5 }, { x: 1, y: 5 }), 180);
  assert.equal(bearingOnPlan({ x: 5, y: 5 }, { x: 5, y: 1 }), 270);
});

test('before Set there is no facing; after facing the door and Set, a turn of the phone is the same turn on the plan', () => {
  const f = makeFacing({ smoothing: 1 });
  assert.equal(f.calibrated, false);
  assert.equal(f.facing(40), null);
  const door = bearingOnPlan({ x: 3, y: 7 }, SPOTS.knock); // the phone is at (3, 7) and faces the door
  assert.equal(f.set(200, door), true);
  assert.equal(f.calibrated, true);
  assert.equal(f.facing(200), Math.round(door));
  assert.equal(f.facing(290), Math.round((door + 90) % 360), 'a quarter turn clockwise is a quarter turn on the plan');
  assert.equal(f.facing(110), Math.round((door + 270) % 360));
});

test('a bad Set changes nothing, and clear forgets it', () => {
  const f = makeFacing({ smoothing: 1 });
  assert.equal(f.set(NaN, 10), false);
  assert.equal(f.set(10, undefined), false);
  assert.equal(f.calibrated, false);
  f.set(0, 0);
  f.clear();
  assert.equal(f.facing(5), null);
});

test('readings are smoothed along the short way, so 359 to 1 never swings through 180', () => {
  const f = makeFacing({ smoothing: 0.5 });
  f.set(0, 0);
  assert.equal(f.facing(350), 350);
  const next = f.facing(10); // halfway between 350 and 10 is 0, not 180
  assert.ok(next === 0 || next === 359 || next === 1, `got ${next}`);
  for (let i = 0; i < 30; i++) f.facing(10);
  assert.equal(f.facing(10), 10);
});

test('a facing is sent only when it has turned enough and enough time has passed', () => {
  const r = makeFacingReporter();
  assert.equal(r.shouldSend(100, 0), true, 'the first one goes');
  assert.equal(r.shouldSend(180, 100), false, 'too soon');
  assert.equal(r.shouldSend(105, 1000), false, 'turned too little');
  assert.equal(r.shouldSend(180, 1000), true);
  assert.equal(r.shouldSend(185, 2000), false);
  assert.equal(r.shouldSend(NaN, 5000), false);
  r.reset();
  assert.equal(r.shouldSend(185, 5001), true);
});

test('a facing that comes out of the calibration is one the room accepts', () => {
  const f = makeFacing({ smoothing: 1 });
  f.set(123, 45);
  for (const heading of [0, 1, 90, 180, 270, 359]) {
    const facing = f.facing(heading);
    assert.ok(Number.isInteger(facing) && facing >= 0 && facing < 360);
    assert.deepEqual(cleanPos({ x: 3, y: 4, facing }), { x: 3, y: 4, facing });
  }
});

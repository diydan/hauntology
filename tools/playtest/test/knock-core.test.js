import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDetector, jolt } from '../js/knock-core.js';

test('both: a jolt and a click close together make one knock; either alone makes none', () => {
  const d = makeDetector({ mode: 'both' });
  assert.equal(d.motion(1000, 5), null);
  assert.ok(d.mic(1050, 0.6, 0.05));
  assert.equal(d.knocks.length, 1);
  assert.equal(d.mic(3000, 0.6, 0.05), null); // a click with no jolt (a cup on another table)
  assert.equal(d.motion(5000, 5), null);       // a jolt with no click (a slow bump)
  assert.equal(d.knocks.length, 1);
});

test('talking is not a knock: loud but not a sharp rise over the recent average', () => {
  const d = makeDetector({ mode: 'mic' });
  assert.equal(d.mic(100, 0.5, 0.3), null);
  assert.ok(d.mic(900, 0.5, 0.05));
});

test('one knock never counts twice, and knocks group by the gap', () => {
  const d = makeDetector({ mode: 'motion' });
  d.motion(0, 4); d.motion(60, 4); // one knock (debounce)
  d.motion(400, 4);                // second knock of the group
  assert.equal(d.flush(900), 0);   // only 500 ms of quiet: still open
  assert.equal(d.flush(1200), 2);  // "two knocks"
  d.motion(3000, 4);
  assert.equal(d.flush(4000), 1);  // "one knock"
  assert.deepEqual(d.groups, [2, 1]);
});

test('jolt is the size of the change between readings', () => {
  assert.equal(jolt({ x: 0, y: 0, z: 9.8 }, { x: 3, y: 4, z: 9.8 }), 5);
  assert.equal(jolt(null, { x: 1 }), 0);
});

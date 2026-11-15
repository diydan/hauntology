// Marks made by dragging a character onto a room: which room, where each character stands, and what a drop does. Pure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { roomAtPoint, lineupPos, slotPos, applyDrop } from '../js/ar-marks.js';

const W = 0.115, D = 0.095;

test('every room is found from its middle, and a point off the board is no room', () => {
  for (let c = 0; c < 3; c++) for (let r = 0; r < 2; r++) {
    const x = (c - 1) * W, z = (r - 0.5) * D;
    assert.deepEqual(roomAtPoint(x, z, W, D), { c, r }, `room ${c},${r}`);
    for (const [dx, dz] of [[0.4, 0.4], [-0.4, 0.4], [0.4, -0.4], [-0.4, -0.4]]) {
      const p = roomAtPoint(x + dx * W, z + dz * D, W, D); assert.deepEqual(p, { c, r }, 'still the same room near a corner');
    }
  }
  for (const [x, z] of [[0, D + 0.01], [0, -D - 0.01], [1.5 * W + 0.01, 0], [-1.5 * W - 0.01, 0], [NaN, 0], [0, Infinity], [0, 0.14]]) assert.equal(roomAtPoint(x, z, W, D), null, `${x},${z}`);
});

test('the line-up is centred, evenly spaced and in front of the board', () => {
  const xs = [0, 1, 2, 3, 4, 5].map((i) => lineupPos(i, 6, 0.062, 0.14));
  assert.ok(Math.abs(xs[0].x + xs[5].x) < 1e-12, 'centred');
  for (let i = 1; i < 6; i++) assert.ok(Math.abs(xs[i].x - xs[i - 1].x - 0.062) < 1e-12);
  assert.ok(xs.every((p) => p.z > D + 0.017), 'in front of the slab');
  assert.ok(Math.abs(xs[5].x) < 1.5 * W, 'no wider than the board');
});

test('six characters in one room get six different places, all inside that room', () => {
  const seen = new Set();
  for (let k = 0; k < 6; k++) {
    const s = slotPos(k, W, D); seen.add(`${s.x.toFixed(4)},${s.z.toFixed(4)}`);
    assert.ok(Math.abs(s.x) < W / 2 && Math.abs(s.z) < D / 2, `slot ${k} inside`);
  }
  assert.equal(seen.size, 6);
});

test('a drop on a room marks it, a drop elsewhere takes the mark back, and the old object is not changed', () => {
  const a = {}, b = applyDrop(a, 'cora', 'kitchen'), c = applyDrop(b, 'cora', 'hall'), d = applyDrop(c, 'cora', null), e = applyDrop(d, 'cora', null);
  assert.deepEqual(a, {}); assert.deepEqual(b, { cora: 'kitchen' }); assert.deepEqual(c, { cora: 'hall' }); assert.deepEqual(d, {}); assert.deepEqual(e, {});
  assert.deepEqual(applyDrop({ vane: 'hall' }, 'cora', 'hall'), { vane: 'hall', cora: 'hall' }, 'two characters can share a room');
});

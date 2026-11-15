// The rag-doll: a chain that hangs from the finger, swings, bends the picture and settles. Pure maths, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChain, stepChain, chainUnrest, deformVertices, resetChain } from '../js/ar-rag.js';

const N = 7, H = 0.105, TOP = H + 0.003, SEG = H / (N - 1);
const linkLengthsOk = (c, tol = 0.04) => { for (let i = 0; i < c.n - 1; i++) { const d = Math.hypot(c.p[2 * i + 2] - c.p[2 * i], c.p[2 * i + 3] - c.p[2 * i + 1]); if (Math.abs(d - c.seg) > c.seg * tol) return false; } return true; };

test('a chain hanging from a still finger stays hanging, keeps its link lengths and does not move', () => {
  const c = makeChain(N, H, 0, 0.2);
  for (let i = 0; i < 120; i++) stepChain(c, 1 / 60, { holdX: 0, holdY: 0.2 });
  assert.ok(linkLengthsOk(c), 'link lengths');
  const { off, speed } = chainUnrest(c, 0, 0.2);
  assert.ok(off < 1e-3 && speed < 1e-4, `at rest (off ${off}, speed ${speed})`);
  assert.ok(c.p[2 * (N - 1) + 1] < 0.2 - H * 0.9, 'it hangs below the finger');
});

test('when the finger moves sideways the body lags behind it, then swings and settles', () => {
  const c = makeChain(N, H, 0, 0.2);
  let x = 0, maxLag = 0;
  for (let i = 0; i < 12; i++) { x += 0.012; stepChain(c, 1 / 60, { holdX: x, holdY: 0.2 }); maxLag = Math.max(maxLag, x - c.p[2 * (N - 1)]); } // 0.144 m in 0.2 s
  assert.ok(maxLag > 0.02, `the feet lag behind the head (${maxLag})`);
  assert.ok(linkLengthsOk(c, 0.08), 'the body does not stretch');
  for (let i = 0; i < 360; i++) stepChain(c, 1 / 60, { holdX: x, holdY: 0.2 });
  const { off, speed } = chainUnrest(c, x, 0.2);
  assert.ok(off < 0.004 && speed < 5e-4, `the swing dies away (off ${off}, speed ${speed})`);
});

test('after a drop the body stands back up under its top point, and does not sink through the floor', () => {
  const c = makeChain(N, H, 0, 0.2);
  for (let i = 0; i < 20; i++) stepChain(c, 1 / 60, { holdX: 0.01 * i, holdY: 0.2 }); // swinging
  const FLOOR = 0.004;
  for (let i = 0; i < 240; i++) {
    stepChain(c, 1 / 60, { pinned: false, restoreK: Math.min(1, i / 24), restTopX: 0.19, restTopY: FLOOR + TOP, floorY: FLOOR });
    for (let k = 0; k < N; k++) assert.ok(c.p[2 * k + 1] >= FLOOR - 1e-9, 'never below the floor');
  }
  const { off, speed } = chainUnrest(c, 0.19, FLOOR + TOP);
  assert.ok(off < 0.003 && speed < 5e-4, `standing again (off ${off}, speed ${speed})`);
});

test('wild or broken input never makes a point that is not a number', () => {
  const c = makeChain(N, H, 0, 0.2);
  for (const dt of [0, -1, NaN, 5, 1e9, 1 / 60]) stepChain(c, dt, { holdX: 100 * Math.random(), holdY: 0.2 });
  stepChain(c, 1 / 60, { holdX: NaN, holdY: 0.2 });
  for (const v of c.p) assert.ok(Number.isFinite(v));
  for (const v of c.q) assert.ok(Number.isFinite(v));
});

test('a chain at rest bends the picture into exactly the flat picture, and a swung chain moves the feet but not the head', () => {
  const cols = 3, rows = 15, orig = new Float32Array(cols * rows * 3);
  let k = 0; for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) { orig[k++] = (q - 1) * 0.02; orig[k++] = TOP - (r / (rows - 1)) * H; orig[k++] = 0; }
  const out = new Float32Array(orig.length), c = makeChain(N, H, 0, TOP);
  deformVertices(c, orig, out, TOP, H, 0, 0);
  for (let i = 0; i < orig.length; i++) assert.ok(Math.abs(out[i] - orig[i]) < 1e-6, `rest is the identity (${i})`);
  const s = makeChain(N, H, 0, TOP);
  for (let i = 0; i < 12; i++) stepChain(s, 1 / 60, { holdX: 0.012 * (i + 1), holdY: TOP });
  deformVertices(s, orig, out, TOP, H, 0.144, 0);
  assert.ok(Math.abs(out[3]) < 1e-6 && Math.abs(out[4] - TOP) < 1e-6, 'the middle of the top row stays at the head');
  const mid = ((rows - 1) * cols + 1) * 3;
  assert.ok(Math.abs(out[mid] - orig[mid]) > 0.01, 'the middle of the bottom row has swung');
  for (const v of out) assert.ok(Number.isFinite(v));
});

test('resetChain puts the chain back hanging straight', () => {
  const c = makeChain(N, H, 0, 0.2);
  for (let i = 0; i < 30; i++) stepChain(c, 1 / 60, { holdX: 0.01 * i, holdY: 0.2 });
  resetChain(c, 1, 0.5);
  const { off, speed } = chainUnrest(c, 1, 0.5);
  assert.ok(off < 1e-12 && speed < 1e-12);
});

test('marionette feel: heavy dead-weight drag with no cartoon pendulum bounce, sharp neck crease, stiff spine and head-first rise', () => {
  const c = makeChain(N, H, 0, 0.2);
  let x = 0, maxLag = 0;
  for (let i = 0; i < 12; i++) { x += 0.012; stepChain(c, 1 / 60, { holdX: x, holdY: 0.2 }); maxLag = Math.max(maxLag, x - c.p[2 * (N - 1)]); }
  const segAngle = (i) => Math.atan2(c.p[2 * i + 2] - c.p[2 * i], -(c.p[2 * i + 3] - c.p[2 * i + 1])) * (180 / Math.PI);
  const neckCrease = Math.abs(segAngle(1) - segAngle(0)), spineBend = Math.abs(segAngle(2) - segAngle(1));
  assert.ok(neckCrease > spineBend * 3 && neckCrease > 12, `neck cocks sharply (${neckCrease.toFixed(1)} deg) while spine stays stiff (${spineBend.toFixed(1)} deg)`);
  let overshoot = 0;
  for (let i = 0; i < 240; i++) { stepChain(c, 1 / 60, { holdX: x, holdY: 0.2 }); overshoot = Math.max(overshoot, c.p[2 * (N - 1)] - x); }
  assert.ok(overshoot < maxLag * 0.04, `creeps to a dead hang without cartoon swing (overshoot ${overshoot}, lag ${maxLag})`);

  // Head-first rise from a floor slump: crown is hauled up toward restTopX/Y without overshooting, while knees/hem still drag low
  const FLOOR = 0.004, r = makeChain(N, H, 0, FLOOR + TOP);
  r.p[2] += 0.015; r.q[2] = r.p[2];
  for (let i = 0; i < 45; i++) stepChain(r, 1 / 60, { pinned: false, restoreK: 0, floorY: FLOOR }); // slumped flat on the floor
  assert.ok(r.p[1] < FLOOR + 0.005, 'slumped onto the floorboards');
  for (let i = 0; i < 12; i++) stepChain(r, 1 / 60, { pinned: false, restoreK: 0.4, restTopX: 0, restTopY: FLOOR + TOP, floorY: FLOOR });
  const headFrac = (r.p[1] - FLOOR) / TOP, kneeFrac = (r.p[2 * (N - 2) + 1] - FLOOR) / (TOP - (N - 2) * SEG);
  assert.ok(headFrac > 0.6 && headFrac <= 1.0, `crown rises smoothly without spring-overshoot (${headFrac.toFixed(2)})`);
  assert.ok(Math.abs(r.p[0]) < Math.abs(r.p[6]) * 0.5 && headFrac > kneeFrac + 0.15, 'crown leads while spine and knees lag behind');
});

test('3D shroud drape: zBend trails the hem backward in depth while keeping the pinched crown at z = 0', () => {
  const cols = 5, rows = 19, orig = new Float32Array(cols * rows * 3);
  let k = 0; for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) { orig[k++] = (q - 2) * 0.01; orig[k++] = TOP - (r / (rows - 1)) * H; orig[k++] = 0; }
  const out = new Float32Array(orig.length), c = makeChain(N, H, 0, TOP);
  deformVertices(c, orig, out, TOP, H, 0, 0, 0.025);
  assert.ok(Math.abs(out[2]) < 1e-9, 'top crown stays at z = 0');
  const bottomMidZ = out[((rows - 1) * cols + 2) * 3 + 2];
  assert.ok(bottomMidZ < -0.02, `hem drapes backward in 3D (${bottomMidZ})`);
});

test('severed drop: rapid heavy plummet folds knees and waist into a floor-sprawled heap with zero bounce or ice slide', () => {
  const FLOOR = 0.004, c = makeChain(N, H, 0, FLOOR + 0.054 + TOP);
  c.p[2] -= 0.003; c.p[4] -= 0.004; c.p[6] -= 0.001; c.p[8] += 0.005; c.p[10] += 0.005;
  //Give sideways release momentum: floor friction should kill ice-skating on contact
  for (let i = 0; i < N; i++) c.q[2 * i] -= 0.004;
  for (let f = 0; f < 14; f++) stepChain(c, 1 / 60, { pinned: false, restoreK: 0, floorY: FLOOR }); // ~0.23 s
  assert.ok(c.p[1] < FLOOR + 0.005, `crown slams down to the floorboards quickly (${c.p[1]})`);
  const spanDist = Math.hypot(c.p[2 * (N - 1)] - c.p[0], c.p[2 * (N - 1) + 1] - c.p[1]);
  assert.ok(spanDist < H * 0.75, `joints buckle rather than staying plank-stiff (${spanDist.toFixed(4)} vs H=${H})`);
  const xAfterImpact = c.p[0];
  for (let f = 0; f < 20; f++) stepChain(c, 1 / 60, { pinned: false, restoreK: 0, floorY: FLOOR });
  assert.ok(Math.abs(c.p[0] - xAfterImpact) < 0.002 && c.p[1] <= FLOOR + 1e-6, 'lands dead with no slide or bounce');

  // Verify 3D floor-crumple spreads knees forward and torso back without dropping below the floorboards
  const cols = 5, rows = 19, orig = new Float32Array(cols * rows * 3), out = new Float32Array(cols * rows * 3);
  let k = 0; for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) { orig[k++] = (q - 2) * 0.015; orig[k++] = 0.003 + H * (1 - r / (rows - 1)); orig[k++] = 0; }
  deformVertices(c, orig, out, TOP, H, 0, FLOOR, 0);
  let minY = 9, maxZ = -9, minZ = 9;
  for (let i = 0; i < out.length; i += 3) { minY = Math.min(minY, out[i + 1]); minZ = Math.min(minZ, out[i + 2]); maxZ = Math.max(maxZ, out[i + 2]); }
  assert.ok(minY > 0.001, `collapsed silhouette stays above floorboards (${minY})`);
  assert.ok(maxZ > 0.015 && minZ < -0.025, `knees buckle forward and torso spills back in 3D (${minZ.toFixed(3)} .. ${maxZ.toFixed(3)})`);
});

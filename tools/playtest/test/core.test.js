// Run: node --test tools/puzzle-playtest/test/   (Node 22, no dependencies)
// Seeded loops stand in for fast-check here; the real property tests live in shared/src/puzzles/ later.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/core.js';

const RUNS = 200;
const seeds = Array.from({ length: RUNS }, (_, i) => i * 7919 + 13);
const each = (fn) => { for (const kind of C.KINDS) for (const level of C.LEVELS) for (const seed of seeds.slice(0, 60)) fn(kind, level, seed); };
const rng = (s) => C.rngFrom(s);

test('Property 1: generation is deterministic', () => {
  each((kind, level, seed) => {
    assert.deepEqual(C.makeLock(kind, level, seed), C.makeLock(kind, level, seed));
  });
  assert.notDeepEqual(C.makeLock('clock', 'easy', 1), C.makeLock('clock', 'easy', 2));
});

test('Property 2: every generated Lock is solvable by the reference (touch-only) solve', () => {
  each((kind, level, seed) => {
    const lock = C.makeLock(kind, level, seed);
    const v = C.verify(lock, C.referenceSolve(lock));
    assert.deepEqual(v, { ok: true }, `${kind}/${level}/${seed}`);
  });
});

test('Property 3: verify never throws, and rejects any change to a correct Transcript', () => {
  const junk = [null, undefined, 0, 'x', [], {}, { kind: 'clock' }, { kind: 'clock', elapsedMs: NaN }, { kind: 'clock', elapsedMs: Infinity, h: 1, m: 5 }];
  each((kind, level, seed) => {
    const lock = C.makeLock(kind, level, seed);
    for (const j of junk) assert.doesNotThrow(() => C.verify(lock, j));
    for (const j of junk) assert.equal(C.verify(lock, j).ok, false);
    // too fast, too big
    const good = C.referenceSolve(lock);
    assert.equal(C.verify(lock, { ...good, elapsedMs: C.minSolveMs(lock) - 1 }).code, 'too_fast');
    assert.equal(C.verify(lock, { ...good, pad: 'x'.repeat(5000) }).code, 'too_big');
    assert.equal(C.verify(lock, { ...good, kind: kind === 'clock' ? 'safe' : 'clock' }).ok, false);
  });
});

test('Property 3b: single changes to a correct Transcript make it fail', () => {
  const mutate = {
    clock: (t) => ({ ...t, m: (t.m + 5) % 60 }),
    safe: (t) => ({ ...t, code: t.code.map((d, i) => (i === 0 ? (d + 1) % 10 : d)) }),
    musicbox: (t) => ({ ...t, notes: t.notes.map((d, i) => (i === 0 ? (d + 1) % 5 : d)) }),
    candles: (t) => ({ ...t, order: [t.order[1], t.order[0], ...t.order.slice(2)] }),
    board: (t) => ({ ...t, letters: t.letters.slice(0, -1) + (t.letters.endsWith('Z') ? 'Y' : 'Z') }),
    words: (t) => ({ ...t, letters: [t.letters[1], t.letters[0], ...t.letters.slice(2)] }),
    wires: (t) => ({ ...t, pairs: [[t.pairs[0][0], t.pairs[1][1]], [t.pairs[1][0], t.pairs[0][1]], ...t.pairs.slice(2)] }),
    moved: (t) => ({ ...t, changed: t.changed.slice(1) }),
    photo: (t) => ({ ...t, placed: t.placed.map((e, i) => (i === 0 ? { ...e, turns: (e.turns + 1) % 4 } : e)) }),
    lockpick: (t) => ({ ...t, sets: t.sets.map((e, i) => (i === 0 ? { ...e, atDeg: e.atDeg + 30 } : e)) }),
  };
  each((kind, level, seed) => {
    if (!mutate[kind]) return;
    const lock = C.makeLock(kind, level, seed);
    assert.equal(C.verify(lock, mutate[kind](C.referenceSolve(lock))).ok, false, `${kind}/${level}/${seed}`);
  });
});

test('Property 4: a Sight and its Faded twin show the same clue; only Memory Kinds have one', () => {
  each((kind, level, seed) => {
    const lock = C.makeLock(kind, level, seed);
    const s = C.sightFor(lock), f = C.fadedFor(lock);
    if (!C.MEMORY_KINDS.includes(kind)) { assert.equal(s, null); assert.equal(f, null); return; }
    assert.deepEqual(s.payload, f.payload);
    assert.ok(f.showMs < s.showMs);
    assert.equal(C.sightFor(lock, true).showMs, 8000);
    assert.equal(C.fadedFor(lock, true).showMs, 8000);
  });
});

test('Sight content carries exactly what the answer needs', () => {
  for (const seed of seeds.slice(0, 40)) {
    const w = C.makeLock('wires', 'normal', seed);
    for (const id of w.view.leftOrder) assert.equal(w.secret.terminalOf[id], w.sight.order.indexOf(id));
    const c = C.makeLock('clock', 'easy', seed);
    assert.deepEqual(c.sight, { h: c.secret.h, m: c.secret.m });
    assert.equal(c.secret.m % 5, 0);
    const m = C.makeLock('moved', 'normal', seed);
    const diff = m.sight.shelf.map((v, i) => (v !== m.view.after[i] ? i : -1)).filter((i) => i >= 0);
    assert.deepEqual(diff, m.secret.changed);
    assert.equal(diff.length, 3);
  }
});

test('Property 7: the time charged stays between ten seconds and the Cap', () => {
  const r = rng(5);
  for (let i = 0; i < 1000; i++) {
    const elapsed = r() * 60000, cap = [20000, 25000, 40000][i % 3];
    const c = C.lockCharge(elapsed, cap);
    assert.ok(c >= 10000 && c <= cap);
    if (elapsed >= 10000 && elapsed <= cap) assert.equal(c, elapsed);
  }
  assert.equal(C.lockCharge(NaN, 25000), 10000);
  assert.equal(C.lockCharge(3000, 25000), 10000);
  assert.equal(C.lockCharge(99999, 40000), 40000);
});

test('Property 12: tilt maths is total, bounded and rotation-correct', () => {
  const r = rng(9);
  const weird = [NaN, Infinity, -Infinity, undefined, null, 1e300];
  for (const w of weird) for (const a of [0, 90, 180, 270]) {
    const t = C.tiltForScreen({ beta: w, gamma: 5 }, a);
    assert.ok(Number.isFinite(t.x) && Number.isFinite(t.y));
    assert.ok(Number.isFinite(C.deadZone(w)));
    const s = C.smoothTilt({ x: 1, y: 1 }, { x: w, y: w });
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y));
    assert.ok(Number.isFinite(C.tiltToPosition(w)));
  }
  for (let i = 0; i < RUNS; i++) {
    const raw = { beta: (r() - 0.5) * 360, gamma: (r() - 0.5) * 180 };
    const t0 = C.tiltForScreen(raw, 0);
    const t90 = C.tiltForScreen(raw, 90);
    const t180 = C.tiltForScreen(raw, 180);
    const t270 = C.tiltForScreen(raw, 270);
    // a quarter turn of the screen turns the on-screen direction by a quarter: (x, y) -> (y, -x)
    assert.deepEqual([t90.x, t90.y], [t0.y, -t0.x]);
    assert.deepEqual([t180.x, t180.y], [t90.y, -t90.x]);
    assert.deepEqual([t270.x, t270.y], [t180.y, -t180.x]);
    assert.ok(Math.abs(Math.hypot(t0.x, t0.y) - Math.hypot(t90.x, t90.y)) < 1e-9);
    const z = C.clampTilt({ x: raw.beta, y: raw.gamma });
    assert.ok(Math.abs(z.x) <= 45 && Math.abs(z.y) <= 45);
    assert.equal(C.deadZone(1.9), 0);
    assert.equal(C.deadZone(-2), 0);
  }
  // monotone position map
  let prev = -Infinity;
  for (let d = -60; d <= 60; d += 1) { const p = C.tiltToPosition(d); assert.ok(p >= prev); prev = p; }
  assert.equal(C.tiltToPosition(-45), -40);
  assert.equal(C.tiltToPosition(45), 40);
  assert.equal(C.tiltToPosition(0), 0);
  // dial from gravity: flat phone gives none, upright gives an angle
  assert.equal(C.dialFromGravity(0, 0, 9.8), null);
  assert.ok(Math.abs(C.dialFromGravity(0, 9.8, 0)) < 1e-9);
  assert.ok(Math.abs(C.dialFromGravity(9.8, 0, 0) - 90) < 1e-9);
});

test('Property 13: physics does not depend on the event rate', () => {
  const world = C.defaultWorld(300, 400, [{ x: 100, y: 100, w: 20, h: 150 }, { x: 180, y: 220, w: 100, h: 20 }]);
  const r = rng(77);
  for (let run = 0; run < 60; run++) {
    const signal = Array.from({ length: 400 }, () => ({ x: (r() - 0.5) * 90, y: (r() - 0.5) * 90 }));
    const tiltOfTick = (k) => signal[k % signal.length];
    const total = 1000 + Math.floor(r() * 4000);
    const whole = C.newBall(30, 30);
    C.advanceBall(whole, tiltOfTick, total, world);
    const split = C.newBall(30, 30);
    let left = total;
    while (left > 0) { const f = Math.min(left, 1 + Math.floor(r() * 40)); C.advanceBall(split, tiltOfTick, f, world); left -= f; }
    assert.deepEqual({ ...split }, { ...whole });
    assert.ok(whole.x >= world.r && whole.x <= world.w - world.r && whole.y >= world.r && whole.y <= world.h - world.r);
    for (const wall of world.walls) {
      const inside = whole.x + world.r > wall.x && whole.x - world.r < wall.x + wall.w && whole.y + world.r > wall.y && whole.y - world.r < wall.y + wall.h;
      assert.equal(inside, false);
    }
  }
});

test('Property 14: vibration plans respect the limits; hot and cold is bounded and monotone', () => {
  const r = rng(3);
  const names = Object.keys(C.PATTERNS);
  for (let run = 0; run < RUNS; run++) {
    const events = Array.from({ length: 80 }, () => ({ t: Math.floor(r() * 12000), name: names[Math.floor(r() * names.length)] }));
    const plan = C.planHaptics(events);
    const starts = [];
    let total = 0, rumbles = 0;
    for (const p of plan) {
      for (const [off, len] of C.pulsesOf(p.pattern)) { assert.ok(len <= 400); starts.push(p.t + off); total += len; }
      if (p.name === 'rumble') rumbles++;
    }
    assert.ok(total <= 6000);
    assert.ok(rumbles <= 1);
    starts.sort((a, b) => a - b);
    for (let i = 0; i < starts.length; i++) assert.ok(starts.filter((s) => s >= starts[i] && s < starts[i] + 1000).length <= 4);
  }
  assert.deepEqual(C.planHaptics([{ t: 0, name: 'tick' }], false), []);
  assert.equal(Math.max(...Object.values(C.PATTERNS).map((p) => C.pulsesOf(p).length ? 1 : 0)), 1);
  const rumbleMs = C.PATTERNS.rumble.reduce((a, b) => a + b, 0);
  assert.ok(rumbleMs <= 1200);
  for (const w of [10, 14]) {
    let prev = 0;
    for (let d = 0; d <= 60; d += 0.5) {
      const i = C.hotColdInterval(d, w);
      assert.ok(i >= 250 && i <= 800 && i >= prev);
      prev = i;
    }
    assert.equal(C.hotColdInterval(0, w), 250);
    assert.equal(C.hotColdInterval(60, w), 800);
  }
});

test('Property 15: sound plans respect consent and limits', () => {
  const r = rng(11);
  const names = Object.keys(C.RECIPES);
  for (let run = 0; run < RUNS; run++) {
    const events = Array.from({ length: 40 }, () => ({ t: Math.floor(r() * 3000), name: names[Math.floor(r() * names.length)] }));
    assert.deepEqual(C.planSound(events, false), []);
    const plan = C.planSound(events, true);
    for (const p of plan) {
      assert.ok(p.gain <= 0.5);
      const active = plan.filter((o) => o.t <= p.t && o.t + o.ms > p.t).length;
      assert.ok(active <= 4);
    }
  }
  assert.ok(C.NOTE_FREQS.every((f) => f >= 300));
});

test('Property 16: light plans respect the photosensitivity limits', () => {
  for (const kind of ['dark', 'torch', 'candle']) {
    for (const reduced of [false, true]) {
      const plan = C.dimPlan(kind, reduced);
      assert.ok(plan.every((s) => s.lum < 1 && s.lum >= 0));
      assert.ok(C.worstChangesPerSecond(plan) <= 2);
      if (reduced) assert.equal(plan.length, 1);
    }
  }
});

test('Property 17: a breath needs sustained loudness', () => {
  assert.equal(C.blowDetect([]), false);
  assert.equal(C.blowDetect([{ t: 0, level: NaN }, { t: 400, level: Infinity }]), false);
  const frames = (from, to, level, step = 16) => { const a = []; for (let t = from; t <= to; t += step) a.push({ t, level }); return a; };
  assert.equal(C.blowDetect(frames(0, 250, 0.9)), false);
  assert.equal(C.blowDetect(frames(0, 400, 0.9)), true);
  assert.equal(C.blowDetect(frames(0, 400, 0.05)), false);
  // two short bursts with a gap do not add up
  assert.equal(C.blowDetect([...frames(0, 200, 0.9), ...frames(220, 300, 0.01), ...frames(320, 520, 0.9)]), false);
  // a noisy room raises the threshold
  assert.equal(C.blowDetect(frames(0, 400, 0.2), 0.1), false);
  assert.equal(C.blowDetect(frames(0, 400, 0.5), 0.1), true);
});

test('mazes are solvable and well formed', () => {
  for (const level of C.LEVELS) for (const grid of C.MAZES[level]) {
    assert.ok(C.mazeSolvable(grid));
    assert.ok(grid.every((row) => row.length === 9));
    assert.equal(grid.join('').split('S').length, 2);
    assert.equal(grid.join('').split('G').length, 2);
  }
});

test('word lists: A to Z, right lengths, 12 each, no repeats', () => {
  const lists = [[C.READ_WORDS_4, 4], [C.READ_WORDS_5, 5], [C.BOARD_WORDS_3, 3], [C.BOARD_WORDS_4, 4]];
  for (const [list, len] of lists) {
    assert.equal(list.length, 12);
    assert.equal(new Set(list).size, 12);
    for (const w of list) { assert.match(w, /^[A-Z]+$/); assert.equal(w.length, len); }
  }
});

test('lock pick windows sit inside the range and consecutive pins differ', () => {
  for (const level of C.LEVELS) for (const seed of seeds) {
    const l = C.makeLock('lockpick', level, seed);
    const half = l.view.windowDeg / 2;
    l.view.centers.forEach((c, i) => {
      assert.ok(c - half >= -40 && c + half <= 40);
      if (i) assert.ok(Math.abs(c - l.view.centers[i - 1]) >= 20 - 1e-9);
    });
  }
});

test('wires: five styles never repeat and the Sight order is a permutation', () => {
  for (const seed of seeds.slice(0, 50)) for (const level of C.LEVELS) {
    const l = C.makeLock('wires', level, seed);
    assert.equal(new Set(l.sight.order).size, l.view.n);
    assert.deepEqual([...l.sight.order].sort(), [...l.view.leftOrder].sort());
  }
});

test('photo: the answer turns each piece back to upright', () => {
  for (const seed of seeds.slice(0, 50)) for (const level of C.LEVELS) {
    const l = C.makeLock('photo', level, seed);
    assert.equal(l.view.turns0.length, l.view.cols * l.view.rows);
    assert.ok(l.view.turns0.some((t) => t !== 0));
  }
});

test('haptic limiter: a snap counts as two pulses', () => {
  const lim = new C.HapticLimiter();
  assert.ok(lim.offer('snap', 0)); // 2 pulses
  assert.ok(lim.offer('snap', 100)); // 4 pulses in the second
  assert.equal(lim.offer('tick', 200), null); // a fifth would pass four a second
  assert.ok(lim.offer('tick', 1500));
  lim.reset();
  assert.ok(lim.offer('rumble', 0));
  assert.equal(lim.offer('rumble', 5000), null); // one rumble per Attempt
});

test('board words: every word has a clue, and no clue gives the word away', () => {
  const all = [...C.BOARD_WORDS_3, ...C.BOARD_WORDS_4];
  assert.deepEqual(Object.keys(C.BOARD_CLUES).sort(), [...all].sort());
  for (const w of all) {
    const clue = C.BOARD_CLUES[w];
    assert.ok(clue.length >= 5 && clue.length <= 40, w);
    assert.ok(!clue.toUpperCase().includes(w), `${w}: the clue contains the word`);
    assert.ok(!/[^a-z ,'-]/i.test(clue), `${w}: plain words only`);
  }
  for (const level of C.LEVELS) for (const seed of seeds.slice(0, 30)) {
    const l = C.makeLock('board', level, seed);
    assert.equal(l.view.clue, C.BOARD_CLUES[l.secret.word]);
    assert.equal(l.view.length, l.secret.word.length);
  }
});

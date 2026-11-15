// Pure logic for the puzzle playtest pages. No DOM, no Date.now, no Math.random.
// Mirrors .kiro/specs/puzzles/design.md (shared/src/puzzles/). The real TypeScript module replaces this
// file; keep the function names and rules the same so the playtest numbers carry over.

// ---------------------------------------------------------------- basics
export const KINDS = ['lockpick', 'wires', 'clock', 'safe', 'musicbox', 'candles', 'moved', 'photo', 'words', 'board', 'maze'];
export const MEMORY_KINDS = ['wires', 'clock', 'safe', 'moved', 'photo'];
export const LEVELS = ['easy', 'normal'];
export const ATTEMPTS = 3;
export const MAX_EVENTS = 64;
export const MAX_BYTES = 4096;

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const finite = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** FNV-1a over the string form of the parts: a stable uint32 from any inputs. */
export function hash(...parts) {
  let h = 0x811c9dc5;
  for (const ch of parts.join('␟')) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: a seeded generator returning floats in [0, 1). */
export function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const randInt = (r, n) => Math.floor(r() * n);
export function shuffle(r, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(r, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const range = (n) => Array.from({ length: n }, (_, i) => i);

// ---------------------------------------------------------------- word lists (gentle, A to Z only)
export const READ_WORDS_4 = ['MOON', 'DUSK', 'LAMP', 'BELL', 'FERN', 'WIND', 'DAWN', 'REED', 'MOTH', 'LACE', 'MIST', 'TIDE'];
export const READ_WORDS_5 = ['EMBER', 'QUILT', 'HAZEL', 'LINEN', 'FROST', 'SHADE', 'PEARL', 'MAPLE', 'STONE', 'FLAME', 'NIGHT', 'PLUME'];
export const BOARD_WORDS_3 = ['ELM', 'OAK', 'OWL', 'FOG', 'DEW', 'FIR', 'KEY', 'URN', 'HAT', 'SUN', 'BEE', 'ORB'];
export const BOARD_WORDS_4 = ['HUSH', 'DOOR', 'STAR', 'ROSE', 'DOVE', 'LEAF', 'SNOW', 'RAIN', 'BIRD', 'HALL', 'GLOW', 'HOME'];

// ---------------------------------------------------------------- mazes (frozen outputs of a seeded backtracker)
export const MAZES = {
  easy: [
    ['#########', '#S#.....#', '#.#.#.###', '#.#.#...#', '#.#.#.#.#', '#.#...#.#', '#.#.###.#', '#.#...#.#', '#.#.#.#.#', '#...#..G#', '#########'],
    ['#########', '#S....#.#', '#####.#.#', '#.....#.#', '#.#.#.#.#', '#...#...#', '#.#####.#', '#.....#.#', '#.###.#.#', '#...#..G#', '#########'],
  ],
  normal: [
    ['#########', '#S......#', '#######.#', '#...#...#', '###.#.###', '#...#.#.#', '#.###.#.#', '#.#...#.#', '#.#.###.#', '#.#.#...#', '#.#.###.#', '#......G#', '#########'],
    ['#########', '#S#.....#', '#.#####.#', '#.......#', '#######.#', '#.....#.#', '#.###.#.#', '#...#...#', '###.#####', '#...#...#', '#.###.#.#', '#.....#G#', '#########'],
    ['#########', '#S....#.#', '#####.#.#', '#...#...#', '###.###.#', '#...#...#', '#.###.###', '#...#.#.#', '#.#.#.#.#', '#.#.#.#.#', '#.#.#.#.#', '#.#....G#', '#########'],
  ],
};

/** Breadth-first search over the open cells: is the goal reachable from the start? */
export function mazeSolvable(grid) {
  const rows = grid.length, cols = grid[0].length;
  let start = null, goal = null;
  grid.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'S') start = [x, y]; if (c === 'G') goal = [x, y]; }));
  if (!start || !goal) return false;
  const seen = new Set([start.join()]);
  const q = [start];
  while (q.length) {
    const [x, y] = q.shift();
    if (x === goal[0] && y === goal[1]) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || grid[ny][nx] === '#' || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      q.push([nx, ny]);
    }
  }
  return false;
}

// ---------------------------------------------------------------- the Locks
export const NOTE_FREQS = [392, 440, 523, 587, 659];
export const SHELF_ITEMS = 12; // ids 0..11 drawn by kinds/moved.js
export const WIRE_STYLES = 6; // ids 0..5 drawn by kinds/wires.js

/** Smallest believable solve time for a Lock (a starting guess; Spike puzzles 1.5 tunes it). */
export function minSolveMs(lock) {
  const n = lock.view.n ?? lock.view.pins ?? lock.view.tune?.length ?? lock.view.length ?? lock.view.letters?.length ?? 0;
  switch (lock.kind) {
    case 'lockpick': return 800 * lock.view.pins;
    case 'wires': return 2500;
    case 'clock': return 1500;
    case 'safe': return 3000;
    case 'musicbox': return 600 * n;
    case 'candles': return 2000;
    case 'moved': return 3000;
    case 'photo': return lock.level === 'easy' ? 4000 : 6000;
    case 'words': return 3000;
    case 'board': return 800 * n;
    case 'maze': return 3000;
    default: return 0;
  }
}

function uniqueSpaced(r, n, lo, hi, minGap) {
  for (let tries = 0; tries < 200; tries++) {
    const xs = range(n).map(() => lo + r() * (hi - lo));
    let ok = true;
    for (let i = 1; i < n; i++) if (Math.abs(xs[i] - xs[i - 1]) < minGap) ok = false;
    if (ok) return xs.map((x) => Math.round(x * 10) / 10);
  }
  return range(n).map((i) => lo + ((hi - lo) * i) / Math.max(1, n - 1));
}

/**
 * makeLock(kind, level, seed): deterministic. Takes nothing else, so it cannot depend on a Solution,
 * a Hand or a Residue position (Property 1).
 * Returns { kind, level, seed, view, secret, sight }.
 *   view   what the phone draws
 *   secret what only the server keeps (the answer)
 *   sight  the clue a Memory Kind shows in an earlier scene, or null
 */
export function makeLock(kind, level, seed) {
  if (!KINDS.includes(kind)) throw new Error(`unknown kind ${kind}`);
  if (!LEVELS.includes(level)) throw new Error(`unknown level ${level}`);
  const easy = level === 'easy';
  const r = rngFrom(hash('lock', kind, level, seed));
  let view, secret, sight = null;
  switch (kind) {
    case 'lockpick': {
      const pins = easy ? 3 : 4;
      const width = easy ? 14 : 10;
      const centers = uniqueSpaced(r, pins, -40 + width / 2 + 2, 40 - width / 2 - 2, 20);
      view = { pins, range: [-40, 40], windowDeg: width, dwellMs: 400, centers };
      secret = { centers, width };
      break;
    }
    case 'wires': {
      const n = easy ? 4 : 5;
      const ids = shuffle(r, range(WIRE_STYLES)).slice(0, n);
      const order = shuffle(r, ids); // top to bottom, shown in the Sight
      const leftOrder = shuffle(r, ids);
      view = { n, leftOrder };
      secret = { terminalOf: Object.fromEntries(ids.map((w) => [w, order.indexOf(w)])) };
      sight = { order };
      break;
    }
    case 'clock': {
      let h, m;
      do { h = 1 + randInt(r, 12); m = 5 * randInt(r, 12); } while (h === 12 && m === 0);
      view = { stepMin: 5 };
      secret = { h, m };
      sight = { h, m };
      break;
    }
    case 'safe': {
      const n = easy ? 3 : 4;
      let code;
      do { code = range(n).map(() => randInt(r, 10)); } while (code.every((d) => d === code[0]));
      view = { digits: n };
      secret = { code };
      sight = { code };
      break;
    }
    case 'musicbox': {
      const n = easy ? 3 : 4;
      let tune;
      do { tune = range(n).map(() => randInt(r, 5)); } while (tune.every((d) => d === tune[0]));
      view = { tune, plays: 3, n };
      secret = { tune };
      break;
    }
    case 'candles': {
      const n = easy ? 4 : 5;
      const order = shuffle(r, range(n));
      view = { n, order, shows: 2 };
      secret = { order };
      break;
    }
    case 'moved': {
      const slots = easy ? 6 : 8;
      const k = easy ? 2 : 3;
      const before = shuffle(r, range(SHELF_ITEMS)).slice(0, slots);
      const unused = shuffle(r, range(SHELF_ITEMS).filter((i) => !before.includes(i)));
      const changed = shuffle(r, range(slots)).slice(0, k).sort((a, b) => a - b);
      const after = before.slice();
      let missing = 0;
      changed.forEach((slot, i) => {
        if (missing === 0 && r() < 0.35) { after[slot] = -1; missing++; } else after[slot] = unused[i];
      });
      view = { slots, after, darkMs: 2000 };
      secret = { changed };
      sight = { shelf: before };
      break;
    }
    case 'photo': {
      const cols = easy ? 2 : 3, rows = 2;
      const picture = makePicture(r);
      const turns0 = range(cols * rows).map(() => randInt(r, 4));
      if (turns0.every((t) => t === 0)) turns0[0] = 1;
      view = { cols, rows, picture, turns0 };
      secret = { turns0 };
      sight = { picture, cols, rows };
      break;
    }
    case 'words': {
      const list = easy ? READ_WORDS_4 : READ_WORDS_5;
      const word = list[randInt(r, list.length)];
      const n = word.length;
      const placed = [...word].map((ch, i) => ({ ch, x: Math.round(((i + 0.5) / n + (r() - 0.5) * 0.06) * 1000) / 1000, y: Math.round((0.2 + r() * 0.6) * 1000) / 1000 }));
      const perm = shuffle(r, range(n));
      const letters = perm.map((i) => placed[i]);
      const readingOrder = letters.map((l, idx) => [l.x, idx]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
      view = { letters, n };
      secret = { order: readingOrder, word };
      break;
    }
    case 'board': {
      const list = easy ? BOARD_WORDS_3 : BOARD_WORDS_4;
      const word = list[randInt(r, list.length)];
      view = { length: word.length, plays: 2, dwellMs: 600 };
      secret = { word };
      break;
    }
    case 'maze': {
      const list = MAZES[level];
      const grid = list[randInt(r, list.length)];
      view = { grid };
      secret = {};
      break;
    }
  }
  return { kind, level, seed, view, secret, sight };
}

/** A picture drawn from simple shapes. Colours are hsl strings; x, y, s are fractions of the picture. */
function makePicture(r) {
  const hue = randInt(r, 360);
  const shapes = range(9).map((i) => ({
    t: ['circle', 'rect', 'tri'][i % 3],
    x: Math.round((0.08 + r() * 0.84) * 1000) / 1000,
    y: Math.round((0.1 + r() * 0.8) * 1000) / 1000,
    s: Math.round((0.1 + r() * 0.16) * 1000) / 1000,
    c: `hsl(${(hue + 40 * (i + 1) + randInt(r, 25)) % 360} ${55 + randInt(r, 25)}% ${45 + randInt(r, 20)}%)`,
    a: randInt(r, 4) * 90,
  }));
  return { top: `hsl(${hue} 45% 22%)`, bottom: `hsl(${(hue + 30) % 360} 55% 58%)`, shapes };
}

// ---------------------------------------------------------------- Sights
export const SIGHT_MS = 5000;
export const SIGHT_MS_ASSIST = 8000;
export const FADED_MS = 4000;
export const FADED_MS_ASSIST = 8000;

/** The clue a Memory Kind shows in an earlier scene, with how long it stays up. Null for other Kinds. */
export function sightFor(lock, assist = false) {
  if (!lock.sight) return null;
  return { kind: lock.kind, payload: lock.sight, showMs: assist ? SIGHT_MS_ASSIST : SIGHT_MS };
}
/** The same clue shown at the Lock when the Sight was missed (shorter, same content). */
export function fadedFor(lock, assist = false) {
  if (!lock.sight) return null;
  return { kind: lock.kind, payload: lock.sight, showMs: assist ? FADED_MS_ASSIST : FADED_MS };
}

// ---------------------------------------------------------------- checking
/** The Transcript for a correct touch-only run. */
export function referenceSolve(lock) {
  const s = lock.secret;
  const base = { kind: lock.kind, elapsedMs: minSolveMs(lock) + 1000 };
  switch (lock.kind) {
    case 'lockpick': {
      const sets = s.centers.map((c, i) => ({ pin: i, atDeg: c, atMs: 800 * (i + 1) + 400 }));
      return { ...base, sets, elapsedMs: Math.max(base.elapsedMs, sets[sets.length - 1].atMs + 100) };
    }
    case 'wires': return { ...base, pairs: lock.view.leftOrder.map((w) => [w, s.terminalOf[w]]) };
    case 'clock': return { ...base, h: s.h, m: s.m };
    case 'safe': return { ...base, code: s.code.slice() };
    case 'musicbox': return { ...base, notes: s.tune.slice() };
    case 'candles': return { ...base, order: s.order.slice() };
    case 'moved': return { ...base, changed: s.changed.slice() };
    case 'photo': return { ...base, placed: s.turns0.map((t0, piece) => ({ piece, slot: piece, turns: (4 - t0) % 4 })) };
    case 'words': return { ...base, letters: s.order.slice() };
    case 'board': return { ...base, letters: s.word };
    case 'maze': return { ...base, reachedAtMs: minSolveMs(lock) + 500, hits: 0 };
  }
  return base;
}

function eventCount(t) {
  let n = 0;
  for (const k of ['sets', 'pairs', 'code', 'notes', 'order', 'changed', 'placed', 'letters']) {
    const v = t[k];
    if (Array.isArray(v)) n += v.length;
    else if (typeof v === 'string') n += v.length;
  }
  return n;
}
const isIntIn = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
const sameList = (a, b) => Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * verify(lock, transcript) -> { ok: true } | { ok: false, code }
 * Accepts only the answer, never throws, gives no partial score. Lock pick and the maze are checked
 * for plausibility only (the phone must know their layout to give feel).
 */
export function verify(lock, t) {
  try {
    if (!t || typeof t !== 'object' || t.kind !== lock.kind) return { ok: false, code: 'malformed' };
    if (JSON.stringify(t).length > MAX_BYTES || eventCount(t) > MAX_EVENTS) return { ok: false, code: 'too_big' };
    if (typeof t.elapsedMs !== 'number' || !Number.isFinite(t.elapsedMs) || t.elapsedMs < 0) return { ok: false, code: 'malformed' };
    if (t.elapsedMs < minSolveMs(lock)) return { ok: false, code: 'too_fast' };
    const s = lock.secret;
    switch (lock.kind) {
      case 'lockpick': {
        if (!Array.isArray(t.sets) || t.sets.length !== lock.view.pins) return { ok: false, code: 'wrong' };
        let prev = -Infinity;
        for (let i = 0; i < t.sets.length; i++) {
          const e = t.sets[i];
          if (!e || e.pin !== i || !Number.isFinite(e.atDeg) || !Number.isFinite(e.atMs)) return { ok: false, code: 'malformed' };
          if (Math.abs(e.atDeg - s.centers[i]) > s.width / 2 + 1e-9) return { ok: false, code: 'wrong' };
          if (e.atMs - prev < lock.view.dwellMs) return { ok: false, code: 'wrong' };
          prev = e.atMs;
        }
        if (t.elapsedMs < prev) return { ok: false, code: 'wrong' };
        return { ok: true };
      }
      case 'wires': {
        if (!Array.isArray(t.pairs) || t.pairs.length !== lock.view.n) return { ok: false, code: 'wrong' };
        const seenW = new Set(), seenT = new Set();
        for (const p of t.pairs) {
          if (!Array.isArray(p) || p.length !== 2) return { ok: false, code: 'malformed' };
          const [w, term] = p;
          if (!(w in s.terminalOf) || seenW.has(w) || seenT.has(term)) return { ok: false, code: 'wrong' };
          seenW.add(w); seenT.add(term);
          if (s.terminalOf[w] !== term) return { ok: false, code: 'wrong' };
        }
        return { ok: true };
      }
      case 'clock': return t.h === s.h && t.m === s.m ? { ok: true } : { ok: false, code: 'wrong' };
      case 'safe': return sameList(t.code, s.code) ? { ok: true } : { ok: false, code: 'wrong' };
      case 'musicbox': return sameList(t.notes, s.tune) ? { ok: true } : { ok: false, code: 'wrong' };
      case 'candles': return sameList(t.order, s.order) ? { ok: true } : { ok: false, code: 'wrong' };
      case 'moved': return Array.isArray(t.changed) && sameList([...t.changed].sort((a, b) => a - b), s.changed) ? { ok: true } : { ok: false, code: 'wrong' };
      case 'photo': {
        const n = lock.view.cols * lock.view.rows;
        if (!Array.isArray(t.placed) || t.placed.length !== n) return { ok: false, code: 'wrong' };
        const seenP = new Set(), seenS = new Set();
        for (const e of t.placed) {
          if (!e || !isIntIn(e.piece, 0, n - 1) || !isIntIn(e.slot, 0, n - 1) || !isIntIn(e.turns, 0, 3)) return { ok: false, code: 'malformed' };
          if (seenP.has(e.piece) || seenS.has(e.slot)) return { ok: false, code: 'wrong' };
          seenP.add(e.piece); seenS.add(e.slot);
          if (e.slot !== e.piece || (s.turns0[e.piece] + e.turns) % 4 !== 0) return { ok: false, code: 'wrong' };
        }
        return { ok: true };
      }
      case 'words': return sameList(t.letters, s.order) ? { ok: true } : { ok: false, code: 'wrong' };
      case 'board': return typeof t.letters === 'string' && t.letters === s.word ? { ok: true } : { ok: false, code: 'wrong' };
      case 'maze': {
        if (!Number.isFinite(t.reachedAtMs) || !Number.isFinite(t.hits) || t.hits < 0 || t.hits > 500) return { ok: false, code: 'malformed' };
        if (t.reachedAtMs < minSolveMs(lock) || t.reachedAtMs > t.elapsedMs + 1) return { ok: false, code: 'wrong' };
        return { ok: true };
      }
    }
    return { ok: false, code: 'malformed' };
  } catch {
    return { ok: false, code: 'malformed' };
  }
}

// ---------------------------------------------------------------- time charge and presets
export const CAPS = { classic: 25000, gentle: 40000, quick: 20000 };
export const PRESET_SETTING = { classic: 'normal', gentle: 'easy', quick: 'off' };
export const PLAIN_INSPECT_MS = 10000;
/** A Lock charges the Turn the time spent, never under 10 s and never over the Cap. */
export const lockCharge = (elapsedMs, capMs) => clamp(finite(elapsedMs), PLAIN_INSPECT_MS, capMs);

// ---------------------------------------------------------------- Tilt maths (the gyroscope)
export const TILT_MAX = 45;
export const DEAD_ZONE = 2;
export const smoothTilt = (prev, raw, alpha = 0.2) => ({
  x: finite(prev?.x) + alpha * (finite(raw?.x) - finite(prev?.x)),
  y: finite(prev?.y) + alpha * (finite(raw?.y) - finite(prev?.y)),
});
export const deadZone = (v, dz = DEAD_ZONE) => { v = finite(v); return Math.abs(v) <= dz ? 0 : v - Math.sign(v) * dz; };
/**
 * Raw beta and gamma (degrees) to a screen-space tilt: x > 0 when the right side of the screen is lower,
 * y > 0 when the bottom of the screen is lower, for screen angles 0, 90, 180 and 270.
 */
export function tiltForScreen({ beta, gamma }, angle = 0) {
  const b = finite(beta), g = finite(gamma);
  const a = ((Math.round(finite(angle) / 90) * 90) % 360 + 360) % 360;
  switch (a) {
    case 90: return { x: b, y: -g };
    case 180: return { x: -g, y: -b };
    case 270: return { x: -b, y: g };
    default: return { x: g, y: b };
  }
}
export const zeroTilt = (zero, raw) => ({ x: finite(raw?.x) - finite(zero?.x), y: finite(raw?.y) - finite(zero?.y) });
export const clampTilt = (t, max = TILT_MAX) => ({ x: clamp(finite(t?.x), -max, max), y: clamp(finite(t?.y), -max, max) });
/** Linear map from a tilt of -45..45 degrees to a position in [lo, hi], clamped. */
export const tiltToPosition = (deg, lo = -40, hi = 40) => lo + ((clamp(finite(deg), -TILT_MAX, TILT_MAX) + TILT_MAX) / (2 * TILT_MAX)) * (hi - lo);
/**
 * The turn of the phone about its own screen axis (twisting it like a dial) from the gravity vector, in
 * degrees (-180, 180]. Null when the phone lies nearly flat (gravity no longer lies in the screen plane).
 * Sign conventions differ by platform; Spike puzzles 1.2 decides, and the pages offer an invert switch.
 */
export function dialFromGravity(ax, ay, az) {
  ax = finite(ax); ay = finite(ay); az = finite(az);
  if (Math.abs(az) > 7.5) return null;
  if (Math.hypot(ax, ay) < 2) return null;
  return (Math.atan2(ax, ay) * 180) / Math.PI;
}

// ---------------------------------------------------------------- tilt physics (fixed 1/60 s steps)
export const TICKS_PER_SEC = 60;
export const DT = 1 / TICKS_PER_SEC;
export const defaultWorld = (w, h, walls = [], r = 14) => ({ w, h, walls, r, accel: 14, friction: 2.2, maxSpeed: 260, bounce: 0.3, hitSpeed: 40 });
export const newBall = (x, y) => ({ x, y, vx: 0, vy: 0, totalMs: 0, hits: 0 });

function overlaps(x, y, r, wall) {
  return x + r > wall.x && x - r < wall.x + wall.w && y + r > wall.y && y - r < wall.y + wall.h;
}

/** One fixed step. Returns the speed of the hardest impact in the step (0 for none). */
export function stepBall(s, tilt, world) {
  const t = clampTilt(tilt);
  s.vx += t.x * world.accel * DT;
  s.vy += t.y * world.accel * DT;
  const f = Math.max(0, 1 - world.friction * DT);
  s.vx *= f; s.vy *= f;
  const sp = Math.hypot(s.vx, s.vy);
  if (sp > world.maxSpeed) { s.vx *= world.maxSpeed / sp; s.vy *= world.maxSpeed / sp; }
  let impact = 0;
  const r = world.r;
  // x axis
  s.x += s.vx * DT;
  if (s.x < r) { s.x = r; impact = Math.max(impact, Math.abs(s.vx)); s.vx = -s.vx * world.bounce; }
  else if (s.x > world.w - r) { s.x = world.w - r; impact = Math.max(impact, Math.abs(s.vx)); s.vx = -s.vx * world.bounce; }
  for (const wall of world.walls) {
    if (overlaps(s.x, s.y, r, wall)) {
      s.x = s.vx > 0 ? wall.x - r : wall.x + wall.w + r;
      impact = Math.max(impact, Math.abs(s.vx)); s.vx = -s.vx * world.bounce;
    }
  }
  // y axis
  s.y += s.vy * DT;
  if (s.y < r) { s.y = r; impact = Math.max(impact, Math.abs(s.vy)); s.vy = -s.vy * world.bounce; }
  else if (s.y > world.h - r) { s.y = world.h - r; impact = Math.max(impact, Math.abs(s.vy)); s.vy = -s.vy * world.bounce; }
  for (const wall of world.walls) {
    if (overlaps(s.x, s.y, r, wall)) {
      s.y = s.vy > 0 ? wall.y - r : wall.y + wall.h + r;
      impact = Math.max(impact, Math.abs(s.vy)); s.vy = -s.vy * world.bounce;
    }
  }
  if (impact >= world.hitSpeed) s.hits++;
  else impact = 0;
  return impact;
}

/**
 * Advance by deltaMs (whole milliseconds) in fixed steps. `tiltOfTick(k)` gives the tilt for global step k,
 * so the same signal gives the same path however the time is cut into frames (Property 13).
 * Returns the strongest impact seen.
 */
export function advanceBall(s, tiltOfTick, deltaMs, world) {
  const before = Math.floor((s.totalMs * 3) / 50);
  s.totalMs += Math.max(0, Math.round(finite(deltaMs)));
  const after = Math.floor((s.totalMs * 3) / 50);
  let strongest = 0;
  for (let k = before; k < after; k++) strongest = Math.max(strongest, stepBall(s, tiltOfTick(k), world));
  return strongest;
}

/** Feeds real frame times (fractions of a millisecond) to advanceBall in whole milliseconds, keeping the remainder. */
export function makeStepper(ball, world) {
  let acc = 0;
  return (dtMs, tilt) => {
    acc += Math.max(0, Math.min(100, finite(dtMs)));
    const ms = Math.floor(acc);
    acc -= ms;
    return advanceBall(ball, () => tilt, ms, world);
  };
}

// ---------------------------------------------------------------- vibration (haptics)
export const PATTERNS = {
  tick: [10],
  click: [18],
  thunk: [45],
  snap: [20, 25, 20],
  buzz: [60, 40, 60],
  bump: [100],
  rumble: [200, 100, 200, 100, 200, 100, 200],
  heartbeat: [50, 110, 50],
};
export const HAPTIC_CAPS = { maxPulseMs: 400, maxPerSecond: 4, maxTotalMs: 6000, maxRumbles: 1 };
/** The "on" parts of a pattern as [offsetMs, lengthMs]. Even indexes are on, odd are gaps. */
export function pulsesOf(pattern) {
  const out = [];
  let t = 0;
  pattern.forEach((ms, i) => { if (i % 2 === 0) out.push([t, ms]); t += ms; });
  return out;
}
/** Hot and cold: pulse interval in ms from 800 (far) down to 250 (inside the window). Never longer as it gets nearer. */
export function hotColdInterval(distanceDeg, windowDeg) {
  const d = Math.max(0, finite(distanceDeg, 40) - windowDeg / 2);
  const span = Math.max(1, 40 - windowDeg / 2);
  return Math.round(250 + 550 * clamp(d / span, 0, 1));
}
/** Accepts or drops buzz events so one Attempt never passes the caps. One limiter per Attempt. */
export class HapticLimiter {
  constructor(caps = HAPTIC_CAPS) { this.caps = caps; this.reset(); }
  reset() { this.starts = []; this.totalMs = 0; this.rumbles = 0; }
  /** @returns {number[]|null} the pattern to play, or null when the event is dropped. */
  offer(name, tMs) {
    const pattern = PATTERNS[name];
    if (!pattern) return null;
    const c = this.caps;
    const pulses = pulsesOf(pattern);
    if (pulses.some(([, len]) => len > c.maxPulseMs)) return null;
    if (name === 'rumble' && this.rumbles >= c.maxRumbles) return null;
    const total = pulses.reduce((a, [, len]) => a + len, 0);
    if (this.totalMs + total > c.maxTotalMs) return null;
    const mine = pulses.map(([off]) => tMs + off);
    // A long pattern (the rumble) puts pulses in the future, so check every one-second window of the
    // combined list, not only the one that ends at the new pulse.
    const all = [...this.starts, ...mine].sort((a, b) => a - b);
    for (const x of all) {
      if (all.filter((y) => y >= x && y < x + 1000).length > c.maxPerSecond) return null;
    }
    this.starts = all.filter((x) => x > tMs - 1000);
    this.totalMs += total;
    if (name === 'rumble') this.rumbles++;
    return pattern;
  }
}
/** Batch form for tests: events [{t, name}] in time order -> accepted [{t, name, pattern}]. */
export function planHaptics(events, enabled = true, caps = HAPTIC_CAPS) {
  if (!enabled) return [];
  const lim = new HapticLimiter(caps);
  const out = [];
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    const pattern = lim.offer(e.name, e.t);
    if (pattern) out.push({ t: e.t, name: e.name, pattern });
  }
  return out;
}

// ---------------------------------------------------------------- sound
export const SOUND_CAPS = { voices: 4, masterGain: 0.5, minNoteHz: 300 };
/** Recipes as data; kinds of source: noise (filtered), osc (sweep), mix (several). Durations are in ms. */
export const RECIPES = {
  tick: { ms: 20, parts: [{ type: 'noise', filter: 'bandpass', hz: 3000, ms: 4, gain: 0.8 }] },
  click: { ms: 30, parts: [{ type: 'noise', filter: 'bandpass', hz: 2400, ms: 8, gain: 0.8 }, { type: 'osc', wave: 'sine', from: 1800, to: 1800, ms: 15, gain: 0.4 }] },
  thunk: { ms: 160, parts: [{ type: 'osc', wave: 'sine', from: 140, to: 70, ms: 120, gain: 0.9 }, { type: 'osc', wave: 'triangle', from: 600, to: 400, ms: 40, gain: 0.5 }] },
  snap: { ms: 40, parts: [{ type: 'noise', filter: 'lowpass', hz: 4000, ms: 25, gain: 0.9 }] },
  zap: { ms: 140, parts: [{ type: 'osc', wave: 'sawtooth', from: 900, to: 300, ms: 120, gain: 0.35 }] },
  bump: { ms: 100, parts: [{ type: 'osc', wave: 'sine', from: 220, to: 160, ms: 80, gain: 0.8 }, { type: 'noise', filter: 'lowpass', hz: 1200, ms: 20, gain: 0.5 }] },
  rustle: { ms: 170, parts: [{ type: 'noise', filter: 'bandpass', hz: 2500, ms: 150, gain: 0.5 }] },
  creak: { ms: 420, parts: [{ type: 'osc', wave: 'sawtooth', from: 180, to: 150, ms: 400, gain: 0.25, wobbleHz: 9 }] },
  gutter: { ms: 320, parts: [{ type: 'noise', filter: 'lowpass', hz: 900, ms: 300, gain: 0.5 }] },
  note0: { ms: 420, parts: [{ type: 'osc', wave: 'triangle', from: NOTE_FREQS[0], to: NOTE_FREQS[0], ms: 400, gain: 0.8 }] },
  note1: { ms: 420, parts: [{ type: 'osc', wave: 'triangle', from: NOTE_FREQS[1], to: NOTE_FREQS[1], ms: 400, gain: 0.8 }] },
  note2: { ms: 420, parts: [{ type: 'osc', wave: 'triangle', from: NOTE_FREQS[2], to: NOTE_FREQS[2], ms: 400, gain: 0.8 }] },
  note3: { ms: 420, parts: [{ type: 'osc', wave: 'triangle', from: NOTE_FREQS[3], to: NOTE_FREQS[3], ms: 400, gain: 0.8 }] },
  note4: { ms: 420, parts: [{ type: 'osc', wave: 'triangle', from: NOTE_FREQS[4], to: NOTE_FREQS[4], ms: 400, gain: 0.8 }] },
  // synthesised stand-ins for the seven sound files of docs/SOUNDS.md (no laugh: a synth cannot do one)
  bell: { ms: 1800, parts: [{ type: 'osc', wave: 'sine', from: 880, to: 880, ms: 1800, gain: 0.55 }, { type: 'osc', wave: 'sine', from: 2217, to: 2217, ms: 900, gain: 0.25 }] },
  whisper: { ms: 1600, parts: [{ type: 'noise', filter: 'bandpass', hz: 1900, hzTo: 1300, ms: 1500, gain: 0.5, attack: 500 }] },
  wind: { ms: 2600, parts: [{ type: 'noise', filter: 'bandpass', hz: 500, hzTo: 1500, ms: 2500, gain: 0.6, attack: 1200 }] },
  rumble: { ms: 2200, parts: [{ type: 'osc', wave: 'sawtooth', from: 70, to: 55, ms: 2100, gain: 0.35, attack: 300, wobbleHz: 11 }, { type: 'noise', filter: 'lowpass', hz: 700, ms: 2100, gain: 0.45, attack: 300 }, { type: 'osc', wave: 'triangle', from: 240, to: 200, ms: 2000, gain: 0.25, attack: 400, wobbleHz: 7 }] },
  becoming: { ms: 3600, parts: [{ type: 'noise', filter: 'bandpass', hz: 400, hzTo: 1700, ms: 1500, gain: 0.5, attack: 1300 }, { type: 'osc', wave: 'sine', from: 196, to: 147, ms: 3300, gain: 0.5, attack: 1400 }] },
};
/** Batch form for tests: events [{t, name}] -> accepted; nothing without consent; never more than 4 voices at once. */
export function planSound(events, consent, caps = SOUND_CAPS) {
  if (!consent) return [];
  const out = [];
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    const rec = RECIPES[e.name];
    if (!rec) continue;
    const active = out.filter((o) => o.t + o.ms > e.t).length;
    if (active >= caps.voices) continue;
    out.push({ t: e.t, name: e.name, ms: rec.ms, gain: caps.masterGain });
  }
  return out;
}

// ---------------------------------------------------------------- light (photosensitivity)
/**
 * Luminance steps [{t, lum}] for the dark in "What moved", the torch and the candle fade. Fades only, at most
 * two changes in any second, a peak below full white (0.9), and one still step when the Player prefers reduced motion.
 */
export function dimPlan(kind, reducedMotion = false) {
  const top = 0.9;
  if (reducedMotion) return [{ t: 0, lum: 0.3 }];
  switch (kind) {
    case 'dark': return [{ t: 0, lum: top }, { t: 600, lum: 0.12 }, { t: 1400, lum: 0.12 }, { t: 2000, lum: top }];
    case 'torch': return [{ t: 0, lum: 0.1 }];
    case 'candle': return [{ t: 0, lum: top }, { t: 500, lum: 0.5 }];
    default: return [{ t: 0, lum: top }];
  }
}
/** Brightness changes in the worst one-second window of a plan (a fade counts once). */
export function worstChangesPerSecond(plan) {
  let worst = 0;
  for (let i = 0; i < plan.length; i++) {
    let n = 0;
    for (let j = i + 1; j < plan.length; j++) if (plan[j].t - plan[i].t < 1000 && plan[j].lum !== plan[j - 1].lum) n++;
    worst = Math.max(worst, n);
  }
  return worst;
}

// ---------------------------------------------------------------- breath (microphone loudness only)
export const BLOW_MIN_MS = 300;
export const BLOW_FLOOR = 0.08;
/** levels: [{t, level}] in time order. True only when some run above the threshold lasts at least 300 ms. */
export function blowDetect(levels, baseline = 0) {
  if (!Array.isArray(levels) || levels.length === 0) return false;
  const thr = Math.max(BLOW_FLOOR, 3 * finite(baseline));
  let start = null, last = null;
  for (const p of levels) {
    if (!p || !Number.isFinite(p.t) || !Number.isFinite(p.level)) { start = null; continue; }
    if (p.level > thr) {
      if (start === null) start = p.t;
      last = p.t;
      if (last - start >= BLOW_MIN_MS) return true;
    } else start = null;
  }
  return false;
}

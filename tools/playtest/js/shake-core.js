// Shared actions and Shake, pure logic (no DOM, no sensors), so it can be tested with node.
// An action (knock, shake a chair, wind, big door) needs a number of Players acting together inside a short window.
// What a phone feels from an action depends on where the phones are: near is strong, far is soft, facing away is sound only.

/** How many different Players an action needs, and the window they must act inside (ms). */
export const ACTIONS = Object.freeze({
  knock: { need: 1, label: 'Knock' },
  chair: { need: 2, label: 'Shake the chair' },
  wind: { need: 2, label: 'Wind through the window' },
  bigDoor: { need: 3, label: 'Big door' },
});
export const WINDOW_MS = 2000;

/** The room is 10 m by 10 m. Where each action happens, in metres. */
export const ROOM_SIZE = 10;
export const SPOTS = Object.freeze({
  knock: { x: 5, y: 0.4, name: 'door' },
  chair: { x: 5, y: 5, name: 'chair' },
  wind: { x: 9.6, y: 5, name: 'window' },
  bigDoor: { x: 0.4, y: 5, name: 'big door' },
});

/** A position a phone reports: numbers only, kept inside the room, facing 0 to 359. Anything else gives null. */
export function cleanPos(p) {
  if (!p || typeof p !== 'object' || ![p.x, p.y, p.facing].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const c = (n) => Math.round(Math.min(ROOM_SIZE, Math.max(0, n)) * 100) / 100;
  return { x: c(p.x), y: c(p.y), facing: ((Math.round(p.facing) % 360) + 360) % 360 };
}

/**
 * Counts Players acting together. One Player counts once, however often they act.
 * @returns {{ add(id: string, t: number): { fired: boolean, count: number, need: number, who: string[] }, reset(): void }}
 */
export function makeTogether(action, windowMs = WINDOW_MS) {
  const need = ACTIONS[action]?.need ?? Infinity;
  let acts = new Map(); // player id -> time of their latest act
  return {
    add(id, t) {
      for (const [k, at] of acts) if (t - at > windowMs) acts.delete(k);
      acts.set(id, t);
      const who = [...acts.keys()];
      if (who.length >= need) { acts = new Map(); return { fired: true, count: who.length, need, who }; }
      return { fired: false, count: who.length, need, who };
    },
    reset() { acts = new Map(); },
  };
}

/** Shake detection from motion: `jolts` sudden changes of at least `min` m/s² inside `withinMs` is one shake; it then rests for `restMs`. */
export const SHAKE = Object.freeze({ min: 8, jolts: 3, withinMs: 1000, restMs: 1200 });
export function makeShakeDetector(opts = {}) {
  const o = { ...SHAKE, ...opts };
  let hits = [];
  let restUntil = -Infinity;
  return {
    /** @returns {boolean} true when this reading completes a shake */
    motion(t, change) {
      if (t < restUntil || !(change >= o.min)) return false;
      hits = hits.filter((h) => t - h <= o.withinMs);
      hits.push(t);
      if (hits.length < o.jolts) return false;
      hits = [];
      restUntil = t + o.restMs;
      return true;
    },
  };
}

/** What a phone feels. Positions are metres on the room's floor plan; `facing` is degrees (0 = east, 90 = south). */
export const REACH = Object.freeze({ near: 2.5, far: 6 });
/**
 * What the phone at `to` gets from an action at `from`.
 * level: 'strong' (near), 'soft' (far), 'none' (out of reach); a phone facing away from the source gets only 'faint' (sound, no buzz or picture).
 * @returns {{ level: 'strong' | 'soft' | 'faint' | 'none', meters: number, buzz: boolean, picture: boolean, sound: number }}
 */
export function feel(from, to) {
  const meters = Math.hypot(to.x - from.x, to.y - from.y);
  const base = meters <= REACH.near ? 'strong' : meters <= REACH.far ? 'soft' : 'none';
  if (base === 'none') return { level: 'none', meters, buzz: false, picture: false, sound: 0 };
  const bearing = (Math.atan2(from.y - to.y, from.x - to.x) * 180) / Math.PI; // from the phone to the source
  const off = Math.abs((((bearing - to.facing) % 360) + 540) % 360 - 180); // 0 = looking right at it
  if (off > 100) return { level: 'faint', meters, buzz: false, picture: false, sound: 0.2 };
  return { level: base, meters, buzz: base === 'strong', picture: true, sound: base === 'strong' ? 1 : 0.5 };
}

/**
 * What a shared action leaves behind in the room, so a phone that joins late sees it. The big door swings open and shut each time it
 * fires; the chair moves one step each time (0 to 3, then back to its place); the knock and the wind leave nothing.
 */
export const CHAIR_STEPS = 4;
export const INITIAL_STATE = Object.freeze({ bigDoor: 'shut', chair: 0 });
export function applyAction(state, action) {
  const s = { ...INITIAL_STATE, ...state };
  if (action === 'bigDoor') s.bigDoor = s.bigDoor === 'open' ? 'shut' : 'open';
  else if (action === 'chair') s.chair = (s.chair + 1) % CHAIR_STEPS;
  return s;
}
/** Keep only what a stored state may hold, so a bad store cannot hand a phone anything else. */
export function cleanState(st) {
  const chair = Number.isInteger(st?.chair) && st.chair >= 0 && st.chair < CHAIR_STEPS ? st.chair : 0;
  return { bigDoor: st?.bigDoor === 'open' ? 'open' : 'shut', chair };
}

// ---------------------------------------------------------------- facing from the phone's own orientation (Requirement 25.6)
// The plan's facing is degrees with 0 = east and 90 = south (clockwise on screen). A phone knows a compass heading (0 = north, clockwise),
// or, without a compass, an arbitrary turn: so the demo asks the Player to face a known place (the door) and tap Set once, and the
// difference between the two is kept. Nothing is recorded; only the facing number goes out, and the room cleans it (`cleanPos`).
const norm = (d) => ((d % 360) + 360) % 360;
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * A heading in degrees (0 to 359, clockwise) from a `deviceorientation` reading: the iPhone's `webkitCompassHeading` if it has one,
 * else `360 - alpha` (alpha turns the other way). `null` when the reading holds neither.
 */
export function headingOf(e) {
  if (e && isNum(e.webkitCompassHeading)) return norm(e.webkitCompassHeading);
  if (e && isNum(e.alpha)) return norm(360 - e.alpha);
  return null;
}

/** The smallest signed turn from `a` to `b`, in degrees (-180 to 180]. */
export const turnBetween = (a, b) => 180 - norm(180 - (b - a));

/** The way from `from` to `to` on the plan, in the plan's facing degrees (0 = east, 90 = south). */
export function bearingOnPlan(from, to) {
  return norm((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI);
}

/**
 * Turns headings into plan facing. `set(heading, facing)` says "the phone reads `heading` now and faces `facing` on the plan" (face the door,
 * then tap Set); after that `facing(heading)` is the plan facing. Before it is set there is none (`null`), so the Turn control is used instead.
 * A reading is smoothed along the shortest way round, so a phone held steady does not jitter and 359 to 1 does not swing through 180.
 */
export function makeFacing(opts = {}) {
  const k = isNum(opts.smoothing) && opts.smoothing > 0 && opts.smoothing <= 1 ? opts.smoothing : 0.35;
  let offset = null;
  let smooth = null;
  return {
    get calibrated() { return offset !== null; },
    set(heading, facing) {
      if (!isNum(heading) || !isNum(facing)) return false;
      offset = norm(facing - heading);
      smooth = null;
      return true;
    },
    facing(heading) {
      if (offset === null || !isNum(heading)) return null;
      smooth = smooth === null ? heading : norm(smooth + k * turnBetween(smooth, heading));
      return Math.round(norm(smooth + offset));
    },
    clear() { offset = null; smooth = null; },
  };
}

/** Whether a new facing is worth sending: it turned at least `minDeg`, or it is the first, and `minMs` have passed since the last one sent. */
export const FACING_REPORT = Object.freeze({ minDeg: 12, minMs: 500 });
export function makeFacingReporter(opts = {}) {
  const o = { ...FACING_REPORT, ...opts };
  let last = null; // { facing, t }
  return {
    shouldSend(facing, t) {
      if (!isNum(facing) || !isNum(t)) return false;
      if (last !== null && (t - last.t < o.minMs || Math.abs(turnBetween(last.facing, facing)) < o.minDeg)) return false;
      last = { facing, t };
      return true;
    },
    reset() { last = null; },
  };
}

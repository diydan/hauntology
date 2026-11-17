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

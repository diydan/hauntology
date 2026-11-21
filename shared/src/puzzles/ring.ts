/**
 * The Clue ring as plain maths (puzzles Requirement 15, tasks 10.6 and 10.8): which clues are read as the view turns, when the ring ends, where the
 * arrow points and how often it may draw. Pure: no clock, no sensor, no `Math.random`; the time comes in as a step, so the result depends on how
 * long the view stayed and never on how often the phone reported. Nothing here is sent or stored, and nothing here reads a Hand, a Residue or a
 * Solution: the ring changes how a Sight is shown and never what it says.
 */
import { clueAngle, stepClue, UNREAD, type ClueRead, type View } from "./read";
import { placeClues, type SpiritClue } from "./clues";
import { hash } from "./rng";
import type { Sight } from "./types";

/** The most clues drawn at once (Requirement 15.9). */
export const RING_MAX_DRAWN = 12;
/** At most 30 frames a second: the least gap between two draws, rounded up so the rate is never above 30. */
export const RING_MIN_FRAME_MS = Math.ceil(1000 / 30);
/** The ring replaces the 5 seconds of a Sight: 30 seconds, 45 with Assist (Requirement 15.6). */
export const RING_MS = 30_000;
export const RING_MS_ASSIST = 45_000;
/** With nothing read for this long and a clue unread, the arrow shows (Requirement 15.7). */
export const ARROW_AFTER_MS = 3000;

export type RingState = Readonly<{
  reads: Readonly<Record<string, ClueRead>>;
  /** Time since the last clue was read (or since the ring opened), counted while the view is awake. */
  idleMs: number;
  /** Time the ring has been open, counted while the view is awake (face down or hidden pauses it: a Player is never run out of time by a pocket). */
  openMs: number;
}>;

export const startRing = (clues: readonly SpiritClue[]): RingState => ({ reads: Object.fromEntries(clues.map((c) => [c.id, UNREAD])), idleMs: 0, openMs: 0 });

export const readSet = (s: RingState): ReadonlySet<string> => new Set(Object.entries(s.reads).filter(([, r]) => r.read).map(([id]) => id));

/** The clues that are drawn: at most RING_MAX_DRAWN, in their given order. */
export const drawnClues = (clues: readonly SpiritClue[]): readonly SpiritClue[] => clues.slice(0, RING_MAX_DRAWN);

/**
 * One step of looking: `view` is where the middle of the screen points (null when the phone gives nothing), `dtMs` the time since the last step.
 * A clue is read after 0.7 s of steady looking, falls back in 1.4 s when the view leaves, and once read stays read (`stepClue`).
 * Returns the new state and the ids read in this step, so the screen buzzes once for each.
 */
export function stepRing(s: RingState, clues: readonly SpiritClue[], view: View | null, dtMs: number, awake = true): { state: RingState; newlyRead: string[] } {
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  if (!awake || dt === 0) return { state: s, newlyRead: [] };
  const reads: Record<string, ClueRead> = { ...s.reads };
  const newlyRead: string[] = [];
  for (const c of drawnClues(clues)) {
    const before = reads[c.id] ?? UNREAD;
    const next = stepClue(before, view === null ? Math.PI : clueAngle(view, c), dt);
    reads[c.id] = next;
    if (next.read && !before.read) newlyRead.push(c.id);
  }
  return { state: { reads, idleMs: newlyRead.length > 0 ? 0 : s.idleMs + dt, openMs: s.openMs + dt }, newlyRead };
}

/** "Show all as text": every clue read at once (the text way in, so a Lock never needs the Player to turn round). */
export function showAllRead(s: RingState): RingState {
  return { reads: Object.fromEntries(Object.keys(s.reads).map((id) => [id, { progress: 1, read: true }])), idleMs: 0, openMs: s.openMs };
}

export const allRead = (s: RingState): boolean => Object.values(s.reads).every((r) => r.read);

/** The ring ends when the Player taps Done, every clue is read, or 30 seconds (45 with Assist) have passed. */
export function ringDone(s: RingState, assist: boolean, tappedDone: boolean): boolean {
  return tappedDone || allRead(s) || s.openMs >= (assist ? RING_MS_ASSIST : RING_MS);
}

export type Arrow = Readonly<{ show: boolean; clueId: string | null; /** Radians on the screen: 0 to the right, counter-clockwise, so pi/2 is up. */ angle: number }>;
const NO_ARROW: Arrow = { show: false, clueId: null, angle: 0 };
const wrapPi = (x: number): number => { let t = x % (2 * Math.PI); if (t > Math.PI) t -= 2 * Math.PI; if (t <= -Math.PI) t += 2 * Math.PI; return t; };

/** The arrow at the edge of the view towards the nearest unread clue, shown when nothing was read for 3 seconds and the Clue list is shut. */
export function arrowFor(s: RingState, clues: readonly SpiritClue[], view: View | null, listOpen: boolean): Arrow {
  if (listOpen || view === null || s.idleMs < ARROW_AFTER_MS) return NO_ARROW;
  let best: { id: string; gap: number; clue: SpiritClue } | null = null;
  for (const c of drawnClues(clues)) {
    if (s.reads[c.id]?.read) continue;
    const gap = clueAngle(view, c);
    if (best === null || gap < best.gap) best = { id: c.id, gap, clue: c };
  }
  if (best === null) return NO_ARROW;
  return { show: true, clueId: best.id, angle: Math.atan2(best.clue.height - view.height, wrapPi(best.clue.turn - view.turn)) };
}

export type RingPlan = Readonly<{ draw: boolean; still: boolean; awake: boolean }>;
/** At most 30 frames a second; nothing drawn (and no time counted) when face down or hidden; still (no pulse, no drift) under reduced motion. */
export function ringPlan(i: Readonly<{ faceDown: boolean; hidden: boolean; reducedMotion: boolean; now: number; lastDrawMs?: number }>): RingPlan {
  const awake = !i.faceDown && !i.hidden;
  const gapOk = i.lastDrawMs === undefined || !Number.isFinite(i.lastDrawMs) || !Number.isFinite(i.now) || i.now - i.lastDrawMs >= RING_MIN_FRAME_MS;
  return { draw: awake && gapOk, still: i.reducedMotion, awake };
}

/** A direction as the ring reads it: the turn (right positive) and height of a unit vector (x east, y up, -z ahead). */
export function viewOfDirection(d: Readonly<{ x: number; y: number; z: number }>): View {
  const len = Math.hypot(d.x, d.y, d.z) || 1;
  return { turn: Math.atan2(d.x, -d.z), height: Math.asin(Math.max(-1, Math.min(1, d.y / len))) };
}

/** Where a clue hangs in the scene (x east, y up, -z ahead) at `radius` metres from the Player. */
export function clueSpot(c: Pick<SpiritClue, "turn" | "height">, radius: number): { x: number; y: number; z: number } {
  return { x: radius * Math.cos(c.height) * Math.sin(c.turn), y: radius * Math.sin(c.height), z: -radius * Math.cos(c.height) * Math.cos(c.turn) };
}

/**
 * The clues a Sight becomes as a Clue ring, or null when the layer does not apply (Requirement 15.2 hangs the Safe code only). The ring is placed
 * from the Sight's own id and its code alone, so a phone that reconnects hangs the same ring and the Room is told nothing new (Requirement 15.8).
 */
export function ringForSight(sightId: string, sight: Pick<Sight, "payload">): SpiritClue[] | null {
  const p = sight.payload;
  if (p.kind !== "safe" || p.code.length < 1 || p.code.length > 7) return null;
  return placeClues(hash("spirit-sight", sightId), p.code);
}

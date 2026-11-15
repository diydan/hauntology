import { autoHintDue, distanceBand, nearestUnfound, relativeBearing } from "./hints";
import { ANCHOR_IDS, type Action, type Anchor, type AnchorId, type Directive, type GameState, type Memory, type Vec3 } from "./types";

/**
 * The reducer that decides the whole game (Requirements 3 and 4, ghost-engine design). It takes the state, one Action and where the visitor
 * is, and gives the next state and what the ghost is told to do. It never sees a line of narration, a memory's text or the model, so the
 * sequence of states for a sequence of actions and positions is the same however the words are made (Requirement 6.3). It does not read
 * the clock (`now` is a parameter) and does not import the `conditions` code: the real world changes words, never a state.
 */
export type StepContext = { anchors: readonly Anchor[]; pos: Vec3; yaw: number; now: number };
export type StepResult = { state: GameState; directive: Directive; /** The anchor whose memory is found on this turn, if any. */ revealed: AnchorId | null };

export const FOUND_TO_END = ANCHOR_IDS.length;

export function initialState(now: number, seedState: number): GameState {
  return { turn: 0, found: [], ended: false, idleTurns: 0, memories: [], history: [], llmTurns: 0, lastTurnAt: null, lastProgressAt: now, seedState };
}

const flat = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);

export function step(state: GameState, action: Action, ctx: StepContext): StepResult {
  const base: GameState = { ...state, turn: state.turn + 1, lastTurnAt: ctx.now };

  // Once the game has ended nothing changes any more: only the ghost's ambient words (Requirement 3.4).
  if (state.ended) return { state: { ...base, idleTurns: state.idleTurns + 1 }, directive: { kind: "ambient" }, revealed: null };

  // Text that tries to change the rules is answered in character, and changes nothing but the count of quiet turns.
  if (action.refuse === true) return { state: { ...base, idleTurns: state.idleTurns + 1 }, directive: { kind: "refuse" }, revealed: null };

  const nearest = nearestUnfound(ctx.anchors, state.found, ctx.pos);

  // A hint asked for: the nearest unfound anchor, in words of direction and distance only (Requirement 4.1).
  if (action.kind === "hint") {
    return { state: { ...base, idleTurns: state.idleTurns + 1 }, directive: nearest === null ? { kind: "ambient" } : { kind: "hint", bearing: relativeBearing(ctx.pos, ctx.yaw, nearest.anchor.pos), band: distanceBand(nearest.distance) }, revealed: null };
  }

  // Engaging, within reach of an unfound anchor: its memory is found (Requirement 3.1). If two are in reach, the nearer one.
  const inReach = ctx.anchors.filter((a) => !state.found.includes(a.id) && flat(a.pos, ctx.pos) <= a.radius).sort((a, b) => flat(a.pos, ctx.pos) - flat(b.pos, ctx.pos) || a.id.localeCompare(b.id));
  const reached = inReach[0];
  if (reached !== undefined) {
    const found = [...state.found, reached.id];
    const ended = found.length >= FOUND_TO_END;
    return { state: { ...base, found, ended, idleTurns: 0, lastProgressAt: ctx.now }, directive: ended ? { kind: "ending" } : { kind: "reveal", anchorId: reached.id }, revealed: reached.id };
  }

  // Engaging at an anchor already found: an echo, nothing changes (Requirement 3.3).
  const echoed = ctx.anchors.find((a) => state.found.includes(a.id) && flat(a.pos, ctx.pos) <= a.radius);
  if (echoed !== undefined) return { state: { ...base, idleTurns: state.idleTurns + 1 }, directive: { kind: "echo", anchorId: echoed.id }, revealed: null };

  // Away from every unfound anchor: a tease or an ambient line, and now and then a hint nobody asked for (Requirements 3.2 and 4.2).
  const idle = state.idleTurns + 1;
  if (nearest !== null && autoHintDue({ idleTurns: idle, lastProgressAt: state.lastProgressAt }, ctx.now)) {
    return { state: { ...base, idleTurns: 0, lastProgressAt: ctx.now }, directive: { kind: "hint", bearing: relativeBearing(ctx.pos, ctx.yaw, nearest.anchor.pos), band: distanceBand(nearest.distance) }, revealed: null };
  }
  const band = nearest === null ? null : distanceBand(nearest.distance);
  return { state: { ...base, idleTurns: idle }, directive: band === null || band === "far" ? { kind: "ambient" } : { kind: "tease", band }, revealed: null };
}

/** The state with one memory added (its text comes from the narrator, never from the engine). */
export const withMemory = (state: GameState, memory: Memory): GameState => ({ ...state, memories: [...state.memories.filter((m) => m.anchorId !== memory.anchorId), memory] });

/** The last 8 lines of the talk, for a restore after a reload (Requirement 1.4). */
export const HISTORY_KEEP = 16;
export const withHistory = (state: GameState, visitor: string, ghost: string): GameState => ({
  ...state,
  history: [...state.history, ...(visitor === "" ? [] : [{ role: "visitor" as const, text: visitor }]), { role: "ghost" as const, text: ghost }].slice(-HISTORY_KEEP),
});

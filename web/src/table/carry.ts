import { applyDrop, roomAtPoint } from "@hauntology/shared/table/marks";
import { chainUnrest, deformVertices, makeChain, stepChain, type Chain } from "@hauntology/shared/table/rag";
import type { Theory } from "@hauntology/shared/party/theory";
import { STANDEE_HEIGHT, type RoomPiece, type TableModel } from "./model";
import { planePoint, type Ray } from "./picking";

/**
 * Drag to mark (spirit-table Requirement 9): the finger gesture, where a carried Suspect would land, what a drop does to the Player's own
 * Theory marks, and the rag doll that hangs from the finger. No DOM and no WebGL: it takes pointer positions and rays and gives back
 * numbers, so jsdom can prove it. The mark is the notebook's own `setTheory` through `applyDrop`, so the drag and the Table list's room
 * choice can never disagree.
 */

/** A finger must move more than this many CSS pixels before a touch on a Suspect picks it up (9.1). */
export const DRAG_THRESHOLD_PX = 8;
/** How high a carried Suspect hangs above the board, in board units (the mockup's lift). */
export const LIFT = 0.062;
/** The finger holds the head, which is this high above the board. */
export const HEAD_HEIGHT = STANDEE_HEIGHT + LIFT;
/** The rag doll is upright and still this long after letting go at most (9.4). */
export const STAND_UP_LIMIT_S = 2;

// ------------------------------------------------------------------ the gesture

export type Gesture =
  | Readonly<{ phase: "idle" }>
  | Readonly<{ phase: "down"; x: number; y: number; suspect: string | null }>
  | Readonly<{ phase: "turn"; x: number; y: number }>
  | Readonly<{ phase: "carry"; suspect: string }>;

export type GestureEvent =
  | Readonly<{ type: "down"; x: number; y: number; suspect: string | null }>
  | Readonly<{ type: "move"; x: number; y: number }>
  | Readonly<{ type: "up" }>
  | Readonly<{ type: "cancel" }>;

/** What the caller does about an event: pick the piece under the finger (a tap), turn the view by a drag, start or move a carry, or drop. */
export type GestureEffect =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "tap" }>
  | Readonly<{ kind: "turn"; dx: number; dy: number }>
  | Readonly<{ kind: "carry_start"; suspect: string }>
  | Readonly<{ kind: "carry_move" }>
  | Readonly<{ kind: "drop"; suspect: string }>
  | Readonly<{ kind: "cancel_carry"; suspect: string }>;

export const IDLE: Gesture = { phase: "idle" };
const NONE: GestureEffect = { kind: "none" };

/**
 * A touch that starts on a Suspect and moves more than 8 pixels picks it up and does not turn the view; one that comes up without moving
 * is a tap that picks the piece (9.1). A touch that starts elsewhere turns the view when it moves (drag view) and is a tap when it does not.
 */
export function gestureStep(g: Gesture, e: GestureEvent): { state: Gesture; effect: GestureEffect } {
  switch (e.type) {
    case "down":
      if (![e.x, e.y].every(Number.isFinite)) return { state: IDLE, effect: NONE };
      return { state: { phase: "down", x: e.x, y: e.y, suspect: e.suspect }, effect: NONE };
    case "move": {
      if (![e.x, e.y].every(Number.isFinite)) return { state: g, effect: NONE };
      if (g.phase === "carry") return { state: g, effect: { kind: "carry_move" } };
      if (g.phase === "turn") return { state: { phase: "turn", x: e.x, y: e.y }, effect: { kind: "turn", dx: e.x - g.x, dy: e.y - g.y } };
      if (g.phase !== "down") return { state: g, effect: NONE };
      if (Math.hypot(e.x - g.x, e.y - g.y) <= DRAG_THRESHOLD_PX) return { state: g, effect: NONE };
      if (g.suspect !== null) return { state: { phase: "carry", suspect: g.suspect }, effect: { kind: "carry_start", suspect: g.suspect } };
      return { state: { phase: "turn", x: e.x, y: e.y }, effect: { kind: "turn", dx: e.x - g.x, dy: e.y - g.y } };
    }
    case "up":
      if (g.phase === "carry") return { state: IDLE, effect: { kind: "drop", suspect: g.suspect } };
      return { state: IDLE, effect: g.phase === "down" ? { kind: "tap" } : NONE };
    case "cancel":
      return { state: IDLE, effect: g.phase === "carry" ? { kind: "cancel_carry", suspect: g.suspect } : NONE };
  }
}

// ------------------------------------------------------------------ where a drop lands and what it does

export type CarryTarget = Readonly<{
  /** Where the finger's ray meets the flat plane at the Suspect's head. */
  head: Readonly<{ x: number; z: number }>;
  /** The feet are straight below the head, in front of the finger on the screen. */
  feet: Readonly<{ x: number; z: number }>;
  /** The room under the FEET: the one that lights up and the one a drop marks. */
  room: RoomPiece | null;
}>;

/** The finger's ray is cut with a flat plane at the height of the head, and the Suspect hangs below that point (9.1). */
export function carryTarget(m: TableModel, finger: Ray): CarryTarget | null {
  const p = planePoint(finger, HEAD_HEIGHT);
  if (!p) return null;
  const slot = roomAtPoint(p.x, p.z);
  const room = slot ? m.rooms.find((r) => r.slot.c === slot.c && r.slot.r === slot.r) ?? null : null;
  return { head: { x: p.x, z: p.z }, feet: { x: p.x, z: p.z }, room };
}

export type DropOutcome = Readonly<{ theory: Theory; change: "set" | "cleared" | "none"; zone: string | null; say: string }>;

/**
 * Let go over a room: the Suspect gets that one room as its Theory mark. Let go anywhere else: the mark is taken back and the Suspect goes
 * to the Line-up. Only this Suspect's own mark changes, and the notebook's `setTheory` does it (9.2, 9.3). `say` is the text for the card.
 */
export function dropOutcome(m: TableModel, theory: Theory, suspect: string, target: CarryTarget | null): DropOutcome {
  const name = m.suspects.find((s) => s.card === suspect)?.name ?? "This suspect";
  const zones = m.rooms.map((r) => r.zone);
  const zone = target?.room?.zone ?? null;
  const next = applyDrop(theory, suspect, zone, zones);
  const had = Object.hasOwn(theory, suspect);
  const change: DropOutcome["change"] = next === theory ? "none" : zone === null ? "cleared" : "set";
  const say =
    zone !== null && target?.room
      ? `${name}: maybe here, in the ${target.room.name}. Only you can see this.`
      : had ? `${name}: mark taken back. Back in the line-up.` : `${name}: back in the line-up.`;
  return { theory: next, change, zone, say };
}

// ------------------------------------------------------------------ the rag doll

export type DollMode = "idle" | "held" | "falling" | "settle";
const CHAIN_POINTS = 7;
const FLOOR_Y = 0.0052;
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/**
 * One Suspect's rag doll (9.1, 9.4): while held it hangs from the head so the body swings and bends as the finger moves; let go, it goes
 * limp and falls; then it stands back up and is still. `step` is called each frame with the time since the last. Under reduced motion there is
 * no chain: the Suspect lifts and drops with no swing, fall or wobble.
 */
export class RagDoll {
  mode: DollMode = "idle";
  /** Seconds since the figure was let go. */
  sinceRelease = 0;
  /** How high the figure is lifted, in board units. */
  lift = 0;
  chain: Chain | null = null;
  private u = 0;
  private wLag = 0;
  private fallT = 0;
  private settleT = 0;

  constructor(readonly height: number = STANDEE_HEIGHT, readonly reducedMotion = false) {}

  get busy(): boolean { return this.mode !== "idle"; }

  grab(): void {
    this.mode = "held";
    this.sinceRelease = 0; this.fallT = 0; this.settleT = 0; this.u = 0; this.wLag = 0;
    if (this.reducedMotion) { this.lift = LIFT; this.chain = null; return; }
    this.lift = 0;
    this.chain = makeChain(CHAIN_POINTS, this.height, 0, this.height);
  }

  release(): void {
    if (this.mode !== "held") return;
    this.sinceRelease = 0;
    if (this.reducedMotion || !this.chain) { this.mode = "idle"; this.lift = 0; this.chain = null; return; }
    this.mode = "falling"; this.fallT = 0;
  }

  /** Move the Suspect's own spot by (`along`, `depth`) board units since the last frame: along the picture's width and into it, so the body lags behind. */
  step(dt: number, along = 0, depth = 0): void {
    if (!(dt > 0) || this.mode === "idle") return;
    const h = Math.min(dt, 1 / 30);
    const ease = (k: number): number => Math.min(1, h * k);
    if (this.reducedMotion || !this.chain) return;
    const c = this.chain;
    if (this.mode === "held") {
      this.lift += (LIFT - this.lift) * ease(11);
      if (Number.isFinite(along)) this.u += along;
      if (Number.isFinite(depth)) this.wLag += (clamp((depth / Math.max(h, 1e-3)) * 0.055, -0.036, 0.036) - this.wLag) * ease(9);
      stepChain(c, h, { holdX: this.u, holdY: this.lift + this.height, pinned: true, restTopX: this.u, restTopY: this.height, floorY: FLOOR_Y });
      return;
    }
    this.sinceRelease += h;
    this.wLag *= Math.max(0, 1 - h * 16);
    if (this.mode === "falling") {
      this.fallT += h;
      this.lift += (0 - this.lift) * ease(14);
      stepChain(c, h, { pinned: false, restoreK: 0, restTopX: this.u, restTopY: this.height, floorY: FLOOR_Y });
      if ((c.p[1] ?? 0) <= this.height * 0 + FLOOR_Y + this.height * 0.18 || this.fallT >= 0.24) { this.mode = "settle"; this.settleT = 0; this.lift = 0; }
      return;
    }
    // settle: a brief slump, then a smooth rise in place, head first
    this.settleT += h;
    const k = clamp((this.settleT - 0.26) / 0.66, 0, 1);
    const restoreK = k * k * (3 - 2 * k);
    stepChain(c, h, { pinned: false, restoreK, restTopX: this.u, restTopY: this.height, floorY: FLOOR_Y });
    const { off, speed } = chainUnrest(c, this.u, this.height);
    if ((this.settleT > 0.96 && off < 0.0014 && speed < 8e-5 && Math.abs(this.wLag) < 4e-4) || this.settleT > 1.75) {
      this.mode = "idle"; this.chain = null; this.lift = 0; this.wLag = 0;
    }
  }

  /** Bend the flat picture `orig` (x sideways, y up, z 0; `height` tall, feet at 0) into `out`. With no chain it copies it, lifted by `lift`. */
  deform(orig: ArrayLike<number>, out: Float32Array | Float64Array): void {
    if (!this.chain) {
      for (let k = 0; k + 2 < orig.length; k += 3) { out[k] = orig[k] ?? 0; out[k + 1] = (orig[k + 1] ?? 0) + this.lift; out[k + 2] = orig[k + 2] ?? 0; }
      return;
    }
    deformVertices(this.chain, orig, out, this.height, this.height, this.u, 0, this.wLag);
  }
}

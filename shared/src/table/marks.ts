/**
 * Marks made by dragging a Suspect onto a room (spirit-table Requirement 9). Everything is in the board's own frame:
 * metres, x sideways, z towards the Player, the middle of the board at 0, 0. A drop on a room makes the Player's own Theory
 * mark; a drop anywhere else takes it back.
 */
import { setTheory, theoryOf, type Theory } from "../party/theory";

/** The board: three rooms across, two deep. */
export const BOARD = { W: 0.115, D: 0.095 } as const;
export type Board = Readonly<{ W: number; D: number }>;
/** Where the line-up stands: a tray in front of the board. */
export const LINEUP_SPACING = 0.062;
export const LINEUP_Z = BOARD.D + 0.017 + 0.0225 + 0.002;

/** A room, as its column (0 to 2, left to right) and row (0 at the back, 1 at the front). */
export type Slot = Readonly<{ c: number; r: number }>;

/** Which room a point on the board is over, or `null` for a point off the rooms (the tray, the table, not a number). */
export function roomAtPoint(x: number, z: number, board: Board = BOARD): Slot | null {
  const { W, D } = board;
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 1.5 * W || z < -D || z > D) return null;
  return { c: Math.min(2, Math.max(0, Math.floor((x + 1.5 * W) / W))), r: z < 0 ? 0 : 1 };
}

/** The middle of a room. */
export const roomCenter = (s: Slot, board: Board = BOARD): { x: number; z: number } => ({ x: (s.c - 1) * board.W, z: (s.r - 0.5) * board.D });

/** Where the i-th of n Suspects stands in the line-up. */
export function lineupPos(i: number, n: number, spacing: number = LINEUP_SPACING, z: number = LINEUP_Z): { x: number; z: number } {
  return { x: (i - (n - 1) / 2) * spacing, z };
}

/** Where the k-th marked Suspect stands inside a room, as an offset from the room's middle: three across, two rows. */
export function slotPos(k: number, board: Board = BOARD): { x: number; z: number } {
  return { x: ((k % 3) - 1) * board.W * 0.28, z: board.D * 0.15 - Math.floor(k / 3) * board.D * 0.3 };
}

/**
 * Drop a Suspect on a room (the Zone shown in that room, one of `zones`) to mark it, or anywhere else (`null`) to take the
 * mark back. The same `setTheory` the notebook uses, so the table and the notebook cannot disagree.
 */
export function applyDrop(theory: Theory, suspect: string, zone: string | null, zones: readonly string[]): Theory {
  return setTheory(theory, suspect, zone, zones);
}

export type Standing = Readonly<{ x: number; z: number; zone: string | null }>;

/**
 * Where each Suspect stands: in the room of its Theory mark (in a free place there, in the order of `suspects`), else in the
 * line-up in the order of `suspects`. `rooms` says which room shows which Zone. A Suspect is in a room only by its Theory mark.
 */
export function placeSuspects(theory: Theory, suspects: readonly string[], rooms: ReadonlyMap<string, Slot>, board: Board = BOARD): Map<string, Standing> {
  const out = new Map<string, Standing>(), count = new Map<string, number>();
  suspects.forEach((id, i) => {
    const zone = theoryOf(theory, id), slot = zone === undefined ? undefined : rooms.get(zone);
    if (zone === undefined || slot === undefined) {
      const lp = lineupPos(i, suspects.length);
      out.set(id, { x: lp.x, z: lp.z, zone: null });
      return;
    }
    const k = count.get(zone) ?? 0;
    count.set(zone, k + 1);
    const c = roomCenter(slot, board), o = slotPos(k, board);
    out.set(id, { x: c.x + o.x, z: c.z + o.z, zone });
  });
  return out;
}

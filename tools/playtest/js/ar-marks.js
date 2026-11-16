// The Player's own marks, made by dragging a character onto a room. Pure and small, so a test can run it.
// Everything is in the board's own frame (metres, x sideways, z towards the Player, the middle of the board at 0, 0).
// A mark is "maybe here": it is the Player's own guess, it lives on the phone only and it changes no rule.

// Which room a point is over: {c, r} (c 0 to 2 left to right, r 0 at the back and 1 at the front), or null.
export function roomAtPoint(x, z, W, D) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 1.5 * W || z < -D || z > D) return null;
  return { c: Math.min(2, Math.max(0, Math.floor((x + 1.5 * W) / W))), r: z < 0 ? 0 : 1 };
}

// Where the i-th of n characters stands in the line-up in front of the board.
export function lineupPos(i, n, spacing, z) { return { x: (i - (n - 1) / 2) * spacing, z }; }

// Where the k-th marked character stands inside a room, as an offset from the room's middle: three across, two rows.
export function slotPos(k, W, D) { return { x: ((k % 3) - 1) * W * 0.28, z: D * 0.15 - Math.floor(k / 3) * D * 0.3 }; }

// Drop a character on a room (a room id) to mark it, or anywhere else (null) to take the mark back. Returns a new object.
export function applyDrop(marks, id, room) {
  const next = { ...marks };
  if (room) next[id] = room; else delete next[id];
  return next;
}

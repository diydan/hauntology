import { Quaternion, Vector3 } from "three";
import { roomAtPoint } from "@hauntology/shared/table/marks";
import type { Vec3 } from "@hauntology/shared/table/place";
import { RELIC_SIZE, STANDEE_HEIGHT, STANDEE_WIDTH, WHISPER_PICTURE_HEIGHT, WHISPER_TAP_WIDTH, piecesOf, type Piece, type PieceId, type TableModel } from "./model";
import { worldToBoard, type Anchor, type Fov, type Quat } from "./view";

/**
 * Which piece is under a finger (spirit-table 4.5) and where a finger is over the board (9.1), from a ray in the Table's own frame.
 * A Pawn, a Suspect, a Relic or the Whisper is preferred to the room beneath it; the Whisper's tap area is narrower than her picture so
 * she does not block the rooms behind her. Standees turn about their up axis only to face the Player, so their tap area is a standing
 * rectangle facing the eye. No three.js scene and no WebGL: it is tested against plain numbers.
 */

export type Ray = Readonly<{ o: Vec3; d: Vec3 }>;

/** The ray of a point on the canvas (`nx`, `ny` in -1..1, y up) for a camera with this turn and field of view, in the world. */
export function worldRay(q: Quat, fov: Fov, nx: number, ny: number): Ray | null {
  if (![nx, ny, fov.vertical, fov.aspect].every(Number.isFinite)) return null;
  const tanV = Math.tan((fov.vertical * Math.PI) / 360);
  const d = new Vector3(nx * tanV * fov.aspect, ny * tanV, -1).normalize().applyQuaternion(new Quaternion(q.x, q.y, q.z, q.w));
  return { o: { x: 0, y: 0, z: 0 }, d: { x: d.x, y: d.y, z: d.z } };
}

/** A world ray in the Table's frame. */
export function rayToBoard(a: Anchor, r: Ray): Ray {
  const o = worldToBoard(a, r.o);
  const tip = worldToBoard(a, { x: r.o.x + r.d.x, y: r.o.y + r.d.y, z: r.o.z + r.d.z });
  return { o, d: { x: tip.x - o.x, y: tip.y - o.y, z: tip.z - o.z } };
}

const finiteRay = (r: Ray): boolean => [r.o.x, r.o.y, r.o.z, r.d.x, r.d.y, r.d.z].every(Number.isFinite);

/** Where the ray meets the horizontal plane at `height`, as a point of the board, or null (parallel, or behind the eye). */
export function planePoint(r: Ray, height: number): { x: number; z: number; t: number } | null {
  if (!finiteRay(r) || Math.abs(r.d.y) < 1e-9) return null;
  const t = (height - r.o.y) / r.d.y;
  return t > 0 ? { x: r.o.x + r.d.x * t, z: r.o.z + r.d.z * t, t } : null;
}

/** A standing rectangle facing the eye about the up axis, `w` wide, from `y0` to `y0 + h`: the distance along the ray, or null. */
function hitStanding(r: Ray, x: number, z: number, y0: number, w: number, h: number): number | null {
  const nx = r.o.x - x, nz = r.o.z - z, len = Math.hypot(nx, nz);
  if (len < 1e-9) return null;
  const ux = nx / len, uz = nz / len; // normal, horizontal, towards the eye
  const denom = r.d.x * ux + r.d.z * uz;
  if (Math.abs(denom) < 1e-9) return null;
  const t = -((r.o.x - x) * ux + (r.o.z - z) * uz) / denom;
  if (!(t > 0)) return null;
  const hx = r.o.x + r.d.x * t - x, hz = r.o.z + r.d.z * t - z, hy = r.o.y + r.d.y * t;
  const along = hx * uz - hz * ux;
  return Math.abs(along) <= w / 2 && hy >= y0 && hy <= y0 + h ? t : null;
}

function hitBox(r: Ray, x: number, z: number, size: number): number | null {
  let t0 = 0, t1 = Infinity;
  const slabs: [number, number, number, number][] = [[r.o.x, r.d.x, x - size / 2, x + size / 2], [r.o.y, r.d.y, 0, size], [r.o.z, r.d.z, z - size / 2, z + size / 2]];
  for (const [o, d, lo, hi] of slabs) {
    if (Math.abs(d) < 1e-12) { if (o < lo || o > hi) return null; continue; }
    let a = (lo - o) / d, b = (hi - o) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0 > 0 ? t0 : null;
}

export type Hit = Readonly<{ id: PieceId; t: number }>;

function pieceHit(r: Ray, p: Piece): number | null {
  switch (p.kind) {
    case "pawn": case "suspect": return hitStanding(r, p.pos.x, p.pos.z, 0, STANDEE_WIDTH, STANDEE_HEIGHT);
    case "relic": return hitBox(r, p.pos.x, p.pos.z, RELIC_SIZE);
    case "whisper": return hitStanding(r, p.pos.x, p.pos.z, p.height, WHISPER_TAP_WIDTH, WHISPER_PICTURE_HEIGHT);
    case "room": return null;
  }
}

/**
 * The piece under the ray: the nearest Pawn, Suspect, Relic or Whisper it passes through, else the room it meets on the floor, else null.
 * `only` limits the search to some kinds (a drag starts only on a Suspect).
 */
export function pickPiece(m: TableModel, r: Ray, only?: readonly Piece["kind"][]): PieceId | null {
  if (!finiteRay(r)) return null;
  let best: Hit | null = null;
  for (const p of piecesOf(m)) {
    if (p.kind === "room" || (only && !only.includes(p.kind))) continue;
    const t = pieceHit(r, p);
    if (t !== null && (best === null || t < best.t)) best = { id: p.id, t };
  }
  if (best) return best.id;
  if (only && !only.includes("room")) return null;
  const floor = planePoint(r, 0);
  const slot = floor ? roomAtPoint(floor.x, floor.z) : null;
  const room = slot ? m.rooms.find((x) => x.slot.c === slot.c && x.slot.r === slot.r) : undefined;
  return room ? room.id : null;
}

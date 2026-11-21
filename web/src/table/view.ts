import { Euler, MathUtils, Quaternion, Vector3 } from "three";
import { placeTable, type Heading2, type PlacedTable, type Vec3 } from "@hauntology/shared/table/place";
import { TABLE_SCALE } from "./model";

/**
 * Where the phone looks and where the Table stands, as plain maths (spirit-table 4.1 to 4.3, 4.6). The phone is at the world's middle and
 * looks along a unit direction; the Table is anchored at a point of that world, turned about its up axis to face the Player, and drawn at
 * `TABLE_SCALE`. Three degrees of freedom only: the Table never follows steps (4.2). No sensor, no DOM and no WebGL here.
 */

export type Orientation = Readonly<{ alpha: number | null; beta: number | null; gamma: number | null }>;
export type Quat = Readonly<{ x: number; y: number; z: number; w: number }>;
export type Anchor = Readonly<{ x: number; y: number; z: number; facing: number; heading: Heading2 }>;

const Q1 = new Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
const ZEE = new Vector3(0, 0, 1);
const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };
const rad = MathUtils.degToRad;
const asQuat = (q: Quaternion): Quat => ({ x: q.x, y: q.y, z: q.z, w: q.w });
const isNum = (n: number | null): n is number => typeof n === "number" && Number.isFinite(n);

/** The camera's turn from the phone's orientation (the same as three.js's own orientation controls), or null for a reading that is not a number. */
export function orientationQuat(o: Orientation, screenAngleDeg = 0): Quat | null {
  if (!isNum(o.alpha) || !isNum(o.beta) || !isNum(o.gamma)) return null;
  const q = new Quaternion().setFromEuler(new Euler(rad(o.beta), rad(o.alpha), -rad(o.gamma), "YXZ"));
  q.multiply(Q1);
  q.multiply(new Quaternion().setFromAxisAngle(ZEE, -rad(Number.isFinite(screenAngleDeg) ? screenAngleDeg : 0)));
  return asQuat(q);
}

export const DRAG_RAD_PER_PX = 0.005;
export const MAX_PITCH = rad(85);
export type DragView = Readonly<{ yaw: number; pitch: number }>;
export const START_VIEW: DragView = { yaw: 0, pitch: -0.45 };

/** Turn a drag view by a finger movement in CSS pixels: dragging right turns the view left, as a picture follows the finger. Never leaves 85 degrees of pitch. */
export function dragBy(v: DragView, dx: number, dy: number): DragView {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return v;
  return { yaw: v.yaw + dx * DRAG_RAD_PER_PX, pitch: Math.min(MAX_PITCH, Math.max(-MAX_PITCH, v.pitch + dy * DRAG_RAD_PER_PX)) };
}
export function dragQuat(v: DragView): Quat {
  return asQuat(new Quaternion().setFromEuler(new Euler(v.pitch, v.yaw, 0, "YXZ")));
}

/** The way a camera with this turn points: a unit vector, x east, y up, -z north. */
export function forwardOf(q: Quat = IDENTITY): Vec3 {
  const v = new Vector3(0, 0, -1).applyQuaternion(new Quaternion(q.x, q.y, q.z, q.w));
  return { x: v.x, y: v.y, z: v.z };
}

/**
 * The Place tap (4.1): read the way the phone points NOW, from the turn the Player is using (the sensor's or the drag's, never an earlier
 * view: the first mockup placed the Table behind the Player by reading the wrong one), and put the Table along it.
 */
export function placeAt(q: Quat, lastHeading: Heading2): PlacedTable {
  return placeTable(forwardOf(q), lastHeading);
}

/** Where the Table stands until the Player taps Place, and with no sensor: in front, a little below, facing them. */
export const DEFAULT_ANCHOR: Anchor = placeTable({ x: 0, y: -0.4, z: -1 }, { x: 0, z: -1 });

/** A point of the Table's own frame (board units) in the world. */
export function boardToWorld(a: Anchor, p: Vec3): Vec3 {
  const s = TABLE_SCALE, c = Math.cos(a.facing), sn = Math.sin(a.facing);
  return { x: a.x + (p.x * c + p.z * sn) * s, y: a.y + p.y * s, z: a.z + (-p.x * sn + p.z * c) * s };
}
/** A world point in the Table's frame. */
export function worldToBoard(a: Anchor, w: Vec3): Vec3 {
  const c = Math.cos(a.facing), sn = Math.sin(a.facing), dx = (w.x - a.x) / TABLE_SCALE, dz = (w.z - a.z) / TABLE_SCALE;
  return { x: dx * c - dz * sn, y: (w.y - a.y) / TABLE_SCALE, z: dx * sn + dz * c };
}

export type Fov = Readonly<{ vertical: number; aspect: number }>;
export const DEFAULT_FOV: Fov = { vertical: 55, aspect: 390 / 700 };

/**
 * Whether the middle of the Table is within the view, and where the arrow at the screen's edge should point: `angle` is the way to the
 * Table on the screen in radians, 0 to the right and counter-clockwise (so -pi/2 is down), from the view's own right and up.
 */
export function boardView(q: Quat, a: Anchor, fov: Fov = DEFAULT_FOV): { inView: boolean; angle: number } {
  const quat = new Quaternion(q.x, q.y, q.z, q.w).invert();
  const to = new Vector3(a.x, a.y, a.z).applyQuaternion(quat); // in the camera's own frame: x right, y up, -z ahead
  const ahead = -to.z;
  const halfV = rad(fov.vertical) / 2, halfH = Math.atan(Math.tan(halfV) * fov.aspect);
  const inView = ahead > 0.05 && Math.abs(Math.atan2(to.x, ahead)) <= halfH && Math.abs(Math.atan2(to.y, ahead)) <= halfV;
  return { inView, angle: Math.atan2(to.y, to.x) };
}

export const ARROW_AFTER_MS = 2000;
export type ArrowState = Readonly<{ outForMs: number; show: boolean }>;
export const ARROW_START: ArrowState = { outForMs: 0, show: false };
/** The "board" arrow (4.6): shown once the Table has been out of the view for 2 seconds, gone the moment it is back. */
export function stepArrow(s: ArrowState, inView: boolean, dtMs: number): ArrowState {
  if (inView) return ARROW_START;
  const out = s.outForMs + (Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0);
  return { outForMs: out, show: out >= ARROW_AFTER_MS };
}

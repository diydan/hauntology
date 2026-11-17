import type { Vec3 } from "../app/events";

/**
 * The world viewer's pure words (world-viewer design, "Components and interfaces").
 * Everything in `shared/src/viewer/` is a pure function over these types, so it can be
 * property-tested without a GPU; the three.js scene in `web/src/viewer` is thin glue.
 * Pure: no clock, no `Math.random`, no I/O.
 */
export type { Vec3 };

/** An axis-aligned box in scaled world units. The same shape as the manifest's `bounds`. */
export type Bounds = { min: Vec3; max: Vec3 };

/** A quaternion as the manifest stores it: `[x, y, z, w]`. */
export type Quat = readonly [number, number, number, number];

/** A 4x4 matrix in column-major order (the order of three.js `Matrix4.elements`). */
export type Mat4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

/** The player: an eye position and a heading. `yaw` is radians about +Y; yaw 0 faces -Z. */
export type PlayerState = { pos: Vec3; yaw: number };

export type MoveParams = {
  /** Walking speed in scaled world units per second (Requirement 2.3: 1.4). */
  walk: number;
  /** Sprint multiplier (Requirement 2.3: 1.6). */
  sprintMul: number;
  /** Eye height above `floorY`, held constant while moving. */
  eyeHeight: number;
  bounds: Bounds;
  floorY: number;
};

export type MoveInput = {
  /** -1 (back) to 1 (forward). */
  forward: number;
  /** -1 (left) to 1 (right). */
  strafe: number;
  sprint: boolean;
  /** Heading change for this step, in radians. Split it when a step is split. */
  yawDelta: number;
};

export type DeviceCaps = {
  mobile: boolean;
  memoryGb?: number;
  cores?: number;
  maxTexture: number;
  webgl2: boolean;
};

/** A discrete rendering tier; 0 is the lowest. */
export type QualityLevel = 0 | 1 | 2 | 3;
export const QUALITY_MIN: QualityLevel = 0;
export const QUALITY_MAX: QualityLevel = 3;

export type InputMode = "play" | "chat";

/** The events the input router folds into an `InputMode`. */
export type InputEvent = "open_chat" | "close_chat" | "move";

/** Requirement 2.3's numbers, in scaled world units. */
export const WALK_SPEED = 1.4;
export const SPRINT_MUL = 1.6;
/** A frame longer than this is clamped, so a hitch cannot teleport the player (design: 50 ms). */
export const MAX_DT_MS = 50;
/** The ghost is never placed closer than this to the player (Requirement 3.4). */
export const GHOST_MIN_DISTANCE = 1.2;

/** A finite number, or the fallback when the value is missing or not finite. */
export const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

export const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, value));

export const clamp01 = (value: number): number => clamp(value, 0, 1);

/** Clamps a position into the bounds, component by component. Non-finite parts become the min corner. */
export function clampToBounds(pos: Vec3, bounds: Bounds): Vec3 {
  return [
    clamp(finiteOr(pos[0], bounds.min[0]), bounds.min[0], bounds.max[0]),
    clamp(finiteOr(pos[1], bounds.min[1]), bounds.min[1], bounds.max[1]),
    clamp(finiteOr(pos[2], bounds.min[2]), bounds.min[2], bounds.max[2]),
  ];
}

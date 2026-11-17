import { PITCH_LIMIT, type LookState } from "@hauntology/shared/viewer/atmosphere";
import { clamp, finiteOr, type MoveInput } from "@hauntology/shared/viewer/types";

/**
 * Turning hands into `MoveInput` (world-viewer tasks 4.1, 4.2; Requirements 2.1, 2.2),
 * as pure folds the scene glue feeds: the keys held, pointer movement, and a touch
 * stick's offset. The DOM parts (pointer lock, touch zones, informing the shell)
 * stay in `mount.ts`; everything here is tested without a browser.
 */

const FORWARD = ["KeyW", "ArrowUp"];
const BACK = ["KeyS", "ArrowDown"];
const LEFT = ["KeyA", "ArrowLeft"];
const RIGHT = ["KeyD", "ArrowRight"];
const SPRINT = ["ShiftLeft", "ShiftRight"];

const anyHeld = (keys: ReadonlySet<string>, codes: string[]): boolean => codes.some((c) => keys.has(c));

/** The movement axes for the keys held now. Opposing keys cancel. */
export function keyAxes(keys: ReadonlySet<string>): Pick<MoveInput, "forward" | "strafe" | "sprint"> {
  return {
    forward: (anyHeld(keys, FORWARD) ? 1 : 0) - (anyHeld(keys, BACK) ? 1 : 0),
    strafe: (anyHeld(keys, RIGHT) ? 1 : 0) - (anyHeld(keys, LEFT) ? 1 : 0),
    sprint: anyHeld(keys, SPRINT),
  };
}

/** Radians of view turn per pixel of pointer movement. */
export const LOOK_SENSITIVITY = 0.0025;

/** Folds pointer movement into the look: right turns right, up looks up, pitch clamped. */
export function applyLook(look: LookState, movementX: number, movementY: number, sensitivity: number = LOOK_SENSITIVITY): LookState {
  const sens = Math.max(0, finiteOr(sensitivity, LOOK_SENSITIVITY));
  return {
    yaw: finiteOr(look.yaw, 0) - finiteOr(movementX, 0) * sens,
    pitch: clamp(finiteOr(look.pitch, 0) - finiteOr(movementY, 0) * sens, -PITCH_LIMIT, PITCH_LIMIT),
  };
}

/**
 * The movement axes for a touch stick: the thumb's offset from where it landed,
 * over the stick's radius. Up on the screen is forward. Inside a small dead zone
 * the stick says nothing, so a resting thumb does not drift.
 */
export function stickAxes(dxPx: number, dyPx: number, radiusPx: number): Pick<MoveInput, "forward" | "strafe"> {
  const r = radiusPx > 0 && Number.isFinite(radiusPx) ? radiusPx : 1;
  const x = clamp(finiteOr(dxPx, 0) / r, -1, 1);
  const y = clamp(finiteOr(dyPx, 0) / r, -1, 1);
  if (Math.hypot(x, y) < 0.12) return { forward: 0, strafe: 0 };
  return { forward: -y || 0, strafe: x || 0 };
}

/** One frame of input from every source at once; the stick wins over keys when it is held. */
export function combineInput(
  keys: ReadonlySet<string>,
  stick: Pick<MoveInput, "forward" | "strafe"> | null,
  yawDelta: number,
): MoveInput {
  const fromKeys = keyAxes(keys);
  const axes = stick && (stick.forward !== 0 || stick.strafe !== 0) ? { ...stick, sprint: false } : fromKeys;
  return { ...axes, yawDelta: finiteOr(yawDelta, 0) };
}

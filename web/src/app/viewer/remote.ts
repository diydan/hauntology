import { PITCH_LIMIT, type LookState } from "@hauntology/shared/viewer/atmosphere";
import { clamp, finiteOr, type MoveInput } from "@hauntology/shared/viewer/types";

/**
 * The walk the Host relays from the active Detective's phone (party-mode 8.3), as pure folds for the scene glue. A `remote_input` message
 * carries stick axes and a turn; the axes are held for a quarter of a second, so a Host that goes quiet (a dropped phone, a closed socket) stops
 * the walk instead of leaving the ghost hunter running into a wall. The turn counts once. Everyone's stick is the same stick: no Player is faster.
 */
export const REMOTE_HOLD_MS = 250;

export type RemoteInputMsg = Readonly<{ forward: number; strafe: number; yawDelta: number; pitchDelta: number }>;
export type RemoteFrame = Readonly<{ forward: number; strafe: number; yawDelta: number; pitchDelta: number }>;

export function createRemoteDrive(): { set(m: RemoteInputMsg, now: number): void; take(now: number): RemoteFrame } {
  let forward = 0, strafe = 0, until = 0, yaw = 0, pitch = 0;
  return {
    set(m, now) {
      forward = clamp(finiteOr(m.forward, 0), -1, 1);
      strafe = clamp(finiteOr(m.strafe, 0), -1, 1);
      until = now + REMOTE_HOLD_MS;
      yaw += finiteOr(m.yawDelta, 0);
      pitch += finiteOr(m.pitchDelta, 0);
    },
    take(now) {
      const live = now < until;
      const out = { forward: live ? forward : 0, strafe: live ? strafe : 0, yawDelta: yaw, pitchDelta: pitch };
      yaw = 0; pitch = 0;
      return out;
    },
  };
}

/** The look after a remote turn: yaw added as it is, pitch added and clamped like the pointer's. */
export function applyRemoteLook(look: LookState, frame: Pick<RemoteFrame, "yawDelta" | "pitchDelta">): LookState {
  return { yaw: finiteOr(look.yaw, 0) + frame.yawDelta, pitch: clamp(finiteOr(look.pitch, 0) + frame.pitchDelta, -PITCH_LIMIT, PITCH_LIMIT) };
}

/** The remote stick wins over the keys and the touch stick while it is held; otherwise the local input stands. Sprint is never remote. */
export function withRemote(local: MoveInput, frame: Pick<RemoteFrame, "forward" | "strafe">): MoveInput {
  if (frame.forward === 0 && frame.strafe === 0) return local;
  return { ...local, forward: frame.forward, strafe: frame.strafe, sprint: false };
}

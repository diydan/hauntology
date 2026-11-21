import type { Vec3 } from "@hauntology/shared/ghost/types";

/**
 * Pose reporting at no more than 4 Hz (ghost-engine 6.3, design: "V->>C: pose (4 Hz)"). The first pose goes at once; later ones inside the
 * interval are held, only the newest is kept, and it goes when the interval has passed. The clock and the timer are parameters.
 */
export const POSE_MIN_INTERVAL_MS = 250;
export type Pose = { pos: Vec3; yaw: number };
export type PoseLimiter = { push(pose: Pose): void; flush(): void; cancel(): void };

export function createPoseLimiter(input: {
  send: (pose: Pose) => void;
  now: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  minIntervalMs?: number;
}): PoseLimiter {
  const { send, now } = input;
  const interval = input.minIntervalMs ?? POSE_MIN_INTERVAL_MS;
  const setTimer = input.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = input.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let lastSent = Number.NEGATIVE_INFINITY;
  let held: Pose | null = null;
  let handle: unknown = null;

  const emit = (pose: Pose) => {
    lastSent = now();
    send(pose);
  };
  const release = () => {
    handle = null;
    if (held === null) return;
    const pose = held;
    held = null;
    emit(pose);
  };
  return {
    push(pose) {
      const wait = lastSent + interval - now();
      if (wait <= 0 && handle === null) return emit(pose);
      held = pose;
      if (handle === null) handle = setTimer(release, Math.max(0, wait));
    },
    flush() {
      if (handle !== null) clearTimer(handle);
      release();
    },
    cancel() {
      if (handle !== null) clearTimer(handle);
      handle = null;
      held = null;
    },
  };
}

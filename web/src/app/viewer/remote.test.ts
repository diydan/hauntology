import { describe, expect, it } from "vitest";
import { PITCH_LIMIT } from "@hauntology/shared/viewer/atmosphere";
import { applyRemoteLook, createRemoteDrive, REMOTE_HOLD_MS, withRemote } from "./remote";

describe("remote walk (party-mode 8.3)", () => {
  it("holds the axes for a quarter of a second and then lets go", () => {
    const d = createRemoteDrive();
    d.set({ forward: 1, strafe: -0.5, yawDelta: 0, pitchDelta: 0 }, 1000);
    expect(d.take(1000 + REMOTE_HOLD_MS - 1)).toMatchObject({ forward: 1, strafe: -0.5 });
    expect(d.take(1000 + REMOTE_HOLD_MS)).toMatchObject({ forward: 0, strafe: 0 });
  });
  it("counts a turn once, and adds turns that arrive between frames", () => {
    const d = createRemoteDrive();
    d.set({ forward: 0, strafe: 0, yawDelta: 0.1, pitchDelta: 0.02 }, 0);
    d.set({ forward: 0, strafe: 0, yawDelta: 0.2, pitchDelta: 0.02 }, 10);
    const a = d.take(20);
    expect(a.yawDelta).toBeCloseTo(0.3);
    expect(a.pitchDelta).toBeCloseTo(0.04);
    expect(d.take(30)).toMatchObject({ yawDelta: 0, pitchDelta: 0 });
  });
  it("never lets a bad number through", () => {
    const d = createRemoteDrive();
    d.set({ forward: Number.NaN, strafe: 9, yawDelta: Number.POSITIVE_INFINITY, pitchDelta: Number.NaN }, 0);
    expect(d.take(1)).toEqual({ forward: 0, strafe: 1, yawDelta: 0, pitchDelta: 0 });
  });
  it("clamps the pitch like the pointer", () => {
    expect(applyRemoteLook({ yaw: 1, pitch: 0 }, { yawDelta: 0.5, pitchDelta: 5 })).toEqual({ yaw: 1.5, pitch: PITCH_LIMIT });
    expect(applyRemoteLook({ yaw: 0, pitch: 0 }, { yawDelta: 0, pitchDelta: -5 }).pitch).toBe(-PITCH_LIMIT);
  });
  it("wins over the local input while held, and is never a sprint", () => {
    const local = { forward: -1, strafe: 1, sprint: true, yawDelta: 0.3 };
    expect(withRemote(local, { forward: 0.5, strafe: 0 })).toEqual({ forward: 0.5, strafe: 0, sprint: false, yawDelta: 0.3 });
    expect(withRemote(local, { forward: 0, strafe: 0 })).toBe(local);
  });
});

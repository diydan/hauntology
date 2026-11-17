import { describe, expect, it } from "vitest";
import { applyLook, combineInput, keyAxes, stickAxes } from "./controls";

const held = (...codes: string[]) => new Set(codes);

describe("controls mapping (world-viewer 4.1, 4.2)", () => {
  it("maps WASD and arrows, with opposing keys cancelling and Shift sprinting", () => {
    expect(keyAxes(held("KeyW"))).toEqual({ forward: 1, strafe: 0, sprint: false });
    expect(keyAxes(held("ArrowDown", "KeyA"))).toEqual({ forward: -1, strafe: -1, sprint: false });
    expect(keyAxes(held("KeyW", "KeyS", "ShiftLeft"))).toEqual({ forward: 0, strafe: 0, sprint: true });
    expect(keyAxes(held("KeyD", "ArrowLeft"))).toEqual({ forward: 0, strafe: 0, sprint: false });
    expect(keyAxes(held())).toEqual({ forward: 0, strafe: 0, sprint: false });
  });

  it("turns the look with the pointer and clamps the pitch", () => {
    const right = applyLook({ yaw: 0, pitch: 0 }, 100, 0);
    expect(right.yaw).toBeCloseTo(-0.25, 12);
    const up = applyLook({ yaw: 0, pitch: 0 }, 0, -100000);
    expect(up.pitch).toBeLessThanOrEqual(1.4);
    const down = applyLook({ yaw: 0, pitch: 0 }, 0, 100000);
    expect(down.pitch).toBeGreaterThanOrEqual(-1.4);
    expect(applyLook({ yaw: Number.NaN, pitch: Number.NaN }, Number.NaN, 5)).toEqual({ yaw: 0, pitch: -0.0125 });
  });

  it("reads a touch stick: up is forward, dead zone rests, offsets clamp", () => {
    expect(stickAxes(0, -50, 50)).toEqual({ forward: 1, strafe: 0 });
    expect(stickAxes(25, 0, 50)).toEqual({ forward: 0, strafe: 0.5 });
    expect(stickAxes(2, 2, 50)).toEqual({ forward: 0, strafe: 0 });
    expect(stickAxes(500, -500, 50)).toEqual({ forward: 1, strafe: 1 });
  });

  it("lets a held stick win over keys and passes the yaw change through", () => {
    expect(combineInput(held("KeyW"), { forward: -1, strafe: 0 }, 0.1)).toEqual({ forward: -1, strafe: 0, sprint: false, yawDelta: 0.1 });
    expect(combineInput(held("KeyW"), { forward: 0, strafe: 0 }, 0)).toEqual({ forward: 1, strafe: 0, sprint: false, yawDelta: 0 });
    expect(combineInput(held("KeyW", "ShiftLeft"), null, Number.NaN)).toEqual({ forward: 1, strafe: 0, sprint: true, yawDelta: 0 });
  });
});

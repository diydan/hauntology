import { describe, expect, it } from "vitest";
import { ARROW_AFTER_MS, ARROW_START, boardToWorld, boardView, DEFAULT_ANCHOR, dragBy, dragQuat, forwardOf, MAX_PITCH, orientationQuat, placeAt, stepArrow, worldToBoard, START_VIEW } from "./view";

const near = (a: number, b: number, d = 1e-6): void => expect(Math.abs(a - b)).toBeLessThan(d);

describe("orientationQuat", () => {
  it("looks north, level, when the phone is upright and points at north", () => {
    const f = forwardOf(orientationQuat({ alpha: 0, beta: 90, gamma: 0 })!);
    near(f.x, 0); near(f.y, 0); near(f.z, -1);
  });
  it("looks straight down when the phone lies flat, and turns west with alpha 90", () => {
    const d = forwardOf(orientationQuat({ alpha: 0, beta: 0, gamma: 0 })!);
    near(d.y, -1);
    const w = forwardOf(orientationQuat({ alpha: 90, beta: 90, gamma: 0 })!);
    near(w.x, -1); near(w.z, 0);
  });
  it("gives nothing for a reading that is not a number", () => {
    expect(orientationQuat({ alpha: null, beta: 90, gamma: 0 })).toBeNull();
    expect(orientationQuat({ alpha: Number.NaN, beta: 1, gamma: 2 })).toBeNull();
  });
});

describe("drag view", () => {
  it("turns with the finger and never past 85 degrees of pitch", () => {
    const v = dragBy(START_VIEW, 100, 0);
    expect(v.yaw).toBeGreaterThan(START_VIEW.yaw);
    expect(dragBy(START_VIEW, 0, 1e6).pitch).toBe(MAX_PITCH);
    expect(dragBy(START_VIEW, 0, -1e6).pitch).toBe(-MAX_PITCH);
    expect(dragBy(START_VIEW, Number.NaN, 3)).toBe(START_VIEW);
  });
  it("points where the yaw says", () => {
    const f = forwardOf(dragQuat({ yaw: Math.PI / 2, pitch: 0 }));
    near(f.x, -1); near(f.z, 0);
  });
});

describe("placeAt (aim before you place)", () => {
  it("puts the Table along the way the phone points NOW, at any compass heading, facing the Player", () => {
    for (const alpha of [0, 45, 98, 180, 270, 333]) {
      const q = orientationQuat({ alpha, beta: 70, gamma: 0 })!;
      const f = forwardOf(q);
      const p = placeAt(q, { x: 0, z: -1 });
      const flat = Math.hypot(f.x, f.z);
      // the Table is within a few degrees of the view's own heading, never behind
      const dot = (p.x * f.x + p.z * f.z) / (Math.hypot(p.x, p.z) * flat);
      expect(dot, `alpha ${alpha}`).toBeGreaterThan(0.999);
      expect(p.y).toBeLessThanOrEqual(-0.28 + 1e-9);
    }
  });
});

describe("board frame", () => {
  it("round-trips between the Table's frame and the world", () => {
    const a = placeAt(orientationQuat({ alpha: 120, beta: 75, gamma: 0 })!, { x: 0, z: -1 });
    const w = boardToWorld(a, { x: 0.2, y: 0.1, z: -0.07 });
    const b = worldToBoard(a, w);
    near(b.x, 0.2); near(b.y, 0.1); near(b.z, -0.07);
  });
  it("faces its front edge (+z) at the Player", () => {
    const a = placeAt(orientationQuat({ alpha: 200, beta: 70, gamma: 0 })!, { x: 0, z: -1 });
    const front = boardToWorld(a, { x: 0, y: 0, z: 0.45 });
    const back = boardToWorld(a, { x: 0, y: 0, z: -0.45 });
    expect(Math.hypot(front.x, front.z)).toBeLessThan(Math.hypot(back.x, back.z));
  });
});

describe("board in view and the arrow", () => {
  it("sees the Table straight ahead and not behind or far to the side", () => {
    const toward = dragQuat({ yaw: 0, pitch: Math.atan2(DEFAULT_ANCHOR.y, Math.hypot(DEFAULT_ANCHOR.x, DEFAULT_ANCHOR.z)) });
    expect(boardView(toward, DEFAULT_ANCHOR).inView).toBe(true);
    expect(boardView(dragQuat({ yaw: Math.PI, pitch: 0 }), DEFAULT_ANCHOR).inView).toBe(false);
    const side = boardView(dragQuat({ yaw: -Math.PI / 2, pitch: 0 }), DEFAULT_ANCHOR);
    expect(side.inView).toBe(false);
  });
  it("points the arrow towards the Table: turned away to the left, the Table is to the right", () => {
    const v = boardView(dragQuat({ yaw: Math.PI / 3, pitch: -0.3 }), DEFAULT_ANCHOR);
    expect(v.inView).toBe(false);
    expect(Math.cos(v.angle)).toBeGreaterThan(0); // to the right of the screen
  });
  it("shows only after 2 seconds out of view and is gone at once when back", () => {
    let s = ARROW_START;
    s = stepArrow(s, false, ARROW_AFTER_MS - 1);
    expect(s.show).toBe(false);
    s = stepArrow(s, false, 1);
    expect(s.show).toBe(true);
    s = stepArrow(s, true, 16);
    expect(s).toEqual(ARROW_START);
    expect(stepArrow(ARROW_START, false, Number.NaN).show).toBe(false);
  });
});

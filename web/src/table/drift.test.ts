import { describe, expect, it } from "vitest";
import { boardView, DEFAULT_FOV, orientationQuat, placeAt, stepArrow, ARROW_START, type Anchor, type Orientation } from "./view";

/**
 * Spike spirit-table 1.1 over a FAKE sensor (task 1.2): how the Table behaves when a phone's compass drifts. The real spike (drift of a real
 * phone over 30 seconds, size, battery, the camera prompt) needs a person with a phone; this run says what the MATHS does for a drift rate
 * the person will then measure, so the answer to "is Place enough" has a number to compare with. Written to docs/spikes/spirit-table-1.md
 * ("What a fake sensor says").
 */
const looking = (heading: number, beta = 80): Orientation => ({ alpha: heading, beta, gamma: 0 }); // alpha is the compass turn; beta 80: a phone held up, a little forward of upright
const quatOf = (o: Orientation) => orientationQuat(o, 0)!;
function placed(heading: number): Anchor {
  const q = quatOf(looking(heading));
  const p = placeAt(q, { x: 0, z: -1 });
  return { x: p.x, y: p.y, z: p.z, facing: p.facing, heading: p.heading };
}
/** Seconds until the Table leaves the view when the compass drifts by `rate` degrees a second after Place (a drift of 0 never leaves). */
function secondsToLeave(rate: number, limitS = 600): number {
  const anchor = placed(0);
  for (let t = 0; t <= limitS; t += 0.5) if (!boardView(quatOf(looking(rate * t)), anchor, DEFAULT_FOV).inView) return t;
  return Infinity;
}

describe("spike spirit-table 1.1 over a fake sensor: Place and compass drift", () => {
  it("a phone that does not drift keeps the Table in view for ever, and the same heading after Place sees it dead ahead", () => {
    expect(boardView(quatOf(looking(0)), placed(0)).inView).toBe(true);
    expect(secondsToLeave(0)).toBe(Infinity);
  });
  it("the Table is placed along where the phone points at the tap, so a view turned the other way does not see it", () => {
    const a = placed(0);
    expect(boardView(quatOf(looking(180)), a).inView).toBe(false);
    expect(boardView(quatOf(looking(90)), a).inView).toBe(false);
  });
  it("leaves the view after about half the field of view of drift: the numbers the real spike should compare with", () => {
    const half = Math.round((Math.atan(Math.tan((DEFAULT_FOV.vertical * Math.PI) / 360) * DEFAULT_FOV.aspect) * 180) / Math.PI);
    expect(half).toBeGreaterThanOrEqual(15);
    expect(half).toBeLessThanOrEqual(17); // about 16 degrees each side at 390 x 700
    // drift rates a phone compass may show, in degrees a second: the time until the Table is out of the view
    const t = { slow: secondsToLeave(0.2), usual: secondsToLeave(0.5), bad: secondsToLeave(2) };
    expect(t.slow).toBeGreaterThan(60);
    expect(t.usual).toBeGreaterThan(25);
    expect(t.usual).toBeLessThan(40);
    expect(t.bad).toBeLessThan(10);
    expect(t.slow).toBeGreaterThan(t.usual);
    expect(t.usual).toBeGreaterThan(t.bad);
  });
  it("shows the arrow 2 seconds after the Table leaves the view, which is what the Player sees when a drift has carried it away, and Place puts it right at once", () => {
    let s = ARROW_START;
    for (let i = 0; i < 19; i++) s = stepArrow(s, false, 100);
    expect(s.show).toBe(false);
    s = stepArrow(s, false, 100);
    expect(s.show).toBe(true);
    expect(stepArrow(s, true, 100)).toEqual(ARROW_START);
    // a tap on Place after a drift of 40 degrees puts the Table dead ahead again
    const drifted = quatOf(looking(40));
    expect(boardView(drifted, placed(0)).inView).toBe(false);
    expect(boardView(drifted, placed(40)).inView).toBe(true);
  });
});

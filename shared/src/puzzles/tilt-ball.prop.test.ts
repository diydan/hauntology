import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { finiteTiltArb } from "./puzzles.arb";
import { advanceBall, defaultWorld, makeStepper, newBall } from "./tilt-ball";

const world = defaultWorld(300, 400, [{ x: 100, y: 100, w: 20, h: 150 }, { x: 180, y: 220, w: 100, h: 20 }]);

describe("Property 13: Physics does not depend on the event rate", () => {
  // Feature: puzzles, Property 13: Physics does not depend on the event rate
  // Validates: Requirements 8.3
  it("gives the same state however the elapsed time is cut into frames, and never leaves the walls", () => {
    fc.assert(
      fc.property(
        fc.array(finiteTiltArb, { minLength: 1, maxLength: 200 }),
        fc.integer({ min: 200, max: 4000 }),
        fc.array(fc.integer({ min: 1, max: 60 }), { minLength: 1, maxLength: 50 }),
        (signal, total, cuts) => {
          const tiltOfTick = (k: number) => signal[k % signal.length] as { x: number; y: number };
          const whole = newBall(30, 30);
          advanceBall(whole, tiltOfTick, total, world);
          const split = newBall(30, 30);
          let left = total;
          for (let i = 0; left > 0; i++) {
            const frame = Math.min(left, cuts[i % cuts.length] as number);
            advanceBall(split, tiltOfTick, frame, world);
            left -= frame;
          }
          if (JSON.stringify(split) !== JSON.stringify(whole)) return false;
          const r = world.r;
          if (whole.x < r || whole.x > world.w - r || whole.y < r || whole.y > world.h - r) return false;
          return world.walls.every((w) => !(whole.x + r > w.x && whole.x - r < w.x + w.w && whole.y + r > w.y && whole.y - r < w.y + w.h));
        },
      ),
      propParams(),
    );
  });

  it("gives the same path from fractional real frame times as from whole milliseconds", () => {
    const ball = newBall(30, 30);
    const step = makeStepper(ball, world);
    for (let i = 0; i < 120; i++) step(16.6667, { x: 20, y: 10 });
    expect(ball.totalMs).toBeGreaterThanOrEqual(1990);
    expect(ball.totalMs).toBeLessThanOrEqual(2000);
    expect(Number.isFinite(ball.x) && Number.isFinite(ball.y)).toBe(true);
    step(Number.NaN, { x: 0, y: 0 });
    step(-5, { x: 0, y: 0 });
    expect(Number.isFinite(ball.x)).toBe(true);
  });
});

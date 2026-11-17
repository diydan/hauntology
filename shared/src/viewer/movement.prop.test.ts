import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { constrainToDisc, stepMovement } from "./movement";
import { MAX_DT_MS, SPRINT_MUL, WALK_SPEED, type MoveInput, type MoveParams, type Vec3 } from "./types";
import { boundsArb, finiteDouble, pointInBoundsArb, vec3Arb } from "./viewer.arb";

const inputArb: fc.Arbitrary<MoveInput> = fc.record({
  forward: finiteDouble(-1.5, 1.5),
  strafe: finiteDouble(-1.5, 1.5),
  sprint: fc.boolean(),
  yawDelta: finiteDouble(-0.5, 0.5),
});

const paramsFor = (bounds: MoveParams["bounds"]): MoveParams => ({
  walk: WALK_SPEED,
  sprintMul: SPRINT_MUL,
  eyeHeight: 1.6,
  bounds,
  floorY: bounds.min[1],
});

const inBounds = (p: Vec3, b: MoveParams["bounds"]): boolean =>
  p.every((v) => Number.isFinite(v)) &&
  p[0] >= b.min[0] && p[0] <= b.max[0] && p[1] >= b.min[1] && p[1] <= b.max[1] && p[2] >= b.min[2] && p[2] <= b.max[2];

describe("Property 2: Movement stays in bounds, never exceeds speed, and is frame-rate independent", () => {
  // Feature: world-viewer, Property 2: Movement stays in bounds, never exceeds speed, and is frame-rate independent
  // Validates: Requirements 2.3, 2.6
  it("keeps every position finite and inside the bounds, at eye height, over any input sequence", () => {
    fc.assert(
      fc.property(pointInBoundsArb(), fc.array(inputArb, { maxLength: 40 }), fc.array(finiteDouble(0, 200), { maxLength: 40 }),
        ({ bounds, pos }, inputs, dts) => {
          const params = paramsFor(bounds);
          let state = { pos, yaw: 0 };
          for (let i = 0; i < inputs.length; i++) {
            state = stepMovement(state, inputs[i] as MoveInput, dts[i] ?? 16, params);
            if (!inBounds(state.pos, bounds) || !Number.isFinite(state.yaw)) return false;
            if (Math.abs(state.pos[1] - Math.min(bounds.max[1], params.floorY + params.eyeHeight)) > 1e-9) return false;
          }
          return true;
        }),
      propParams(),
    );
  });

  it("never moves faster than walk x sprintMul in one clamped step", () => {
    fc.assert(
      fc.property(pointInBoundsArb(), inputArb, finiteDouble(0, 500), ({ bounds, pos }, input, dtMs) => {
        const params = paramsFor(bounds);
        const start: Vec3 = [pos[0], params.floorY + params.eyeHeight, pos[2]];
        const next = stepMovement({ pos: start, yaw: 0.7 }, input, dtMs, params);
        const dt = Math.min(dtMs, MAX_DT_MS) / 1000;
        const moved = Math.hypot(next.pos[0] - start[0], next.pos[2] - start[2]);
        return moved <= WALK_SPEED * SPRINT_MUL * dt + 1e-9;
      }),
      propParams(),
    );
  });

  it("one step of dt lands where two steps of dt/2 land, away from the walls", () => {
    fc.assert(
      fc.property(boundsArb(10), inputArb, finiteDouble(1, MAX_DT_MS), (bounds, input, dtMs) => {
        const params = paramsFor(bounds);
        const centre: Vec3 = [
          (bounds.min[0] + bounds.max[0]) / 2,
          params.floorY + params.eyeHeight,
          (bounds.min[2] + bounds.max[2]) / 2,
        ];
        const whole = stepMovement({ pos: centre, yaw: 0.3 }, input, dtMs, params);
        const half: MoveInput = { ...input, yawDelta: input.yawDelta / 2 };
        const split = stepMovement(stepMovement({ pos: centre, yaw: 0.3 }, half, dtMs / 2, params), half, dtMs / 2, params);
        const gap = Math.hypot(whole.pos[0] - split.pos[0], whole.pos[1] - split.pos[1], whole.pos[2] - split.pos[2]);
        return gap <= 0.02 && Math.abs(whole.yaw - split.yaw) <= 1e-12;
      }),
      propParams(),
    );
  });

  it("walks at 1.4 m/s and sprints at 1.6x, facing -Z at yaw 0", () => {
    const params = paramsFor({ min: [-50, 0, -50], max: [50, 5, 50] });
    const walked = stepMovement({ pos: [0, 1.6, 0], yaw: 0 }, { forward: 1, strafe: 0, sprint: false, yawDelta: 0 }, 50, params);
    expect(walked.pos[2]).toBeCloseTo(-WALK_SPEED * 0.05, 12);
    const sprinted = stepMovement({ pos: [0, 1.6, 0], yaw: 0 }, { forward: 1, strafe: 0, sprint: true, yawDelta: 0 }, 50, params);
    expect(sprinted.pos[2]).toBeCloseTo(-WALK_SPEED * SPRINT_MUL * 0.05, 12);
  });
});

describe("Property 4: Disc fallback confines and holds height", () => {
  // Feature: world-viewer, Property 4: Disc fallback confines and holds height
  // Validates: Requirements 2.5
  it("keeps the player within the radius of the spawn at constant eye height", () => {
    fc.assert(
      fc.property(vec3Arb(), fc.array(vec3Arb(-100, 100), { maxLength: 30 }), finiteDouble(0.1, 20), finiteDouble(0, 3),
        (spawn, moves, radius, eyeY) => {
          let pos = spawn;
          for (const move of moves) {
            pos = constrainToDisc([pos[0] + move[0], move[1], pos[2] + move[2]], spawn, radius, eyeY);
            if (Math.hypot(pos[0] - spawn[0], pos[2] - spawn[2]) > radius + 1e-9) return false;
            if (pos[1] !== eyeY) return false;
          }
          return true;
        }),
      propParams(),
    );
  });

  it("returns the spawn for a broken position", () => {
    expect(constrainToDisc([Number.NaN, 9, 9], [1, 2, 3], 5, 1.6)).toEqual([1, 1.6, 3]);
  });
});

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { MAX_TABLE_FPS, tablePlan } from "./plan";

describe("Property 6: The table obeys its limits", () => {
  // Feature: spirit-table, Property 6: The table obeys its limits
  // Validates: Requirements 4.3, 6.1
  it("caps frame rate to <= 30 fps, pauses when face down or hidden, and picks sensors/drag/list/still accurately", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.integer({ min: 0, max: 1_000_000 }),
        (sensors, tilt, faceDown, hidden, reducedMotion, webgl, now) => {
          const p = tablePlan({ sensors, tilt, faceDown, hidden, reducedMotion, webgl, now });
          if (p.frameMs < 33 || 1000 / p.frameMs > MAX_TABLE_FPS) return false;
          if ((faceDown || hidden || !webgl) && p.draw) return false;
          if (!faceDown && !hidden && webgl && !p.draw) return false;
          const expectedView = !webgl ? "list" : sensors && tilt ? "sensors" : "drag";
          if (p.view !== expectedView) return false;
          if (p.still !== reducedMotion) return false;

          // Throttle check: drawing a frame sooner than frameMs later returns draw: false
          const tooSoon = tablePlan({ sensors, tilt, faceDown: false, hidden: false, reducedMotion, webgl: true, now: now + p.frameMs - 1, lastDrawMs: now });
          const onTime = tablePlan({ sensors, tilt, faceDown: false, hidden: false, reducedMotion, webgl: true, now: now + p.frameMs, lastDrawMs: now });
          return !tooSoon.draw && onTime.draw;
        },
      ),
      propParams(),
    );
  });
});

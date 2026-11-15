import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { IDLE_MS_FOR_HINT, IDLE_TURNS_FOR_HINT, autoHintDue, distanceBand, nearestUnfound, relativeBearing } from "./hints";
import { narrate } from "./scripted";
import { BANDS, BEARINGS, VOICES, type Anchor, type Band, type Vec3 } from "./types";

describe("relativeBearing", () => {
  it("names the eight directions for a visitor facing -z (heading 0)", () => {
    const p: Vec3 = [0, 0, 0];
    const at = (x: number, z: number) => relativeBearing(p, 0, [x, 0, z]);
    expect(at(0, -5)).toBe("ahead");
    expect(at(5, -5)).toBe("ahead-right");
    expect(at(5, 0)).toBe("right");
    expect(at(5, 5)).toBe("behind-right");
    expect(at(0, 5)).toBe("behind");
    expect(at(-5, 5)).toBe("behind-left");
    expect(at(-5, 0)).toBe("left");
    expect(at(-5, -5)).toBe("ahead-left");
    expect(relativeBearing(p, 0, p)).toBe("ahead");
  });

  // Property 7
  it("Property: one of eight labels, and turning the heading by 45 degrees moves the label one step round", () => {
    const v = fc.double({ min: -50, max: 50, noNaN: true });
    fc.assert(
      fc.property(v, v, v, v, fc.double({ min: -7, max: 7, noNaN: true }), (px, pz, tx, tz, yaw) => {
        const player: Vec3 = [px, 0, pz];
        const target: Vec3 = [tx, 0, tz];
        const label = relativeBearing(player, yaw, target);
        expect((BEARINGS as readonly string[]).includes(label)).toBe(true);
        // skip a target on a sector edge, where a rounding of the turn can tip it either way
        const angle = Math.atan2((tx - px) * Math.cos(yaw) + (tz - pz) * -Math.sin(yaw), (tx - px) * -Math.sin(yaw) + (tz - pz) * -Math.cos(yaw));
        const edge = Math.abs(((angle / (Math.PI / 4)) % 1 + 1) % 1 - 0.5);
        fc.pre(edge > 1e-6 && Math.hypot(tx - px, tz - pz) > 1e-6);
        const turned = relativeBearing(player, yaw + Math.PI / 4, target);
        expect(BEARINGS.indexOf(turned)).toBe((BEARINGS.indexOf(label) + 1) % 8);
      }),
      { numRuns: 500, seed: 8501 },
    );
  });
});

describe("distanceBand", () => {
  it("is very close to 6 m, nearer to 15 m, far beyond, and never closer as the distance grows", () => {
    expect(distanceBand(0)).toBe("very close");
    expect(distanceBand(6)).toBe("very close");
    expect(distanceBand(6.01)).toBe("nearer");
    expect(distanceBand(15)).toBe("nearer");
    expect(distanceBand(15.01)).toBe("far");
    const rank = (b: Band) => BANDS.indexOf(b);
    fc.assert(fc.property(fc.double({ min: 0, max: 100, noNaN: true }), fc.double({ min: 0, max: 100, noNaN: true }), (a, b) => (a <= b ? rank(distanceBand(a)) <= rank(distanceBand(b)) : true)), { numRuns: 300, seed: 8502 });
  });
});

describe("autoHintDue", () => {
  // Property 8
  it("Property: true exactly at eight idle turns in a row or 90 seconds without progress", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 40 }), fc.integer({ min: 0, max: 400_000 }), (idleTurns, since) => {
        const now = 1_000_000;
        expect(autoHintDue({ idleTurns, lastProgressAt: now - since }, now)).toBe(idleTurns >= IDLE_TURNS_FOR_HINT || since >= IDLE_MS_FOR_HINT);
      }),
      { numRuns: 300, seed: 8503 },
    );
    expect(autoHintDue({ idleTurns: 7, lastProgressAt: 0 }, 89_999)).toBe(false);
    expect(autoHintDue({ idleTurns: 8, lastProgressAt: 0 }, 0)).toBe(true);
    expect(autoHintDue({ idleTurns: 0, lastProgressAt: 0 }, 90_000)).toBe(true);
  });
});

describe("hints are geometric words only (Requirement 4.3)", () => {
  it("Property: the words of a hint hold no digit, whatever the direction, distance, voice or choice of line", () => {
    fc.assert(
      fc.property(fc.constantFrom(...BEARINGS), fc.constantFrom(...BANDS), fc.constantFrom(...VOICES), fc.double({ min: 0, max: 0.999999, noNaN: true }), fc.double({ min: 0, max: 0.999999, noNaN: true }), (bearing, band, voice, r0, r1) => {
        for (const directive of [{ kind: "hint" as const, bearing, band }, { kind: "tease" as const, band }]) {
          const text = narrate({ directive, voice, brief: "A narrow kitchen with a window over the sink.", seeds: [{ anchorId: "a1", archetype: "sound", hook: "a low hum from behind a closed door" }], r: [r0, r1] });
          expect(text).not.toMatch(/\d/);
          expect(text).not.toContain("hum");
          expect(text.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 300, seed: 8504 },
    );
  });
});

describe("nearestUnfound", () => {
  const anchors: Anchor[] = [{ id: "a1", pos: [10, 0, 0], radius: 2.5 }, { id: "a2", pos: [0, 0, 4], radius: 2.5 }, { id: "a3", pos: [-20, 0, 0], radius: 2.5 }];
  it("is the nearest anchor not found, on the floor plane, and null when all are found", () => {
    expect(nearestUnfound(anchors, [], [0, 5, 0])?.anchor.id).toBe("a2");
    expect(nearestUnfound(anchors, ["a2"], [0, 0, 0])?.anchor.id).toBe("a1");
    expect(nearestUnfound(anchors, ["a1", "a2", "a3"], [0, 0, 0])).toBeNull();
    expect(nearestUnfound(anchors, [], [0, 99, 0])?.distance).toBeCloseTo(4, 9);
  });
});

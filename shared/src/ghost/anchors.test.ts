import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, MIN_ANCHOR_SPACING, MIN_SPAWN_DISTANCE, placeAnchors, ringAnchors, validateAnchors, walkRadiusOf, type FloorSampler } from "./anchors";
import { makeRng } from "./rng";
import { ANCHOR_RADIUS, type Anchor, type Bounds, type Vec3 } from "./types";

const SPAWN: Vec3 = [0, 0, 0];
const BOUNDS: Bounds = { min: [-20, -1, -20], max: [20, 4, 20] };
const CTX = { spawn: SPAWN, bounds: BOUNDS, walkRadius: 15 };
const flat = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const good: Anchor[] = [
  { id: "a1", pos: [8, 0, 0], radius: 2.5 },
  { id: "a2", pos: [-6, 0, 7], radius: 2.5 },
  { id: "a3", pos: [0, 0, -9], radius: 2.5 },
];
const mutate = (i: number, patch: Partial<Anchor>): Anchor[] => good.map((a, k) => (k === i ? { ...a, ...patch } : a));

describe("validateAnchors", () => {
  it("accepts a good set, in id order, with the server's radius", () => {
    const r = validateAnchors([good[2], { ...(good[0] as Anchor), radius: 99 }, good[1]], CTX);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.anchors).toEqual(good.map((a) => ({ ...a, radius: ANCHOR_RADIUS })));
  });

  it("refuses each broken rule with its own reason", () => {
    expect(validateAnchors(good.slice(0, 2), CTX)).toEqual({ ok: false, reason: "shape" });
    expect(validateAnchors("x", CTX)).toEqual({ ok: false, reason: "shape" });
    expect(validateAnchors([...good.slice(0, 2), { ...(good[0] as Anchor) }], CTX)).toEqual({ ok: false, reason: "shape" });
    expect(validateAnchors([...good.slice(0, 2), { id: "a9", pos: [1, 0, 1] }], CTX)).toEqual({ ok: false, reason: "shape" });
    expect(validateAnchors(mutate(0, { pos: [Number.NaN, 0, 0] }), CTX)).toEqual({ ok: false, reason: "shape" });
    expect(validateAnchors(mutate(0, { pos: [8, 0] as unknown as Vec3 }), CTX)).toEqual({ ok: false, reason: "shape" });
    expect(validateAnchors(mutate(0, { pos: [25, 0, 0] }), CTX)).toEqual({ ok: false, reason: "bounds" });
    expect(validateAnchors(mutate(0, { pos: [8, 9, 0] }), CTX)).toEqual({ ok: false, reason: "bounds" });
    expect(validateAnchors(mutate(0, { pos: [16, 0, 0] }), CTX)).toEqual({ ok: false, reason: "walk_radius" });
    expect(validateAnchors(mutate(0, { pos: [2.9, 0, 0] }), CTX)).toEqual({ ok: false, reason: "spawn_distance" });
    expect(validateAnchors(mutate(1, { pos: [8, 0, 3.9] }), CTX)).toEqual({ ok: false, reason: "spacing" });
    expect(validateAnchors(good, { ...CTX, sampler: () => 1 })).toEqual({ ok: false, reason: "floor" });
    expect(validateAnchors(good, { ...CTX, sampler: () => null })).toEqual({ ok: false, reason: "floor" });
    expect(validateAnchors(good, { ...CTX, sampler: () => 0.4 }).ok).toBe(true);
  });

  it("accepts the edges: exactly 3 m from the spawn, exactly 4 m apart, exactly on the walk radius", () => {
    const edge: Anchor[] = [{ id: "a1", pos: [3, 0, 0], radius: 1 }, { id: "a2", pos: [7, 0, 0], radius: 1 }, { id: "a3", pos: [15, 0, 0], radius: 1 }];
    expect(validateAnchors(edge, CTX).ok).toBe(true);
    expect(MIN_SPAWN_DISTANCE).toBe(3);
    expect(MIN_ANCHOR_SPACING).toBe(4);
  });
});

describe("ringAnchors", () => {
  it("puts three anchors 120 degrees apart on a ring of 0.6 of the walk radius, kept between 3 and 8 m", () => {
    const ring = ringAnchors([1, 0, 2], 10);
    expect(ring.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    for (const a of ring) expect(flat(a.pos, [1, 0, 2])).toBeCloseTo(6, 9);
    expect(flat((ring[0] as Anchor).pos, (ring[1] as Anchor).pos)).toBeCloseTo(6 * Math.sqrt(3), 9);
    expect(flat((ringAnchors(SPAWN, 4)[0] as Anchor).pos, SPAWN)).toBeCloseTo(3, 9);
    expect(flat((ringAnchors(SPAWN, 100)[0] as Anchor).pos, SPAWN)).toBeCloseTo(8, 9);
    expect(ringAnchors([0, 1.6, 0], 10, 0).map((a) => a.pos[1])).toEqual([0, 0, 0]);
    expect(ringAnchors([0, 1.6, 0], 10).map((a) => a.pos[1])).toEqual([1.6, 1.6, 1.6]);
  });
});

/** A room: width, depth, a spawn at its centre, a floor with a hole at the edge where there is none. */
const room = fc.record({ w: fc.integer({ min: 12, max: 60 }), d: fc.integer({ min: 12, max: 60 }), cx: fc.integer({ min: -30, max: 30 }), cz: fc.integer({ min: -30, max: 30 }), floor: fc.integer({ min: -2, max: 2 }), seed: fc.integer({ min: 0, max: 0xffffffff }) }).map((r) => {
  const spawn: Vec3 = [r.cx, r.floor, r.cz];
  const bounds: Bounds = { min: [r.cx - r.w / 2, r.floor - 1, r.cz - r.d / 2], max: [r.cx + r.w / 2, r.floor + 4, r.cz + r.d / 2] };
  const walkRadius = walkRadiusOf(bounds);
  const sampler: FloorSampler = (x, z) => (Math.hypot(x - spawn[0], z - spawn[2]) > 0.8 * walkRadius && x > spawn[0] ? null : r.floor);
  return { spawn, bounds, walkRadius, sampler, seed: r.seed };
});

describe("placeAnchors", () => {
  // Property 1
  it("Property: three anchors that pass validateAnchors, identical for identical inputs", () => {
    fc.assert(
      fc.property(room, (r) => {
        const a = placeAnchors({ sampler: r.sampler, spawn: r.spawn, bounds: r.bounds, walkRadius: r.walkRadius, rng: makeRng(r.seed) });
        const b = placeAnchors({ sampler: r.sampler, spawn: r.spawn, bounds: r.bounds, walkRadius: r.walkRadius, rng: makeRng(r.seed) });
        expect(b).toEqual(a);
        expect(a).toHaveLength(3);
        const checked = validateAnchors(a, { spawn: r.spawn, bounds: r.bounds, walkRadius: r.walkRadius, sampler: r.sampler });
        expect(checked.ok, JSON.stringify(checked)).toBe(true);
      }),
      { numRuns: 300, seed: 8401 },
    );
  });

  it("Property: validateAnchors rejects any set that breaks one rule", () => {
    fc.assert(
      fc.property(room, fc.integer({ min: 0, max: 2 }), fc.constantFrom("near_spawn", "far", "outside", "close_pair"), (r, i, rule) => {
        const set = placeAnchors({ sampler: r.sampler, spawn: r.spawn, bounds: r.bounds, walkRadius: r.walkRadius, rng: makeRng(r.seed) });
        const broken = set.map((a) => ({ ...a, pos: [...a.pos] as Vec3 }));
        const target = broken[i] as Anchor;
        const other = broken[(i + 1) % 3] as Anchor;
        if (rule === "near_spawn") target.pos = [r.spawn[0] + 1, r.spawn[1], r.spawn[2]];
        if (rule === "far") target.pos = [r.spawn[0] + r.walkRadius + 1, r.spawn[1], r.spawn[2]];
        if (rule === "outside") target.pos = [r.bounds.max[0] + 1, r.spawn[1], r.spawn[2]];
        if (rule === "close_pair") target.pos = [other.pos[0] + 1, other.pos[1], other.pos[2]];
        expect(validateAnchors(broken, { spawn: r.spawn, bounds: r.bounds, walkRadius: r.walkRadius }).ok).toBe(false);
      }),
      { numRuns: 200, seed: 8402 },
    );
  });

  it("gives the ring when a point cannot be found (no floor anywhere) or the walk radius is under 5 m", () => {
    expect(placeAnchors({ sampler: () => null, spawn: SPAWN, bounds: BOUNDS, walkRadius: 15, rng: makeRng(1) })).toEqual(ringAnchors(SPAWN, 15));
    // The ring is on the floor, not at the spawn's eye height
    expect(placeAnchors({ sampler: (x, z) => (x === 0 && z === 0 ? 0.25 : null), spawn: [0, 1.6, 0], bounds: BOUNDS, walkRadius: 15, rng: makeRng(1) }).map((a) => a.pos[1])).toEqual([0.25, 0.25, 0.25]);
    expect(placeAnchors({ sampler: () => 0, spawn: SPAWN, bounds: BOUNDS, walkRadius: 4, rng: makeRng(1) })).toEqual(ringAnchors(SPAWN, 4));
  });

  it("tries a bounded number of times for each anchor", () => {
    let calls = 0;
    placeAnchors({ sampler: () => (calls++, null), spawn: SPAWN, bounds: BOUNDS, walkRadius: 15, rng: makeRng(2) });
    // 200 tries for the first anchor, then the ring, which reads the floor under the spawn once
    expect(calls).toBe(MAX_ATTEMPTS + 1);
  });

  it("walkRadiusOf is the smaller half-extent, never under 5", () => {
    expect(walkRadiusOf({ min: [-10, 0, -6], max: [10, 3, 6] })).toBe(6);
    expect(walkRadiusOf({ min: [-1, 0, -1], max: [1, 3, 1] })).toBe(5);
  });
});

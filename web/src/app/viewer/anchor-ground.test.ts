import { validateAnchors, walkRadiusOf } from "@hauntology/shared/ghost/anchors";
import type { Bounds, Vec3 } from "@hauntology/shared/ghost/types";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { planAnchorsFromViewer, planClientAnchors } from "../play/anchors";
import { anchorGroundFrom, FLOOR_DROP, floorSamplerFromProbe, waitForGround } from "./anchor-ground";
import { collisionWorldFromGeometry, type FloorProbe } from "./collision";
import type { AnchorGround } from "./types";

/** A flat quad in the XZ plane at height `y`, facing up (floor) or down (ceiling), from (x0,z0) to (x1,z1). */
function quad(x0: number, z0: number, x1: number, z1: number, y: number, up: boolean): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const v = up
    ? [x0, y, z0, x0, y, z1, x1, y, z0, x1, y, z0, x0, y, z1, x1, y, z1]
    : [x0, y, z0, x1, y, z0, x0, y, z1, x1, y, z0, x1, y, z1, x0, y, z1];
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  return g;
}
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const p of parts) pos.push(...(p.getAttribute("position").array as unknown as number[]));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

const SPAWN: Vec3 = [0, 1.6, 0];
const BOUNDS: Bounds = { min: [-10, 0, -10], max: [10, 3, 10] };

describe("floor sampler over the collider's BVH (ghost-engine 6.3)", () => {
  // A room 20 m square: floor at y=0, ceiling at y=2.6, plus a raised floor (a platform) at y=0.4 on the +x side from x=6.
  const room = merge([quad(-10, -10, 10, 10, 0, true), quad(-10, -10, 10, 10, 2.6, false), quad(6, -10, 10, 10, 0.4, true)]);
  const world = collisionWorldFromGeometry(room);

  it("finds the floor under a point from the spawn's eye, not the ceiling, and the platform where there is one", () => {
    const sample = floorSamplerFromProbe(world, SPAWN[1]);
    expect(sample(0, 0)).toBeCloseTo(0, 5);
    expect(sample(-5, 3)).toBeCloseTo(0, 5);
    expect(sample(8, 0)).toBeCloseTo(0.4, 5);
  });
  it("gives null off the collider and for a point that is not a number", () => {
    const sample = floorSamplerFromProbe(world, SPAWN[1]);
    expect(sample(50, 0)).toBeNull();
    expect(sample(Number.NaN, 0)).toBeNull();
    expect(sample(0, Number.POSITIVE_INFINITY)).toBeNull();
  });
  it("gives null for a surface too steep to stand on (a 60 degree ramp), and for a floor further down than the reach", () => {
    const ramp = new THREE.BufferGeometry();
    ramp.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 4, 4, 6.9, 0, 4, 6.9, 0, 0, 0, 4, 4, 6.9, 4], 3));
    const steep = collisionWorldFromGeometry(ramp);
    expect(floorSamplerFromProbe(steep, 20)(1, 1)).toBeNull();
    const deep = collisionWorldFromGeometry(merge([quad(-10, -10, 10, 10, -FLOOR_DROP - 2, true)]));
    expect(floorSamplerFromProbe(deep, 1.6)(0, 0)).toBeNull();
  });
  it("lets placeAnchors put three anchors on the floor that the server's own check accepts, and the same world gives the same three", () => {
    const sampler = floorSamplerFromProbe(world, SPAWN[1]);
    const a = planClientAnchors({ worldId: "kitchen", spawn: SPAWN, bounds: BOUNDS, sampler });
    const b = planClientAnchors({ worldId: "kitchen", spawn: SPAWN, bounds: BOUNDS, sampler });
    expect(a).toBeDefined();
    expect(a).toEqual(b);
    expect(a!.every((x) => Math.abs(x.pos[1] - 0) < 1e-6 || Math.abs(x.pos[1] - 0.4) < 1e-6)).toBe(true);
    expect(validateAnchors(a!, { spawn: SPAWN, bounds: BOUNDS, walkRadius: walkRadiusOf(BOUNDS), sampler }).ok).toBe(true);
    expect(planClientAnchors({ worldId: "attic", spawn: SPAWN, bounds: BOUNDS, sampler })).not.toEqual(a);
  });
  it("is what anchorGroundFrom hands the shell, and a world with no collider hands nothing", () => {
    const ground = anchorGroundFrom(world, SPAWN, BOUNDS);
    expect(ground?.spawn).toBe(SPAWN);
    expect(ground?.bounds).toBe(BOUNDS);
    expect(ground?.sampler(0, 0)).toBeCloseTo(0, 5);
    expect(anchorGroundFrom("none", SPAWN, BOUNDS)).toBeNull();
    expect(anchorGroundFrom("pending", SPAWN, BOUNDS)).toBeUndefined();
  });
});

describe("waiting for the Viewer's collider", () => {
  const ground: AnchorGround = { sampler: () => 0, spawn: SPAWN, bounds: BOUNDS };
  function clock() {
    const c = { t: 0, slept: 0 };
    return { c, now: () => c.t, sleep: async (ms: number) => { c.t += ms; c.slept += 1; } };
  }
  it("returns at once when the ground is there, and polls until it appears", async () => {
    const k = clock();
    expect(await waitForGround(() => ground, k)).toBe(ground);
    expect(k.c.slept).toBe(0);
    let calls = 0;
    expect(await waitForGround(() => (++calls < 4 ? undefined : ground), { ...k, pollMs: 100, timeoutMs: 1500 })).toBe(ground);
    expect(calls).toBe(4);
    expect(k.c.slept).toBe(3);
  });
  it("stops at once when the Viewer says there never will be a ground", async () => {
    const k = clock();
    expect(await waitForGround(() => null, k)).toBeUndefined();
    expect(k.c.slept).toBe(0);
    expect(await planAnchorsFromViewer({ worldId: "kitchen", ground: () => null, wait: k })).toBeUndefined();
    expect(k.c.t).toBe(0);
  });
  it("gives up after the limit, and counts a ground that throws as not yet", async () => {
    const k = clock();
    expect(await waitForGround(() => undefined, { ...k, pollMs: 100, timeoutMs: 1500 })).toBeUndefined();
    expect(k.c.t).toBeGreaterThanOrEqual(1500);
    expect(k.c.t).toBeLessThan(1700);
    let n = 0;
    const k2 = clock();
    expect(await waitForGround(() => { if (++n < 3) throw new Error("not built"); return ground; }, k2)).toBe(ground);
  });
  it("planAnchorsFromViewer: anchors when the ground arrives, none when it never does, none when the planner cannot place", async () => {
    const probe: FloorProbe = collisionWorldFromGeometry(merge([quad(-10, -10, 10, 10, 0, true)]));
    const k = clock();
    const got = await planAnchorsFromViewer({ worldId: "kitchen", ground: () => anchorGroundFrom(probe, SPAWN, BOUNDS), wait: k });
    expect(got).toHaveLength(3);
    expect(await planAnchorsFromViewer({ worldId: "kitchen", ground: () => undefined, wait: clock() })).toBeUndefined();
    const none: AnchorGround = { sampler: () => null, spawn: SPAWN, bounds: BOUNDS };
    // A sampler that finds no floor anywhere gives the ring round the spawn, which still passes the server's check.
    expect(await planAnchorsFromViewer({ worldId: "kitchen", ground: () => none, wait: clock() })).toHaveLength(3);
  });
});

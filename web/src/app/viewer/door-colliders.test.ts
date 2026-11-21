import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Vec3 } from "@hauntology/shared/app/events";
import type { ViewerDoor } from "@hauntology/shared/party/door-view";
import { CAPSULE_RADIUS, type CollisionWorld } from "./collision";
import { createDoorColliders } from "./door-colliders";

const EYE = 1.6;
// a door in the plane z = 0, along x (yaw 0), 1.2 m wide, centred on x = 0
const door = (over: Partial<ViewerDoor> = {}): ViewerDoor => ({ id: "cellar-door", x: 0, z: 0, width: 1.2, yaw: 0, open: false, ...over });
const at = (x: number, z: number): Vec3 => [x, EYE, z];
/** Walk towards (x1, z1) in steps of `step` m, as the Viewer does: every step starts from where the last one was resolved to. Returns where the walker ends. */
function walk(c: ReturnType<typeof createDoorColliders>, from: [number, number], to: [number, number], step = 0.1): Vec3 {
  let p = at(from[0], from[1]);
  for (let i = 0; i < 400; i++) {
    const dx = to[0] - p[0];
    const dz = to[1] - p[2];
    const d = Math.hypot(dx, dz);
    if (d < 1e-9) break;
    const k = Math.min(1, step / d);
    p = c.resolve(at(p[0] + dx * k, p[2] + dz * k), EYE, CAPSULE_RADIUS);
  }
  return p;
}

describe("the doorway colliders (knock-door 8.1)", () => {
  it("stops a walker at a shut door, on either side", () => {
    const c = createDoorColliders();
    c.set([door()]);
    const front = walk(c, [0, 3], [0, -3]);
    expect(front[2]).toBeGreaterThan(0.1 + CAPSULE_RADIUS - 0.02); // held on the near side, outside the box and the capsule
    const back = walk(c, [0, -3], [0, 3]);
    expect(back[2]).toBeLessThan(-0.1 - CAPSULE_RADIUS + 0.02);
  });

  it("lets the walker through once the door is open, and stops them again when it shuts", () => {
    const c = createDoorColliders();
    c.set([door({ open: true })]);
    const through = walk(c, [0, 3], [0, -3]);
    expect(through[2]).toBeCloseTo(-3, 6);
    c.set([door({ open: false })]);
    expect(walk(c, [0, 3], [0, -3])[2]).toBeGreaterThan(0.2);
  });

  it("does not hold a walker who walks past the door's ends", () => {
    const c = createDoorColliders();
    c.set([door()]);
    const p = walk(c, [3, 3], [3, -3]);
    expect(p[0]).toBeCloseTo(3, 6);
    expect(p[2]).toBeCloseTo(-3, 6);
  });

  it("follows the door's angle: a wall along z stops a walk along x", () => {
    const c = createDoorColliders();
    c.set([door({ yaw: Math.PI / 2 })]);
    expect(walk(c, [3, 0], [-3, 0])[0]).toBeGreaterThan(0.2);
    expect(walk(c, [2, 3], [2, -3])[2]).toBeCloseTo(-3, 6); // beside the wall: free
    expect(walk(c, [0, 3], [0, -3])[2]).toBeGreaterThan(0.6); // along its line, the end of the wall stops it
  });

  it("never lets a walker end up inside a shut box, from any start near it", () => {
    fc.assert(fc.property(fc.double({ min: -1, max: 1, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true }), fc.double({ min: 0, max: Math.PI, noNaN: true }), (x, z, yaw) => {
      const c = createDoorColliders();
      c.set([door({ yaw })]);
      const p = c.resolve(at(x, z), EYE, CAPSULE_RADIUS);
      // in the box's own frame, the walker's centre is clear of the box by about the capsule radius
      const lx = Math.cos(yaw) * p[0] + Math.sin(yaw) * p[2];
      const lz = -Math.sin(yaw) * p[0] + Math.cos(yaw) * p[2];
      const dx = Math.max(Math.abs(lx) - 0.6, 0);
      const dz = Math.max(Math.abs(lz) - 0.1, 0);
      expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(CAPSULE_RADIUS - 1e-6);
    }));
  });

  it("pushes a walker whose centre is inside the box out by the nearest face", () => {
    const c = createDoorColliders();
    c.set([door()]);
    expect(c.resolve(at(0, 0.04), EYE, CAPSULE_RADIUS)[2]).toBeCloseTo(0.1 + CAPSULE_RADIUS, 6);
    expect(c.resolve(at(0, -0.04), EYE, CAPSULE_RADIUS)[2]).toBeCloseTo(-0.1 - CAPSULE_RADIUS, 6);
  });

  it("is a no-op for a world with no doors, and for a walker nowhere near a door", () => {
    const c = createDoorColliders();
    expect(c.count()).toBe(0);
    const p = at(1.234, -5.5);
    expect(c.resolve(p, EYE, CAPSULE_RADIUS)).toBe(p);
    c.set([door()]);
    expect(c.resolve(at(10, 10), EYE, CAPSULE_RADIUS)).toEqual(at(10, 10));
    c.set([]);
    expect(c.count()).toBe(0);
  });

  it("counts only the shut doors, and replaces the whole list on every change", () => {
    const c = createDoorColliders();
    c.set([door({ id: "a" }), door({ id: "b", x: 5, open: true })]);
    expect(c.count()).toBe(1);
    c.set([door({ id: "b", x: 5, open: false })]);
    expect(c.count()).toBe(1);
    expect(c.resolve(at(5, 0), EYE, CAPSULE_RADIUS)).not.toEqual(at(5, 0));
  });

  it("leaves a walker alone whose input is not finite, and ignores a door that is not finite", () => {
    const c = createDoorColliders();
    c.set([door({ x: Number.NaN }), door({ id: "b", width: 0 })]);
    expect(c.count()).toBe(0);
    c.set([door()]);
    const bad: Vec3 = [Number.NaN, EYE, 0];
    expect(c.resolve(bad, EYE, CAPSULE_RADIUS)).toBe(bad);
  });

  it("wraps a collision world: the world's own answer first, then the doors", () => {
    const c = createDoorColliders();
    c.set([door()]);
    const base: CollisionWorld = { resolve: (eye) => [eye[0], eye[1] + 0.5, eye[2]], floorYAt: () => 1 };
    const w = c.wrap(base);
    expect(w.floorYAt(0, 0, 5)).toBe(1);
    expect(w.resolve(at(3, 3), EYE, CAPSULE_RADIUS)).toEqual([3, EYE + 0.5, 3]);
    expect(w.resolve(at(0, 0.05), EYE, CAPSULE_RADIUS)[2]).toBeGreaterThan(0.3);
    expect(c.wrap(null).floorYAt(0, 0, 5)).toBeNull();
  });
});

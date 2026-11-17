import { propParams } from "@hauntology/shared/app/prop-config";
import * as fc from "fast-check";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { describe, expect, it } from "vitest";
import { CAPSULE_RADIUS, collisionWorldFromGeometry } from "./collision";

const EYE = 1.6;
const EPS = 2e-3;

const box = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** A room: floor top at y=0, inner walls at x=±hw and z=±hd, walls 0.5 thick and 3 high. */
function roomGeometry(hw: number, hd: number): THREE.BufferGeometry {
  const parts = [
    box(hw * 2 + 1, 0.5, hd * 2 + 1, 0, -0.25, 0),
    box(0.5, 3, hd * 2 + 1, -(hw + 0.25), 1.5, 0),
    box(0.5, 3, hd * 2 + 1, hw + 0.25, 1.5, 0),
    box(hw * 2 + 1, 3, 0.5, 0, 1.5, -(hd + 0.25)),
    box(hw * 2 + 1, 3, 0.5, 0, 1.5, hd + 0.25),
  ];
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  if (!merged) throw new Error("room geometry did not merge");
  return merged;
}

describe("Property 3: Collision resolution never leaves the player inside geometry", () => {
  // Feature: world-viewer, Property 3: Collision resolution never leaves the player inside geometry
  // Validates: Requirements 2.4
  it("keeps the capsule at least its radius from the room's walls, with its feet on the floor", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1.2, max: 6, noNaN: true }),
        fc.double({ min: 1.2, max: 6, noNaN: true }),
        fc.double({ min: -8, max: 8, noNaN: true }),
        fc.double({ min: -8, max: 8, noNaN: true }),
        fc.double({ min: 0, max: 0.5, noNaN: true }),
        (hw, hd, tx, tz, lift) => {
          const world = collisionWorldFromGeometry(roomGeometry(hw, hd));
          // Walk from the room's centre (a free start) to the target in frame-size steps,
          // resolving each one, as the PlayerController does; a step is at most 0.08.
          let pos: [number, number, number] = [0, EYE + lift, 0];
          const steps = Math.max(1, Math.ceil(Math.hypot(tx, tz) / 0.08));
          for (let i = 1; i <= steps; i++) {
            pos = world.resolve([pos[0] + tx / steps, EYE + lift, pos[2] + tz / steps], EYE, CAPSULE_RADIUS) as [number, number, number];
            if (!pos.every(Number.isFinite)) return false;
            // At least (radius - eps) from every inner wall face, feet on the floor, at every step.
            if (Math.abs(pos[0]) > hw - CAPSULE_RADIUS + EPS || Math.abs(pos[2]) > hd - CAPSULE_RADIUS + EPS) return false;
            if (Math.abs(pos[1] - EYE) > EPS) return false;
          }
          return true;
        },
      ),
      propParams(),
    );
  });

  it("does not move a player who is already clear of the walls", () => {
    const world = collisionWorldFromGeometry(roomGeometry(4, 4));
    expect(world.resolve([1, EYE, -2], EYE, CAPSULE_RADIUS)).toEqual([1, EYE, -2]);
  });

  it("snaps to a 30 degree ramp and refuses a 45 degree one (slope limit 35)", () => {
    const ramp = (deg: number) => {
      const g = new THREE.BoxGeometry(4, 0.2, 6).rotateX((deg * Math.PI) / 180).translate(0, 1, 0);
      return collisionWorldFromGeometry(g.toNonIndexed());
    };
    expect(ramp(30).floorYAt(0, 0, 1.2)).not.toBeNull();
    expect(ramp(45).floorYAt(0, 0, 1.2)).toBeNull();
  });

  it("returns a broken position untouched rather than inventing one", () => {
    const world = collisionWorldFromGeometry(roomGeometry(4, 4));
    const broken: [number, number, number] = [Number.NaN, EYE, 0];
    expect(world.resolve(broken, EYE, CAPSULE_RADIUS)).toBe(broken);
  });
});

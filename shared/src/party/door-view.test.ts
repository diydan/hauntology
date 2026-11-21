import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { AT_DOOR_RADIUS, DOOR_BOX_HEIGHT, DOOR_BOX_THICKNESS, doorBox, doorYaw, playerAtDoor, viewerDoors } from "./door-view";
import type { PublicDoor } from "./doors";

const door = (over: Partial<PublicDoor> = {}): PublicDoor => ({ id: "cellar-door", at: { x: 2, z: 3 }, width: 1.2, a: "hall", b: "cellar", lock: "knock", open: false, need: 1, have: 0, ...over });
const centers = { hall: { x: 0, z: 3 }, cellar: { x: 4, z: 3 } };

describe("the doorway box (knock-door 8.1, Requirement 9.1)", () => {
  it("is 0.2 m thick, up to 2.2 m, as wide as the door, centred on the door's place", () => {
    const b = doorBox(door(), centers);
    expect(b).toMatchObject({ x: 2, z: 3, width: 1.2, thickness: DOOR_BOX_THICKNESS, height: DOOR_BOX_HEIGHT });
    expect(DOOR_BOX_THICKNESS).toBe(0.2);
    expect(DOOR_BOX_HEIGHT).toBe(2.2);
  });

  it("lies across the way: the long side is square to the line from one Zone to the other", () => {
    // the Zones are along x, so the wall runs along z (yaw a quarter turn)
    expect(Math.abs(doorYaw(door(), centers))).toBeCloseTo(Math.PI / 2, 9);
    // the Zones are along z: the wall runs along x
    expect(doorYaw(door(), { hall: { x: 2, z: 0 }, cellar: { x: 2, z: 6 } })).toBeCloseTo(0, 9);
  });

  it("falls back to yaw 0 when the Zone places are missing or the same", () => {
    expect(doorYaw(door(), {})).toBe(0);
    expect(doorYaw(door(), { hall: { x: 1, z: 1 }, cellar: { x: 1, z: 1 } })).toBe(0);
  });

  it("is the same whichever of the two Zones is listed first", () => {
    fc.assert(fc.property(fc.double({ min: -20, max: 20, noNaN: true }), fc.double({ min: -20, max: 20, noNaN: true }), fc.double({ min: -20, max: 20, noNaN: true }), fc.double({ min: -20, max: 20, noNaN: true }), (ax, az, bx, bz) => {
      const c = { hall: { x: ax, z: az }, cellar: { x: bx, z: bz } };
      const fwd = doorYaw(door(), c);
      const back = doorYaw(door({ a: "cellar", b: "hall" }), c);
      // a wall has no front: the two angles are the same line (differ by 0 or a half turn)
      const d = Math.abs(Math.sin(fwd - back));
      expect(d).toBeLessThan(1e-9);
    }));
  });
});

describe("what the Viewer is told (knock-door 8.1, 8.4)", () => {
  it("is nothing for a world with no doors", () => {
    expect(viewerDoors([], centers)).toEqual([]);
    expect(viewerDoors(undefined, centers)).toEqual([]);
  });

  it("lists each door's place, width, wall angle and whether it is open, and nothing about its lock", () => {
    const [d] = viewerDoors([door({ lock: "heavy", need: 2, have: 1 })], centers);
    expect(Object.keys(d as object).sort()).toEqual(["id", "open", "width", "x", "yaw", "z"]);
    expect(d).toMatchObject({ id: "cellar-door", x: 2, z: 3, width: 1.2, open: false });
  });
});

describe("standing at a door (Requirement 9.2)", () => {
  it("counts within 1.5 m of the door's place, and no further", () => {
    expect(AT_DOOR_RADIUS).toBe(1.5);
    expect(playerAtDoor(door(), { x: 2, z: 4.5 })).toBe(true);
    expect(playerAtDoor(door(), { x: 2, z: 4.51 })).toBe(false);
    expect(playerAtDoor(door(), { x: 2, z: 3 })).toBe(true);
    expect(playerAtDoor(door(), { x: Number.NaN, z: 3 })).toBe(false);
  });
});

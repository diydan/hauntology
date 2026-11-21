import { describe, expect, it } from "vitest";
import type { Vec3 } from "@hauntology/shared/app/events";
import type { ViewerDoor } from "@hauntology/shared/party/door-view";
import { DOOR_BOX_THICKNESS } from "@hauntology/shared/party/door-view";
import { stepMovement } from "@hauntology/shared/viewer/movement";
import type { MoveParams } from "@hauntology/shared/viewer/types";
import { CAPSULE_RADIUS, type CollisionWorld } from "./collision";
import { createDoorColliders } from "./door-colliders";

/**
 * Spike knock-door 7.1 over a FAKE world (task 7): a wall with a doorway in it, a walker moved by the Viewer's own `stepMovement` and pushed out by the
 * Viewer's own door boxes, at the frame times a phone really has. The wall is made of two long boxes from the same collider code, standing in for the
 * Gallery world's Collider. It answers "does the box stop a walker cleanly, slide, snag or let them through at speed" for the maths. What it cannot
 * answer, and the real spike still must: a real Gallery world's Collider mesh around a real doorway, the real frame rate on a real phone, and how
 * the stop feels. See docs/spikes/knock-door-7.md. Nothing here is a real world.
 */
const EYE = 1.6;
const PARAMS: MoveParams = { walk: 1.4, sprintMul: 1.6, eyeHeight: EYE, bounds: { min: [-50, -50, -50], max: [50, 50, 50] } as never, floorY: 0 };
const DOORWAY = 1.2;
const doorBox = (over: Partial<ViewerDoor> = {}): ViewerDoor => ({ id: "cellar", x: 0, z: 0, width: DOORWAY, yaw: 0, open: false, ...over });
/** The wall either side of the doorway, as two shut boxes of the same thickness (the Gallery Collider's stand-in). */
const wall = (): ViewerDoor[] => [
  { id: "wall-l", x: -(DOORWAY / 2 + 3), z: 0, width: 6, yaw: 0, open: false },
  { id: "wall-r", x: DOORWAY / 2 + 3, z: 0, width: 6, yaw: 0, open: false },
];

function world(doorOpen: boolean): CollisionWorld {
  const walls = createDoorColliders(); walls.set(wall());
  const door = createDoorColliders(); door.set([doorBox({ open: doorOpen })]);
  return door.wrap(walls.wrap(null));
}
type Run = { end: Vec3; crossed: boolean; minZ: number; maxZ: number; steps: number };
/** Walk `seconds` with the input held, at `fps` (the Viewer clamps a step to 50 ms), starting at (x, z) facing `yaw`. */
function run(w: CollisionWorld, start: [number, number], yaw: number, o: { fps: number; sprint: boolean; seconds: number; strafe?: number }): Run {
  let s = { pos: [start[0], EYE, start[1]] as Vec3, yaw };
  const dt = 1000 / o.fps;
  let crossed = false, minZ = start[1], maxZ = start[1], steps = 0;
  const side = Math.sign(start[1]);
  for (let t = 0; t < o.seconds * 1000; t += dt) {
    const next = stepMovement(s, { forward: 1, strafe: o.strafe ?? 0, sprint: o.sprint, yawDelta: 0 }, dt, PARAMS);
    const pos = w.resolve(next.pos, EYE, CAPSULE_RADIUS);
    s = { pos, yaw: s.yaw };
    steps += 1;
    minZ = Math.min(minZ, pos[2]); maxZ = Math.max(maxZ, pos[2]);
    if (Math.sign(pos[2]) === -side && Math.abs(pos[2]) > 0.02) crossed = true;
  }
  return { end: s.pos, crossed, minZ, maxZ, steps };
}
const FACE_NORTH = 0; // yaw 0 faces -z: from z = +3 the walker heads for the doorway
const NEAR_FACE = DOOR_BOX_THICKNESS / 2 + CAPSULE_RADIUS;

describe("spike knock-door 7.1 over a fake world: a shut doorway box in a wall", () => {
  it("stops a head-on walker cleanly at the doorway, at walking and sprinting speed, at 60, 30 and 20 frames a second", () => {
    for (const fps of [60, 30, 20]) for (const sprint of [false, true]) {
      const r = run(world(false), [0, 3], FACE_NORTH, { fps, sprint, seconds: 6 });
      expect(r.crossed, `fps ${fps} sprint ${sprint}`).toBe(false);
      expect(r.end[2], `fps ${fps} sprint ${sprint}`).toBeGreaterThanOrEqual(NEAR_FACE - 1e-6);
      expect(r.end[2]).toBeLessThan(NEAR_FACE + 0.02); // right up to the box, not stopped short
      expect(Math.abs(r.end[0])).toBeLessThan(1e-6); // no sideways drift
    }
  });
  it("lets the same walker through the doorway when the door is open", () => {
    for (const sprint of [false, true]) {
      const r = run(world(true), [0, 3], FACE_NORTH, { fps: 30, sprint, seconds: 6 });
      expect(r.crossed).toBe(true);
      expect(r.end[2]).toBeLessThan(-1);
    }
  });
  it("cannot step through, even at the longest step the Viewer allows (a 50 ms hitch while sprinting)", () => {
    const longest = PARAMS.walk * PARAMS.sprintMul * 0.05;
    expect(longest).toBeLessThan(NEAR_FACE); // the longest step is shorter than the distance from a stopped walker's centre to the box's middle plane
    for (const hitch of [50, 200, 1000]) {
      const r = run(world(false), [0, 3], FACE_NORTH, { fps: 1000 / hitch, sprint: true, seconds: 8 });
      expect(r.crossed, `a ${hitch} ms frame`).toBe(false);
    }
  });
  it("slides along the wall when the approach is slanted, and never goes into it", () => {
    for (const yawDeg of [20, 45, 70]) {
      const yaw = (yawDeg * Math.PI) / 180;
      const r = run(world(false), [-4, 1.5], -yaw, { fps: 30, sprint: false, seconds: 4 }); // heading along the wall
      expect(r.crossed).toBe(false);
      expect(r.minZ).toBeGreaterThanOrEqual(NEAR_FACE - 1e-6);
    }
    const r = run(world(false), [-4, 1.5], -(70 * Math.PI) / 180, { fps: 30, sprint: false, seconds: 4 });
    expect(Math.abs(r.end[0] - -4)).toBeGreaterThan(1); // kept moving along the wall
  });
  it("does not snag where the box meets the wall: a walker pressed into the corner stays on its own side, and a close pass is not stuck", () => {
    const edge = DOORWAY / 2; // the doorway's edge, where box and wall meet
    const r = run(world(false), [edge, 1], FACE_NORTH, { fps: 30, sprint: true, seconds: 5 });
    expect(r.crossed).toBe(false);
    expect(Number.isFinite(r.end[0]) && Number.isFinite(r.end[2])).toBe(true);
    // back away from the corner: a stuck walker would not move
    const back = world(false);
    let s = { pos: r.end, yaw: FACE_NORTH };
    for (let i = 0; i < 30; i++) { s = { pos: back.resolve(stepMovement(s, { forward: -1, strafe: 0, sprint: false, yawDelta: 0 }, 33, PARAMS).pos, EYE, CAPSULE_RADIUS), yaw: s.yaw }; }
    expect(s.pos[2]).toBeGreaterThan(r.end[2] + 0.5);
  });
  it("resolves a corner where the box and a wall box meet in one pass set: a hard diagonal push into the corner ends outside both", () => {
    const c = createDoorColliders();
    c.set([doorBox(), ...wall()]); // one collider holding the doorway box and both wall boxes, as a world with its doors and walls
    const pts: [number, number][] = [];
    for (let x = 0.2; x <= 1.0001; x += 0.05) for (let z = -0.4; z <= 0.4001; z += 0.05) pts.push([x, z]);
    for (const [x, z] of pts) {
      const p = c.resolve([x, EYE, z], EYE, CAPSULE_RADIUS);
      for (const b of [doorBox(), ...wall()]) {
        const dx = Math.max(Math.abs(p[0] - b.x) - b.width / 2, 0), dz = Math.max(Math.abs(p[2] - b.z) - DOOR_BOX_THICKNESS / 2, 0);
        expect(Math.hypot(dx, dz), `from (${x.toFixed(2)}, ${z.toFixed(2)}) against ${b.id}`).toBeGreaterThanOrEqual(CAPSULE_RADIUS - 1e-3);
      }
    }
  });
  it("pushes a walker out to the nearest side when a door shuts on them, and never to the far side from the middle of the doorway's near half", () => {
    const door = createDoorColliders();
    door.set([doorBox()]);
    expect(door.resolve([0, EYE, 0.05], EYE, CAPSULE_RADIUS)[2]).toBeGreaterThan(0); // standing in the box on the near half: out the near face
    expect(door.resolve([0, EYE, -0.05], EYE, CAPSULE_RADIUS)[2]).toBeLessThan(0);
  });
});

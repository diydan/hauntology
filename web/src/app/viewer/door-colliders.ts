import type { Vec3 } from "@hauntology/shared/app/events";
import { DOOR_BOX_THICKNESS } from "@hauntology/shared/party/door-view";
import type { ViewerDoor } from "@hauntology/shared/party/door-view";
import type { CollisionWorld } from "./collision";

/**
 * The shut doors of the world as thin boxes across their doorways (knock-door 8.1, Requirement 9.1). A shut door is a box of the
 * door's width and 0.2 m thick; an open door is no box. `set` replaces the whole list whenever a door changes, so there is nothing
 * to keep in step. The walker is pushed out of a box along the thin side, the way the Viewer's capsule is pushed out of the Collider.
 *
 * The box reaches from the floor to 2.2 m in the design; the walker's capsule always stands on the floor and is under 2.2 m, so
 * the push is flat (x and z only) and the height is not tested. Whether this stops a walker cleanly in a real Gallery world is the
 * spike of task 7.1, which needs a person at the lab.
 */
type Box = { x: number; z: number; cos: number; sin: number; halfW: number; halfT: number };

export type DoorColliders = {
  /** The boxes of every shut door, from the doors as they stand now. Not finite or not positive: left out. */
  set(doors: readonly ViewerDoor[]): void;
  /** How many shut doors have a box. */
  count(): number;
  /** The eye pushed out of every box (the same object comes back when nothing moved it, or when there are no doors). */
  resolve(eye: Vec3, eyeHeight: number, radius: number): Vec3;
  /** A collision world that asks `base` first and the doors second; with no `base` there is only the doors (and no floor). */
  wrap(base: CollisionWorld | null): CollisionWorld;
};

const PASSES = 3;

export function createDoorColliders(): DoorColliders {
  let boxes: Box[] = [];

  const resolve = (eye: Vec3, eyeHeight: number, radius: number): Vec3 => {
    if (boxes.length === 0 || !eye.every(Number.isFinite) || !(eyeHeight > 0) || !(radius > 0)) return eye;
    let x = eye[0];
    let z = eye[2];
    let moved = false;
    for (let pass = 0; pass < PASSES; pass++) {
      let changed = false;
      for (const b of boxes) {
        // the walker's centre in the box's own frame: x along the wall, z across it
        const dx = x - b.x;
        const dz = z - b.z;
        const lx = b.cos * dx + b.sin * dz;
        const lz = -b.sin * dx + b.cos * dz;
        const cx = Math.max(-b.halfW, Math.min(b.halfW, lx));
        const cz = Math.max(-b.halfT, Math.min(b.halfT, lz));
        let nx = lx - cx;
        let nz = lz - cz;
        let depth: number;
        if (nx === 0 && nz === 0) {
          // the centre is inside the box: leave by the nearest thin face
          nx = 0;
          nz = lz >= 0 ? 1 : -1;
          depth = radius + (b.halfT - Math.abs(lz));
        } else {
          const d = Math.hypot(nx, nz);
          if (d >= radius) continue;
          depth = radius - d;
          nx /= d;
          nz /= d;
        }
        const px = nx * depth;
        const pz = nz * depth;
        // back to the world: the inverse of the rotation above
        x += b.cos * px - b.sin * pz;
        z += b.sin * px + b.cos * pz;
        changed = true;
        moved = true;
      }
      if (!changed) break;
    }
    return moved ? [x, eye[1], z] : eye;
  };

  return {
    set(doors) {
      boxes = doors
        .filter((d) => !d.open && [d.x, d.z, d.width, d.yaw].every(Number.isFinite) && d.width > 0)
        .map((d) => ({ x: d.x, z: d.z, cos: Math.cos(d.yaw), sin: Math.sin(d.yaw), halfW: d.width / 2, halfT: DOOR_BOX_THICKNESS / 2 }));
    },
    count: () => boxes.length,
    resolve,
    wrap(base) {
      return {
        resolve: (eye, eyeHeight, radius) => resolve(base ? base.resolve(eye, eyeHeight, radius) : eye, eyeHeight, radius),
        floorYAt: (x, z, fromY) => (base ? base.floorYAt(x, z, fromY) : null),
      };
    },
  };
}

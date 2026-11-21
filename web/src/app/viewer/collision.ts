import type { Vec3 } from "@hauntology/shared/app/events";
import * as THREE from "three";
import { MeshBVH, type ExtendedTriangle } from "three-mesh-bvh";

/**
 * Collision against the world's Collider (world-viewer task 4.3, Requirement 2.4): a BVH over the
 * invisible collider geometry (already in world space — the orientation fix applied), a capsule
 * resolved out of every triangle, and a floor snap that accepts slopes up to 35 degrees. No GPU:
 * three-mesh-bvh runs in Node, which is how the property test exercises it. Positions are the
 * player's eye, as everywhere else in the viewer; the capsule hangs below it.
 */
export type CollisionWorld = {
  /** The eye position after the capsule has been pushed out of the geometry and snapped to the floor. */
  resolve(eye: Vec3, eyeHeight: number, radius: number): Vec3;
  /** The floor height under (x, z) at or below `fromY`, where the slope allows standing, else null. */
  floorYAt(x: number, z: number, fromY: number): number | null;
};

/** The collider's answer to "where is the floor under this point", far below as well as near (ghost-engine 6.3); kept apart from `CollisionWorld` so the door wrapper is untouched. */
export type FloorProbe = {
  /**
   * The first surface straight below (x, fromY, z), up to `maxDrop` down, where the slope allows standing, else null (nothing there, or a
   * steep face first). Unlike `floorYAt` it looks a long way down: it is what places the ghost's three anchors.
   */
  floorBelow(x: number, z: number, fromY: number, maxDrop: number): number | null;
};

export const CAPSULE_RADIUS = 0.35;
export const SLOPE_LIMIT_DEG = 35;
const SLOPE_MIN_NORMAL_Y = Math.cos((SLOPE_LIMIT_DEG * Math.PI) / 180);
/** How far below the feet a floor may be and still snap (a step down, not a fall). */
const SNAP_DOWN = 0.6;
const SNAP_UP = 0.4;
const PASSES = 5;

export function collisionWorldFromGeometry(geometry: THREE.BufferGeometry): CollisionWorld & FloorProbe {
  const bvh = new MeshBVH(geometry);
  const seg = new THREE.Line3();
  const sphere = new THREE.Sphere();
  const triPoint = new THREE.Vector3();
  const segPoint = new THREE.Vector3();
  const delta = new THREE.Vector3();

  const floorYAt = (x: number, z: number, fromY: number): number | null => {
    const ray = new THREE.Ray(new THREE.Vector3(x, fromY + SNAP_UP, z), new THREE.Vector3(0, -1, 0));
    const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, SNAP_UP + SNAP_DOWN);
    if (!hit || !hit.face) return null;
    return hit.face.normal.y >= SLOPE_MIN_NORMAL_Y ? hit.point.y : null;
  };

  const floorBelow = (x: number, z: number, fromY: number, maxDrop: number): number | null => {
    if (![x, z, fromY, maxDrop].every(Number.isFinite) || !(maxDrop > 0)) return null;
    const ray = new THREE.Ray(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
    const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, maxDrop);
    if (!hit || !hit.face) return null;
    return hit.face.normal.y >= SLOPE_MIN_NORMAL_Y ? hit.point.y : null;
  };

  const resolve = (eye: Vec3, eyeHeight: number, radius: number): Vec3 => {
    if (!eye.every(Number.isFinite) || !(eyeHeight > 0) || !(radius > 0)) return eye;
    // The capsule segment: from a radius above the feet to a radius below the eye.
    const feetY = eye[1] - eyeHeight;
    seg.start.set(eye[0], feetY + radius, eye[2]);
    seg.end.set(eye[0], Math.max(feetY + radius, eye[1] - radius), eye[2]);

    for (let pass = 0; pass < PASSES; pass++) {
      let deepest = 0;
      seg.getCenter(sphere.center);
      sphere.radius = seg.start.distanceTo(seg.end) / 2 + radius;
      bvh.shapecast({
        intersectsBounds: (box) => sphere.intersectsBox(box),
        intersectsTriangle: (tri: ExtendedTriangle) => {
          const dist = tri.closestPointToSegment(seg, triPoint, segPoint);
          if (dist < radius) {
            const depth = radius - dist;
            if (depth > deepest) deepest = depth;
            delta.subVectors(segPoint, triPoint);
            if (delta.lengthSq() === 0) delta.set(0, 1, 0);
            delta.normalize().multiplyScalar(depth);
            seg.start.add(delta);
            seg.end.add(delta);
          }
        },
      });
      if (deepest <= 1e-4) break;
    }

    // Feet back from the segment's low end, snapped to a standable floor when one is in reach.
    const feet: Vec3 = [seg.start.x, seg.start.y - radius, seg.start.z];
    const floor = floorYAt(feet[0], feet[2], feet[1]);
    const groundedFeetY = floor === null ? feet[1] : floor;
    return [feet[0], groundedFeetY + eyeHeight, feet[2]];
  };

  return { resolve, floorYAt, floorBelow };
}

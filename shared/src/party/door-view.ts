import type { Point } from "./zones";
import type { PublicDoor } from "./doors";

/**
 * What the Viewer and the TV need to draw a door (knock-door 8.1, 8.2, 8.4): a shut door is one thin box across the doorway,
 * and a Player is at a door within 1.5 m of its place on the plan. Pure; it reads only a door's place, width and Zones.
 */
export const DOOR_BOX_THICKNESS = 0.2;
export const DOOR_BOX_HEIGHT = 2.2;
export const AT_DOOR_RADIUS = 1.5;

export type DoorBox = Readonly<{ x: number; z: number; yaw: number; width: number; thickness: number; height: number }>;
/** One door as the Viewer takes it: place, width, the wall's angle and whether it is open. Never the lock or a pattern. */
export type ViewerDoor = Readonly<{ id: string; x: number; z: number; width: number; yaw: number; open: boolean }>;
export type ZonePlaces = Readonly<Record<string, Point>>;

const finite = (n: number): boolean => Number.isFinite(n);

/**
 * The wall's angle (radians, about the vertical axis): the wall runs square to the line from one Zone to the other, so the
 * box lies across the way between them. 0 (the wall along x) when either Zone's place is missing or both are one place.
 */
export function doorYaw(door: Pick<PublicDoor, "a" | "b">, zones: ZonePlaces): number {
  const a = zones[door.a];
  const b = zones[door.b];
  if (!a || !b || ![a.x, a.z, b.x, b.z].every(finite)) return 0;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (dx === 0 && dz === 0) return 0;
  // the way runs along (dx, dz); the wall is square to it, along (-dz, dx). A wall has no front, so the angle is kept in (-90, 90] degrees
  const yaw = Math.atan2(dx, -dz + 0);
  return yaw > Math.PI / 2 + 1e-12 ? yaw - Math.PI : yaw <= -Math.PI / 2 ? yaw + Math.PI : yaw;
}

/** The box that stops a walker at a shut door. */
export function doorBox(door: Pick<PublicDoor, "at" | "width" | "a" | "b">, zones: ZonePlaces): DoorBox {
  return { x: door.at.x, z: door.at.z, yaw: doorYaw(door, zones), width: door.width, thickness: DOOR_BOX_THICKNESS, height: DOOR_BOX_HEIGHT };
}

/** The doors for the Viewer, or none for a world without doors (so the Viewer loads and shows nothing for doors). */
export function viewerDoors(doors: readonly PublicDoor[] | undefined | null, zones: ZonePlaces): ViewerDoor[] {
  return (doors ?? []).map((d) => ({ id: d.id, x: d.at.x, z: d.at.z, width: d.width, yaw: doorYaw(d, zones), open: d.open }));
}

/** Whether a Player at `p` counts as standing at this door. */
export const playerAtDoor = (door: Pick<PublicDoor, "at">, p: Point): boolean =>
  finite(p.x) && finite(p.z) && Math.hypot(p.x - door.at.x, p.z - door.at.z) <= AT_DOOR_RADIUS + 1e-9;

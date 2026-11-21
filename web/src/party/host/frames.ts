/**
 * Free-standing photo frames near each Zone (party-mode 8.4): where each frame stands and which way it faces. A frame stands 1.2 m from the Zone's
 * point on the side of the spawn, faces the spawn, and is placed without collision (it is a picture, never a wall: the Viewer gives it no body).
 * Pure: the Viewer draws it where this says. A Zone with no photo gets no frame.
 */
export type FrameSpot = Readonly<{ zone: string; pos: readonly [number, number, number]; yaw: number }>;
export const FRAME_OFFSET_M = 1.2;
export const FRAME_HEIGHT_M = 1.4;

export function frameSpots(zones: readonly Readonly<{ id: string; x: number; z: number }>[], spawn: Readonly<{ x: number; z: number }>, withPhoto: ReadonlySet<string>): FrameSpot[] {
  return zones.filter((z) => withPhoto.has(z.id) && Number.isFinite(z.x) && Number.isFinite(z.z)).map((z) => {
    const dx = spawn.x - z.x;
    const dz = spawn.z - z.z;
    const len = Math.hypot(dx, dz);
    const ux = len === 0 ? 0 : dx / len;
    const uz = len === 0 ? 1 : dz / len;
    return { zone: z.id, pos: [z.x + ux * FRAME_OFFSET_M, FRAME_HEIGHT_M, z.z + uz * FRAME_OFFSET_M] as const, yaw: Math.atan2(ux, uz) };
  });
}

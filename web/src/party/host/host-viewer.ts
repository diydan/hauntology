import type { ShellToViewer } from "@hauntology/shared/app/events";
import { AtmosphereSchema, type Atmosphere } from "@hauntology/shared/conditions/types";
import type { Input } from "@hauntology/shared/party/input";
import { viewerDoors, type ZonePlaces } from "@hauntology/shared/party/door-view";
import type { AnchorGround } from "../../app/viewer/types";
import { frameSpots } from "./frames";
import type { HostView } from "./host-view";

/**
 * The Host's seam to the Viewer (party-mode 8.3, 8.12): what the Room tells the screen, turned into the Viewer's own messages, and the walking and
 * looking of the active Detective turned into one frame of `MoveInput`. The Host takes no other input. The Viewer accepts the messages of the
 * shell contract; a message it does not know is ignored by it, so a Viewer without remote movement simply does not move.
 */
export type RemoteMove = Readonly<{ forward: number; strafe: number; sprint: false; yawDelta: number; pitchDelta: number }>;

/** Radians of view turn per look unit a phone sends (a look unit is about three pixels of thumb travel). */
export const REMOTE_LOOK_RAD = 0.0075;

/** The stick is up for forward (negative y on the phone), right for strafe; everyone's stick is the same, so no Player walks faster than another (party-mode 5.1). */
export function remoteMove(input: Pick<Input, "move" | "look">): RemoteMove {
  const [x, y] = input.move;
  return { forward: -y || 0, strafe: x || 0, sprint: false, yawDelta: -input.look[0] * REMOTE_LOOK_RAD || 0, pitchDelta: -input.look[1] * REMOTE_LOOK_RAD || 0 };
}

const NEUTRAL = { tempBand: "mild", windBand: "calm" } as const;
/** The sky for the Viewer from the three cosmetic fields the Room keeps. Warmth and wind are not known here, so they are neutral; nothing else is invented. */
export function atmosphereFromSky(sky: Readonly<{ weather: string; timeOfDay: string; moon: string }> | null): Atmosphere | null {
  if (sky === null) return null;
  const parsed = AtmosphereSchema.safeParse({ ...NEUTRAL, weather: sky.weather, timeOfDay: sky.timeOfDay, moon: sky.moon });
  return parsed.success ? parsed.data : null;
}

/** The Viewer's `remote_input` message for one frame of the active Detective's walk (party-mode 8.3): axes and the turn, held inside the contract's limits so no phone can send a spin. */
export function remoteInputMessage(m: RemoteMove): Extract<ShellToViewer, { t: "remote_input" }> {
  const c = (n: number, lim: number): number => (Number.isFinite(n) ? Math.min(lim, Math.max(-lim, n)) : 0);
  return { t: "remote_input", forward: c(m.forward, 1), strafe: c(m.strafe, 1), yawDelta: c(m.yawDelta, 0.5), pitchDelta: c(m.pitchDelta, 0.5) };
}

export type HostViewer = Readonly<{ send(m: ShellToViewer): void; move?(m: RemoteMove): void; /** The floor, spawn and bounds once the Viewer has them (`undefined`: not yet, `null`: never). */ anchorGround?(): AnchorGround | undefined | null }>;

/**
 * Everything the Viewer is told for one Host view: the sky (once per change) and the doors of the world (once per change: knock-door 8.1,
 * Requirement 9.1). `set_doors` carries each door's place, width, wall angle and whether it is open, and never its lock or a pattern: it is built
 * from the Public View's doors alone. A world with no doors sends nothing at first (the Viewer's default is no door) and an empty list only to
 * clear doors it was told about. `zones` are the places of the Zones on the plan for the wall's angle; without them every wall lies along x (the Host makes them from the Viewer's floor: `zone-places.ts`).
 */
export function viewerMessages(host: HostView, last: { sky: string | null; doors?: string; frames?: string }, zones: ZonePlaces = {}, spawn: Readonly<{ x: number; z: number }> | null = null): ShellToViewer[] {
  const out: ShellToViewer[] = [];
  const atmosphere = atmosphereFromSky(host.game.atmosphere);
  const key = atmosphere === null ? null : JSON.stringify(atmosphere);
  if (key !== last.sky) { last.sky = key; out.push({ t: "set_atmosphere", atmosphere }); }
  const doors = viewerDoors(host.game.pub?.doors, zones);
  const doorKey = JSON.stringify(doors);
  if (doorKey !== (last.doors ?? "[]")) { last.doors = doorKey; out.push({ t: "set_doors", doors }); }
  // an empty frame (no photo address yet) near each Zone that has a place, facing the spawn; none until both are known (party-mode 8.4)
  if (spawn !== null) {
    const ids = host.game.pub?.zones.map((z) => z.id) ?? [];
    const spots = frameSpots(ids.flatMap((id) => (zones[id] ? [{ id, x: zones[id]!.x, z: zones[id]!.z }] : [])), spawn, new Set(ids));
    const frames = spots.map((f) => ({ zone: f.zone, pos: [...f.pos] as [number, number, number], yaw: f.yaw, url: null }));
    const frameKey = JSON.stringify(frames);
    if (frameKey !== (last.frames ?? "[]")) { last.frames = frameKey; out.push({ t: "set_frames", frames }); }
  }
  return out;
}

import type { PublicDoor } from "./doors";

/**
 * What a phone feels when something happens at a place in the room (puzzles Requirement 25.4, knock-door 8.3): near and facing it, a buzz,
 * the picture shakes and the sound is full; far and facing it, the picture shakes and the sound is half; facing away, a faint sound only;
 * beyond 6 m, nothing. A port of `feel` in `tools/playtest/js/shake-core.js` (the lab's demo), kept the same by a parity test.
 * Positions are metres on the room's floor plan (`y` is the plan's `z`); `facing` is degrees, 0 = east, 90 = south.
 */
export const REACH = Object.freeze({ near: 2.5, far: 6 });
export type PhonePlace = Readonly<{ x: number; y: number; facing: number }>;
export type FeelLevel = "strong" | "soft" | "faint" | "none";
export type Felt = Readonly<{ level: FeelLevel; meters: number; buzz: boolean; picture: boolean; sound: number }>;

export function feel(from: Readonly<{ x: number; y: number }>, to: PhonePlace): Felt {
  const meters = Math.hypot(to.x - from.x, to.y - from.y);
  const base: FeelLevel = meters <= REACH.near ? "strong" : meters <= REACH.far ? "soft" : "none";
  if (base === "none") return { level: "none", meters, buzz: false, picture: false, sound: 0 };
  const bearing = (Math.atan2(from.y - to.y, from.x - to.x) * 180) / Math.PI; // from the phone to the source
  const off = Math.abs((((bearing - to.facing) % 360) + 540) % 360 - 180); // 0 = looking right at it
  if (off > 100) return { level: "faint", meters, buzz: false, picture: false, sound: 0.2 };
  return { level: base, meters, buzz: base === "strong", picture: true, sound: base === "strong" ? 1 : 0.5 };
}

/**
 * What a phone feels when a door opens or shuts at its place on the plan. `reducedMotion` keeps the picture still (25.5); `canBuzz: false`
 * (an iPhone in the browser) drops only the buzz, so the picture and the sound carry the meaning. A phone that does not know where it is
 * feels nothing, and the change is still said in words in the live region.
 */
export function doorFeel(door: Pick<PublicDoor, "at">, phone: PhonePlace | null, opts: Readonly<{ reducedMotion?: boolean; canBuzz?: boolean }> = {}): Felt {
  if (phone === null) return { level: "none", meters: Number.POSITIVE_INFINITY, buzz: false, picture: false, sound: 0 };
  const f = feel({ x: door.at.x, y: door.at.z }, phone);
  return { ...f, buzz: f.buzz && opts.canBuzz !== false, picture: f.picture && opts.reducedMotion !== true };
}

import type { Point } from "./zones";
import type { PublicDoor } from "./doors";
import { playerAtDoor } from "./door-view";

/**
 * What the TV draws for the doors (knock-door 2.4, 8.2, 8.4): one marker for each door on the diorama (the plan seen from above), shut or
 * open, the words for each change (for the live region), and the `creak` cue for a door that changed. Pure; it reads only the Public View's
 * doors and Zone names, so it shows no pattern, no lock answer and no card.
 */
export type ZoneName = Readonly<{ id: string; name: string }>;
export type DoorMarker = Readonly<{
  id: string;
  /** Place on the diorama as percent of its width and depth, so the picture needs no pixel size. */
  xPct: number;
  yPct: number;
  open: boolean;
  /** "Door between the Hall and the Library: shut". Words alone say the state, so colour is never the only sign. */
  label: string;
  /** A Player is within 1.5 m of this door. */
  atDoor: boolean;
}>;
export type DoorChange = Readonly<{ id: string; open: boolean; words: string }>;

const PAD_PCT = 10;
const nameOf = (zones: readonly ZoneName[], id: string): string => zones.find((z) => z.id === id)?.name ?? "a room";

export const doorWords = (d: Pick<PublicDoor, "a" | "b">, zones: readonly ZoneName[]): string => `the door between ${nameOf(zones, d.a)} and ${nameOf(zones, d.b)}`;

/** The markers, placed by the doors' own places spread over the picture with a margin. A world with no doors gives none. */
export function doorMarkers(doors: readonly PublicDoor[] | undefined | null, zones: readonly ZoneName[], players: readonly Point[] = []): DoorMarker[] {
  const list = doors ?? [];
  if (list.length === 0) return [];
  const xs = list.map((d) => d.at.x);
  const zs = list.map((d) => d.at.z);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const place = (v: number, lo: number, hi: number): number => (hi === lo || !Number.isFinite(v) ? 50 : PAD_PCT + ((v - lo) / (hi - lo)) * (100 - 2 * PAD_PCT));
  return list.map((d) => ({
    id: d.id,
    xPct: place(d.at.x, x0, x1),
    yPct: place(d.at.z, z0, z1),
    open: d.open,
    label: `${doorWords(d, zones).replace(/^t/, "T")}: ${d.open ? "open" : "shut"}`,
    atDoor: players.some((p) => playerAtDoor(d, p)),
  }));
}

/**
 * The doors that changed since `prev` (id to open). The first look at the doors (`prev` null) says nothing, so a page that loads
 * with its doors in their start state is quiet (8.4); a door not seen before is also quiet.
 */
export function doorChanges(prev: ReadonlyMap<string, boolean> | null, doors: readonly PublicDoor[] | undefined | null, zones: readonly ZoneName[]): DoorChange[] {
  if (prev === null) return [];
  const out: DoorChange[] = [];
  for (const d of doors ?? []) {
    const was = prev.get(d.id);
    if (was === undefined || was === d.open) continue;
    out.push({ id: d.id, open: d.open, words: `${doorWords(d, zones).replace(/^t/, "T")} ${d.open ? "opened" : "shut"}.` });
  }
  return out;
}

/** The open/shut state of every door, to hand back to `doorChanges` next time. */
export const doorStates = (doors: readonly PublicDoor[] | undefined | null): Map<string, boolean> => new Map((doors ?? []).map((d) => [d.id, d.open]));

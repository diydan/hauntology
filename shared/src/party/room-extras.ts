import { sanitizePose } from "../ghost/pose";
import type { Pose } from "../ghost/types";
import { hourStrike, type Strike } from "./hour";
import { estimateOffset, OFFSET_SAMPLES, type OffsetEstimate, type PingSample } from "./light";

/**
 * What the Room keeps around the Engine (party-mode 4.3, 4.5, 4.11, 4.17 to 4.19): the world the Master chose, the
 * Master's room switches, each phone's light consent and clock samples, the frozen sky and the last hour strike.
 * Everything here is pure; `RoomCore` only stores it and sends what it says. None of it reaches a rule: the Engine
 * never reads it, so the real world and the phone's own clock cannot change a game.
 */
export type WorldChoice = Readonly<{
  id: string;
  walkRadius: number;
  authoredZones: boolean;
  /** The world's own bounds, when the Host reported them; the pose clamp falls back to a wide box. */
  bounds?: Readonly<{ min: readonly [number, number, number]; max: readonly [number, number, number] }>;
}>;
/** The three cosmetic sky fields, the only part of the real world a Room keeps. */
export type Sky = Readonly<{ weather: string; timeOfDay: string; moon: string }>;
export type ConditionsChoice = "off" | "place" | "table";
export type RoomSwitches = Readonly<{ conditions: ConditionsChoice; hourStrike: boolean; lightBar: boolean; rattle: boolean; stitch: boolean }>;
export type LightPref = Readonly<{ consent: boolean; reducedMotion: boolean }>;

export type RoomExtras = Readonly<{
  world: WorldChoice | null;
  switches: RoomSwitches;
  /** The Host's offset from UTC in minutes (east positive), reported by the Host page; null until it does. */
  hostOffsetMin: number | null;
  /** The frozen cosmetic fields of the sky. The position, temperature and wind are never stored. */
  sky: Sky | null;
  light: Readonly<Record<number, LightPref>>;
  clock: Readonly<Record<number, readonly PingSample[]>>;
  lastStrike: Strike | null;
}>;

export const DEFAULT_SWITCHES: RoomSwitches = { conditions: "off", hourStrike: true, lightBar: true, rattle: true, stitch: false };
export const initialExtras = (): RoomExtras => ({ world: null, switches: DEFAULT_SWITCHES, hostOffsetMin: null, sky: null, light: {}, clock: {}, lastStrike: null });

/** A world is refused when it is too small to place six Zones and has none of its own (party-mode 4.5, `world_too_small`). */
export function chooseWorld(raw: unknown): { ok: true; world: WorldChoice } | { ok: false; code: "world_too_small" | "bad_request" } {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id.length === 0 || r.id.length > 64) return { ok: false, code: "bad_request" };
  if (typeof r.walkRadius !== "number" || !Number.isFinite(r.walkRadius) || r.walkRadius < 0 || r.walkRadius > 10_000) return { ok: false, code: "bad_request" };
  const authoredZones = r.authoredZones === true;
  if (r.walkRadius < 7 && !authoredZones) return { ok: false, code: "world_too_small" };
  const b = r.bounds as { min?: unknown; max?: unknown } | undefined;
  const vec = (v: unknown): [number, number, number] | null => (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n)) ? [v[0], v[1], v[2]] : null);
  const min = vec(b?.min);
  const max = vec(b?.max);
  const bounds = min !== null && max !== null && min.every((n, i) => n <= (max[i] as number)) ? { bounds: { min, max } } : {};
  return { ok: true, world: { id: r.id, walkRadius: r.walkRadius, authoredZones, ...bounds } };
}

const WIDE = 1_000;
const wideBounds = { min: [-WIDE, -WIDE, -WIDE], max: [WIDE, WIDE, WIDE] } as const;

/** The Host's pose made safe: always finite, always inside the world's bounds (a missing value keeps the last one). */
export function cleanPose(raw: unknown, world: WorldChoice | null, previous: Pose): Pose {
  const b = world?.bounds ?? wideBounds;
  return sanitizePose(raw, { min: [...b.min] as [number, number, number], max: [...b.max] as [number, number, number] }, previous);
}
export const ORIGIN_POSE: Pose = { pos: [0, 0, 0], yaw: 0 };

/** The Host pose is relayed at most this often (4 Hz). */
export const POSE_MIN_GAP_MS = 250;
export const poseDue = (lastMs: number | null, now: number): boolean => lastMs === null || now - lastMs >= POSE_MIN_GAP_MS;

/** Keep the last few clock samples of a seat and its estimate (party-mode 17.3). A sample must be sane: sent <= received, all finite. */
export function addClockSample(clock: RoomExtras["clock"], seat: number, raw: unknown): RoomExtras["clock"] {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const s: PingSample = { sentMs: Number(r.sentMs), serverMs: Number(r.serverMs), receivedMs: Number(r.receivedMs) };
  if (![s.sentMs, s.serverMs, s.receivedMs].every(Number.isFinite) || s.receivedMs < s.sentMs || s.receivedMs - s.sentMs > 60_000) return clock;
  return { ...clock, [seat]: [...(clock[seat] ?? []), s].slice(-OFFSET_SAMPLES) };
}
export const offsetOf = (clock: RoomExtras["clock"], seat: number): OffsetEstimate | null => estimateOffset(clock[seat] ?? []);

/** What a Master's switch message may change. Anything else in it is ignored. */
export function applySwitches(cur: RoomSwitches, raw: Readonly<Partial<Record<keyof RoomSwitches, unknown>>>): RoomSwitches {
  const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);
  const conditions = raw.conditions === "off" || raw.conditions === "place" || raw.conditions === "table" ? raw.conditions : cur.conditions;
  return { conditions, hourStrike: bool(raw.hourStrike, cur.hourStrike), lightBar: bool(raw.lightBar, cur.lightBar), rattle: bool(raw.rattle, cur.rattle), stitch: bool(raw.stitch, cur.stitch) };
}

/** The next hour strike after `now` and after the one already made, or null when the switch is off or the Host never said its offset. */
export function nextStrike(x: RoomExtras, now: number): Strike | null {
  if (x.hostOffsetMin === null) return null;
  return hourStrike(now, x.hostOffsetMin, x.lastStrike, x.switches.hourStrike);
}

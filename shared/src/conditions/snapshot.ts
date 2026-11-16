import { z } from "zod";
import { instantFor, validateMemoryDay, weatherRequestFor, type WeatherRequest } from "./memory-day";
import { moonPhase } from "./moon";
import { normalizePlace } from "./place";
import { localHour, timeOfDay } from "./time";
import { tempBand, weatherClassFromCode, windBand } from "./weather";
import {
  ConditionsSnapshotSchema, type Atmosphere, type ConditionsChoice, type ConditionsSnapshot, type MemoryDay, type PromptFields, type PublicConditions,
} from "./types";

/**
 * `snapshot.ts` (conditions 2.14, Requirements 2.1, 2.2, 2.4 and 2.5): the policy that reads the real world ONCE at the start of a game, freezes it, and lets three
 * small projections leave: `toAtmosphere` (the Viewer), `toPromptFields` (the Narrator) and `toPublicConditions` (the Public View). The clock, the weather call,
 * the cache and the timer are all injected, so this is pure and testable without a network. It never rejects: a failure, a timeout, an answer that does not fit,
 * the kill switch and a missing Place all give the Default weather (clear, mild, calm), while everything that needs no service (the place, the hour, the moon) is
 * kept. No rules module imports this file: the real world changes looks and words, never a rule.
 */

/** The weather call is given this long, then the Default is used (Requirement 2.4). */
export const WEATHER_TIMEOUT_MS = 3000;
/** An answer is kept this long, by rounded Place (Requirement 2.5). */
export const CACHE_TTL_SECONDS = 900;
export const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;

/** What a weather answer is boiled down to; `null` for a value the service did not give. Never carries a host, a URL or a coordinate. */
export const RawWeatherSchema = z
  .object({ code: z.number().finite().nullable(), tempC: z.number().finite().nullable(), windKmh: z.number().finite().nullable(), tz: z.string().min(1).max(64).nullable() })
  .strict();
export type RawWeather = z.infer<typeof RawWeatherSchema>;

export type { WeatherRequest };

export interface ConditionsCache {
  get(key: string): Promise<RawWeather | null>;
  put(key: string, value: RawWeather, ttlSeconds: number): Promise<void>;
}

/** What happened during a read, one word each, for counters (never a place, a query or a value): `disabled`, `no_place`, `cache_hit`, `call`, `timeout`, `error`, `empty`. */
export type ReadNote = "disabled" | "no_place" | "cache_hit" | "call" | "timeout" | "error" | "empty";

export type ReadDeps = {
  /** The clock, in milliseconds since 1970. */
  now: () => number;
  /** `CONDITIONS_ENABLED`. Off: the Default and no outside call. */
  enabled: boolean;
  fetchWeather: (request: WeatherRequest) => Promise<RawWeather>;
  cache: ConditionsCache;
  /** The timer of the 3 second limit. */
  sleep: (ms: number) => Promise<void>;
  note?: (note: ReadNote) => void;
};

/** The Default: no Place, the host's hour, a clear mild calm sky and the moon of the date. */
export function defaultSnapshot(nowMs: number, hostHour: number): ConditionsSnapshot {
  return freezeSnapshot({ timeOfDay: timeOfDay(hostHour), weather: "clear", tempBand: "mild", windBand: "calm", moon: moonPhase(nowMs), source: "default" });
}

/** Freezes a snapshot and everything inside it (the Place, the Memory Day, the stars), so nothing can change the sky of a game once it is read. */
export function freezeSnapshot(snapshot: ConditionsSnapshot): ConditionsSnapshot {
  const freeze = (x: unknown): void => {
    if (typeof x !== "object" || x === null || Object.isFrozen(x)) return;
    for (const v of Object.values(x)) freeze(v);
    Object.freeze(x);
  };
  freeze(snapshot);
  return snapshot;
}

const fixed2 = (x: number): string => (Math.round(x * 100) / 100 + 0).toFixed(2);

/** `forecast:<lat>:<lon>` or `archive:<lat>:<lon>:<date>:<hour>`, from the rounded values only: no session, no label. */
export function cacheKey(request: WeatherRequest): string {
  return request.kind === "forecast" ? `forecast:${fixed2(request.lat)}:${fixed2(request.lon)}` : `archive:${fixed2(request.lat)}:${fixed2(request.lon)}:${request.date}:${request.hour}`;
}

/** Whether an answer stored at `storedAtMs` may still be used at `nowMs`: for less than 15 minutes, and not from the future. */
export function isFresh(storedAtMs: number, nowMs: number, ttlMs: number = CACHE_TTL_MS): boolean {
  return Number.isFinite(storedAtMs) && Number.isFinite(nowMs) && nowMs >= storedAtMs && nowMs - storedAtMs < ttlMs;
}

type Race = { k: "ok"; v: unknown } | { k: "timeout" } | { k: "error" };

/**
 * Reads one Snapshot, once. Steps: (1) off, or no Place and no Memory Day: the Default, no call; (2) a Memory Day that does not validate is ignored; (3) one request,
 * the archive when a Memory Day is set, else the forecast; (4) the cache, else the call raced against 3 seconds; (5) the answer mapped to a class and two bands;
 * (6) the Time of Day, the moon; (7) frozen. Stars are not computed yet (conditions task 6). Never rejects.
 */
export async function readSnapshot(choice: ConditionsChoice, deps: ReadDeps): Promise<ConditionsSnapshot> {
  let now = 0;
  const hostHour = Number.isInteger(choice?.hostHour) ? (choice.hostHour as number) : 12;
  const note = (n: ReadNote): void => {
    try {
      deps.note?.(n);
    } catch {
      // a counter that fails changes nothing
    }
  };
  try {
    now = deps.now();
    if (!deps.enabled) {
      note("disabled");
      return defaultSnapshot(now, hostHour);
    }

    const memory = readMemoryDay(choice.memoryDay, now);
    const placed = choice.place === undefined ? null : normalizePlace(choice.place);
    const place = placed !== null && placed.ok ? placed.place : undefined;

    if (place === undefined) {
      note("no_place");
      if (memory === undefined) return defaultSnapshot(now, hostHour);
      return finish({ timeOfDay: memory.timeOfDay, weather: "clear", tempBand: "mild", windBand: "calm", moon: moonPhase(instantFor(memory, 0)), memoryDay: memory, source: "default" }, now, hostHour);
    }

    const request = weatherRequestFor(place, memory);
    const key = cacheKey(request);
    let raw = await cached(deps.cache, key);
    if (raw !== null) {
      note("cache_hit");
    } else {
      note("call");
      const got = await race(deps, request);
      if (got.k === "timeout") note("timeout");
      else if (got.k === "error") note("error");
      else {
        const parsed = RawWeatherSchema.safeParse(got.v);
        if (parsed.success && parsed.data.code !== null) {
          raw = parsed.data;
          await put(deps.cache, key, raw);
        } else {
          note("empty"); // malformed, or the service had no weather for that hour
        }
      }
    }

    const rawZone = raw !== null && raw.tz !== null && localHour(now, raw.tz) !== null ? raw.tz : null;
    const zone = place.tz ?? rawZone;
    return finish(
      {
        place: { ...place, tz: zone },
        timeOfDay: memory === undefined ? timeOfDay(localHour(now, zone) ?? hostHour) : memory.timeOfDay,
        weather: raw === null ? "clear" : weatherClassFromCode(raw.code),
        tempBand: raw === null ? "mild" : tempBand(raw.tempC),
        windBand: raw === null ? "calm" : windBand(raw.windKmh),
        moon: moonPhase(memory === undefined ? now : instantFor(memory, place.lon)),
        ...(memory === undefined ? {} : { memoryDay: memory }),
        source: raw === null ? "default" : memory === undefined ? "live" : "memory",
      },
      now,
      hostHour,
    );
  } catch {
    return defaultSnapshot(now, hostHour);
  }
}

function readMemoryDay(raw: unknown, now: number): MemoryDay | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = validateMemoryDay((raw as Record<string, unknown>)["date"], (raw as Record<string, unknown>)["timeOfDay"], new Date(now));
  return r.ok ? r.memoryDay : undefined;
}

/** A snapshot that must fit the schema before it is kept; anything that does not is the Default. */
function finish(candidate: unknown, now: number, hostHour: number): ConditionsSnapshot {
  const checked = ConditionsSnapshotSchema.safeParse(candidate);
  return checked.success ? freezeSnapshot(checked.data) : defaultSnapshot(now, hostHour);
}

async function cached(cache: ConditionsCache, key: string): Promise<RawWeather | null> {
  try {
    const hit = await cache.get(key);
    const ok = RawWeatherSchema.safeParse(hit);
    return ok.success && ok.data.code !== null ? ok.data : null;
  } catch {
    return null;
  }
}

async function put(cache: ConditionsCache, key: string, raw: RawWeather): Promise<void> {
  try {
    await cache.put(key, raw, CACHE_TTL_SECONDS);
  } catch {
    // an answer that cannot be kept is simply not kept
  }
}

/** One call against the clock: whichever settles first. The call is made once and never retried. */
async function race(deps: ReadDeps, request: WeatherRequest): Promise<Race> {
  const call: Promise<Race> = (async () => deps.fetchWeather(request))().then(
    (v): Race => ({ k: "ok", v }),
    (): Race => ({ k: "error" }),
  );
  const timer: Promise<Race> = (async () => deps.sleep(WEATHER_TIMEOUT_MS))().then(
    (): Race => ({ k: "timeout" }),
    (): Race => ({ k: "error" }),
  );
  return Promise.race([call, timer]);
}

/** What the Viewer may use: no coordinates, no label, no date, no source. */
export function toAtmosphere(s: ConditionsSnapshot): Atmosphere {
  return {
    timeOfDay: s.timeOfDay,
    weather: s.weather,
    tempBand: s.tempBand,
    windBand: s.windBand,
    moon: s.moon,
    ...(s.stars === undefined ? {} : { stars: s.stars.map((x) => ({ ...x })) }),
    ...(s.moonSky === undefined ? {} : { moonSky: { ...s.moonSky } }),
  };
}

/**
 * The Atmosphere a game shows: `null` (the normal look) for the pure Default, where nothing was chosen (no Place and no Memory Day) or the feature is off, so a game
 * with conditions off looks as it did before; otherwise the snapshot's own.
 */
export function atmosphereForGame(s: ConditionsSnapshot | null | undefined): Atmosphere | null {
  if (s === null || s === undefined) return null;
  if (s.place === undefined && s.memoryDay === undefined) return null;
  return toAtmosphere(s);
}

/** The only fields a narrator prompt may carry: three closed words. Nothing when the weather was not read (the Default), so the prompt is then the one with no sky. */
export function toPromptFields(s: ConditionsSnapshot | null | undefined): PromptFields | undefined {
  if (s === null || s === undefined || s.source === "default") return undefined;
  return { weather: s.weather, timeBucket: s.timeOfDay, moon: s.moon };
}

/** The only fields a Public View may carry. */
export function toPublicConditions(s: ConditionsSnapshot): PublicConditions {
  return { timeOfDay: s.timeOfDay, weather: s.weather, moon: s.moon };
}

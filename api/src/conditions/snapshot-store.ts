import { readSnapshot, type ConditionsCache, type RawWeather, type ReadNote, type WeatherRequest } from "@hauntology/shared/conditions/snapshot";
import type { ConditionsChoice, ConditionsSnapshot, Place } from "@hauntology/shared/conditions/types";
import { SILENT, type Logger } from "../log";
import { defaultConditionsCache } from "./cache";
import { geocode, weatherBaseFrom, weatherFetcher, type WeatherFetch } from "./open-meteo";

/**
 * The snapshot store of a new game (conditions 3.3 and 3.4; ghost-engine 3.1): the game's start reads the real world ONCE, through `readSnapshot`, and the game keeps what
 * it read, frozen, inside its own stored record (`PlaySession`, deleted with it); nothing here is called again for that game, so a turn, the view and "Haunt again"
 * never read the weather. This module only turns what the browser sent into a choice (tolerantly: a body that is not one means the Default, and a Place's extra fields
 * are ignored by `normalizePlace`), runs the read with the real parts, and writes one counter line. Off (`CONDITIONS_ENABLED=false`, or a `WEATHER_BASE_URL` that is not
 * acceptable): the Default and no outside call. Never rejects.
 */
export interface ConditionsService {
  /** The one read for a game that is starting. `choice` is whatever the request carried under `conditions`. */
  read(choice: unknown): Promise<ConditionsSnapshot>;
}

export type ConditionsParts = {
  enabled: boolean;
  fetchWeather: (request: WeatherRequest) => Promise<RawWeather>;
  cache: ConditionsCache;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  log?: Logger;
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** What the browser sent, as a choice. Whatever is wrong with a part (a bad Place, a bad Memory Day) is left for `readSnapshot` to refuse, which it does by ignoring that part. */
export function choiceFrom(raw: unknown, now: number): ConditionsChoice {
  const o = isObject(raw) ? raw : {};
  const hostHour = typeof o["hostHour"] === "number" && Number.isInteger(o["hostHour"]) && o["hostHour"] >= 0 && o["hostHour"] <= 23 ? o["hostHour"] : new Date(now).getUTCHours();
  const day = isObject(o["memoryDay"]) ? { date: o["memoryDay"]["date"], timeOfDay: o["memoryDay"]["timeOfDay"] } : undefined;
  return { hostHour, ...(isObject(o["place"]) ? { place: o["place"] as never } : {}), ...(day === undefined ? {} : { memoryDay: day as never }) };
}

const REASONS: readonly ReadNote[] = ["disabled", "no_place", "timeout", "error", "empty"];

export function createConditionsService(parts: ConditionsParts): ConditionsService {
  const log = parts.log ?? SILENT;
  return {
    async read(raw) {
      const notes: ReadNote[] = [];
      let now = 0;
      try {
        now = parts.now();
      } catch {
        // readSnapshot reads the clock again and falls back to the Default on its own
      }
      const snapshot = await readSnapshot(choiceFrom(raw, now), { now: parts.now, enabled: parts.enabled, fetchWeather: parts.fetchWeather, cache: parts.cache, sleep: parts.sleep, note: (n) => void notes.push(n) });
      log.info("conditions.read", { source: snapshot.source, reason: REASONS.find((r) => notes.includes(r)) ?? "ok", cache: notes.includes("cache_hit") });
      return snapshot;
    },
  };
}

export type ConditionsEnv = { CONDITIONS_ENABLED?: string; WEATHER_BASE_URL?: string };

/**
 * The service from the Worker's settings: on unless `CONDITIONS_ENABLED` is `false` or `WEATHER_BASE_URL` is set to something that is not acceptable (anything but an https or
 * loopback address). The parts are replaceable so a test can give a fake fetch, cache, clock and timer; by default the call is the global `fetch`, looked up when called.
 */
export function conditionsFromEnv(env: ConditionsEnv, overrides: Partial<Pick<ConditionsParts, "cache" | "now" | "sleep" | "log">> & { fetch?: WeatherFetch } = {}): ConditionsService {
  const base = weatherBaseFrom(env.WEATHER_BASE_URL);
  const now = overrides.now ?? Date.now;
  const call: WeatherFetch = overrides.fetch ?? ((url, init) => globalThis.fetch(url, init));
  return createConditionsService({
    enabled: env.CONDITIONS_ENABLED !== "false" && base.ok,
    fetchWeather: weatherFetcher({ fetch: call, base: base.ok ? base.base : null }),
    cache: overrides.cache ?? defaultConditionsCache(now),
    now,
    sleep: overrides.sleep ?? ((ms) => new Promise<void>((resolve) => void setTimeout(resolve, ms))),
    ...(overrides.log === undefined ? {} : { log: overrides.log }),
  });
}

export type GeocoderService = Readonly<{
  enabled: boolean;
  search: (query: string) => Promise<Place[]>;
}>;

/** City-search adapter from `CONDITIONS_ENABLED` and `WEATHER_BASE_URL` (conditions 3.4, 3.5); keeps all upstream calls inside `api/src/conditions/`. */
export function geocoderFromEnv(env: ConditionsEnv, overrides: { fetch?: WeatherFetch } = {}): GeocoderService {
  const base = weatherBaseFrom(env.WEATHER_BASE_URL);
  const call: WeatherFetch = overrides.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const enabled = env.CONDITIONS_ENABLED !== "false" && base.ok;
  return {
    enabled,
    search: (query) => (enabled && base.ok ? geocode(query, { fetch: call, base: base.base }) : Promise.resolve([])),
  };
}

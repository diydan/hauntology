import { z } from "zod";
import { normalizeMatches } from "./place";
import type { RawWeather } from "./snapshot";
import type { Place } from "./types";

/**
 * What the weather service's three answers are boiled down to (conditions 3.1, design "The Open-Meteo calls"). Pure: each function takes the parsed JSON of an
 * answer and returns only the fields the game uses, or `null`; every other field of the answer (the host, the elevation, the units, the generation time) is dropped
 * here, so nothing the service says can travel further. The shapes are from the public documentation as remembered and unverified until Spike conditions 1.1.
 */

const num = z.number().finite().nullish();
const zone = z.string().min(1).max(64).nullish();

const ForecastSchema = z.object({ timezone: zone, current: z.object({ weather_code: num, temperature_2m: num, wind_speed_10m: num }) });
const ArchiveSchema = z.object({
  timezone: zone,
  hourly: z.object({ time: z.array(z.string().max(32)).max(48), weather_code: z.array(num).max(48), temperature_2m: z.array(num).max(48), wind_speed_10m: z.array(num).max(48) }),
});
const GeocodeSchema = z.object({
  results: z
    .array(z.object({ name: z.string().max(120), admin1: z.string().max(120).nullish(), country: z.string().max(120).nullish(), latitude: z.number().finite(), longitude: z.number().finite(), timezone: zone }))
    .max(50)
    .optional(),
});

/** The current weather at a position, or `null` when the answer is not one. */
export function parseForecast(json: unknown): RawWeather | null {
  const r = ForecastSchema.safeParse(json);
  if (!r.success) return null;
  const { current, timezone } = r.data;
  return { code: current.weather_code ?? null, tempC: current.temperature_2m ?? null, windKmh: current.wind_speed_10m ?? null, tz: timezone ?? null };
}

/** The weather of one hour of a recorded day: the entry stamped with that hour (the times are local, as the call asks for `timezone=auto`), else the entry at that index of a full day. */
export function parseArchive(json: unknown, hour: number): RawWeather | null {
  const r = ArchiveSchema.safeParse(json);
  if (!r.success || !Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  const { hourly, timezone } = r.data;
  const stamp = `T${String(hour).padStart(2, "0")}:00`;
  let at = hourly.time.findIndex((t) => t.endsWith(stamp));
  if (at < 0 && hourly.time.length === 24) at = hour;
  if (at < 0) return null;
  return { code: hourly.weather_code[at] ?? null, tempC: hourly.temperature_2m[at] ?? null, windKmh: hourly.wind_speed_10m[at] ?? null, tz: timezone ?? null };
}

/** At most five Places from a city search answer, each rounded to two decimals, with a label made of the name, the region and the country; an answer with no results is an empty list. `null` when it is not an answer. */
export function parseGeocode(json: unknown): Place[] | null {
  // The service says a refused request as `{ error: true, reason }` (it comes with a 400, which the caller already refuses); an answer with no `results` and no `error` is a search that found nothing.
  if (typeof json === "object" && json !== null && (json as { error?: unknown }).error === true) return null;
  const r = GeocodeSchema.safeParse(json);
  if (!r.success) return null;
  return normalizeMatches(
    (r.data.results ?? []).map((m) => ({ lat: m.latitude, lon: m.longitude, tz: m.timezone ?? null, label: [m.name, m.admin1, m.country].filter((x): x is string => typeof x === "string" && x !== "").join(", ") })),
  );
}

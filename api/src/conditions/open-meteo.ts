import { isRealDate } from "@hauntology/shared/conditions/memory-day";
import { parseArchive, parseForecast, parseGeocode } from "@hauntology/shared/conditions/open-meteo-answers";
import type { RawWeather, WeatherRequest } from "@hauntology/shared/conditions/snapshot";
import type { Place } from "@hauntology/shared/conditions/types";

/**
 * The ONE module that talks to an outside weather host (conditions 3.1, 3.6; Requirements 1.1, 2.3, 2.4, 3.2). Open-Meteo is not paid and takes no SpendTicket, but it is
 * an outside host, so every call goes through here: a 3 second limit (`AbortSignal.timeout`), parameters made only of validated numbers and, for a city search, one
 * trimmed and URL-encoded name of at most 60 characters, answers parsed down to the fields the game uses (`shared/src/conditions/open-meteo-answers.ts`), and nothing
 * logged (not a position, a name or a URL: a failure is a bare `weather_unavailable`). No other file under `api/src` or `shared/src` names an Open-Meteo host
 * (`tools/test/conditions-privacy.test.mjs`). The endpoints and parameters are from the public documentation as remembered and unverified until Spike conditions 1.1.
 *
 * `WEATHER_BASE_URL` (unset: the public hosts below) is one base address for all three paths, for a fake in a test, a self-hosted copy or a paid endpoint; it must be an
 * https address or a loopback address, with no login in it, or the whole feature is off (`weatherBaseFrom`).
 */
export const PUBLIC_HOSTS = { forecast: "https://api.open-meteo.com", archive: "https://archive-api.open-meteo.com", geocoding: "https://geocoding-api.open-meteo.com" } as const;
export const REQUEST_TIMEOUT_MS = 3000;
/** A weather answer is a few hundred bytes; a body larger than this is not one. */
export const BODY_MAX = 200_000;
export const QUERY_MAX = 60;

/** The part of a `Response` this module reads, so a test can hand over a plain object. */
export type WeatherResponse = { ok: boolean; status: number; text(): Promise<string> };
export type WeatherFetch = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<WeatherResponse>;
export type OpenMeteoDeps = {
  fetch: WeatherFetch;
  /** One base address for all three paths, or `null` for the public hosts. */
  base: string | null;
  /** The limit of one call; tests pass a fake that records it. */
  signal?: (ms: number) => AbortSignal;
};

/** `{ok: true, base: null}` for unset, an https or loopback address with no login, query or fragment for a base, and `{ok: false}` for anything else (which turns the feature off). */
export function weatherBaseFrom(value: string | undefined): { ok: true; base: string | null } | { ok: false } {
  if (value === undefined || value.trim() === "") return { ok: true, base: null };
  let u: URL;
  try {
    u = new URL(value.trim());
  } catch {
    return { ok: false };
  }
  const loopback = u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]";
  const acceptable = (u.protocol === "https:" || (u.protocol === "http:" && loopback)) && u.username === "" && u.password === "" && u.search === "" && u.hash === "";
  return acceptable ? { ok: true, base: `${u.origin}${u.pathname.replace(/\/+$/, "")}` } : { ok: false };
}

const fixed2 = (x: number): string => {
  if (!Number.isFinite(x)) throw new Error("weather_unavailable");
  return (Math.round(x * 100) / 100 + 0).toFixed(2);
};

/** Control characters out, trimmed, at most 60 characters. */
// eslint-disable-next-line no-control-regex
const cleanQuery = (q: string): string => q.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, QUERY_MAX).trim();

async function getJson(url: string, deps: OpenMeteoDeps): Promise<unknown> {
  try {
    const res = await deps.fetch(url, { signal: (deps.signal ?? ((ms) => AbortSignal.timeout(ms)))(REQUEST_TIMEOUT_MS), headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("status");
    const text = await res.text();
    if (text.length > BODY_MAX) throw new Error("size");
    return JSON.parse(text) as unknown;
  } catch {
    // whatever it was (an abort, a network error, a bad status, text that is not JSON), its message may hold the address and so the position: it is dropped here
    throw new Error("weather_unavailable");
  }
}

const hostFor = (deps: OpenMeteoDeps, which: keyof typeof PUBLIC_HOSTS): string => deps.base ?? PUBLIC_HOSTS[which];

/** The weather now at a position. Throws `weather_unavailable` when the call fails, is slow, or answers something that is not weather. */
export async function forecast(lat: number, lon: number, deps: OpenMeteoDeps): Promise<RawWeather> {
  const url = `${hostFor(deps, "forecast")}/v1/forecast?latitude=${fixed2(lat)}&longitude=${fixed2(lon)}&current=weather_code,temperature_2m,wind_speed_10m&timezone=auto`;
  const got = parseForecast(await getJson(url, deps));
  if (got === null) throw new Error("weather_unavailable");
  return got;
}

/** The recorded weather of one hour of a day. A `null` code in the answer means the archive had no data for it; the reader treats that as no weather. */
export async function archive(lat: number, lon: number, date: string, hour: number, deps: OpenMeteoDeps): Promise<RawWeather> {
  if (!isRealDate(date) || !Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error("weather_unavailable");
  const url = `${hostFor(deps, "archive")}/v1/archive?latitude=${fixed2(lat)}&longitude=${fixed2(lon)}&start_date=${date}&end_date=${date}&hourly=weather_code,temperature_2m,wind_speed_10m&timezone=auto`;
  const got = parseArchive(await getJson(url, deps), hour);
  if (got === null) throw new Error("weather_unavailable");
  return got;
}

/** City search (conditions 3.5 is the route that will call it): at most five matches, each rounded to two decimals. An empty name asks nothing and finds nothing. */
export async function geocode(name: string, deps: OpenMeteoDeps): Promise<Place[]> {
  const q = cleanQuery(typeof name === "string" ? name : "");
  if (q === "") return [];
  const got = parseGeocode(await getJson(`${hostFor(deps, "geocoding")}/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`, deps));
  if (got === null) throw new Error("weather_unavailable");
  return got;
}

/** The `fetchWeather` of `readSnapshot`: one weather request, to the forecast or the archive. */
export const weatherFetcher =
  (deps: OpenMeteoDeps) =>
  (request: WeatherRequest): Promise<RawWeather> =>
    request.kind === "forecast" ? forecast(request.lat, request.lon, deps) : archive(request.lat, request.lon, request.date, request.hour, deps);

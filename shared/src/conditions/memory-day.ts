import { REP_HOUR } from "./time";
import { TIMES_OF_DAY, type MemoryDay, type Place, type TimeOfDay } from "./types";

/**
 * `memory-day.ts` (conditions 2.10, Requirements 3.1 and 3.2): a day that mattered, chosen by the visitor. It is a real calendar date from 1940-01-01 up to
 * yesterday, with a Time of Day, and nothing else; it changes only the moon, the stars and the recorded weather, never a rule.
 */
export const MIN_MEMORY_DATE = "1940-01-01";

export type MemoryDayResult = { ok: true; memoryDay: MemoryDay } | { ok: false; code: "bad_memory_day" };

const pad = (n: number, width: number): string => String(n).padStart(width, "0");
/** The date a `Date` shows in the host's own calendar, as "YYYY-MM-DD". */
const dateText = (d: Date): string => `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;

/** Whether `date` is a real calendar date written as "YYYY-MM-DD" (30 February and the like are not). */
export function isRealDate(date: unknown): date is string {
  if (typeof date !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (m === null) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // `setUTCFullYear` keeps a year under 100 as it is (`Date.UTC` would make it 19xx). A day that is not in its month (30 February, day 0, day 32) rolls the date into
  // another month, so the month is enough.
  const t = new Date(0);
  t.setUTCFullYear(y, mo - 1, d);
  return t.getUTCMonth() === mo - 1;
}

/** The last date that may be chosen: the day before `today`, in the host's calendar (the same rule as the photo reader's). */
export function lastMemoryDate(today: Date): string {
  return dateText(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
}

/** Accepts exactly the real calendar dates from 1940-01-01 to yesterday, with one of the four Times of Day; anything else is `bad_memory_day`. */
export function validateMemoryDay(date: unknown, time: unknown, today: Date): MemoryDayResult {
  if (!isRealDate(date) || typeof time !== "string" || !(TIMES_OF_DAY as readonly string[]).includes(time)) return { ok: false, code: "bad_memory_day" };
  if (date < MIN_MEMORY_DATE || date > lastMemoryDate(today)) return { ok: false, code: "bad_memory_day" };
  return { ok: true, memoryDay: { date, timeOfDay: time as TimeOfDay } };
}

/**
 * The instant of the Memory Day for the sky: the date at the middle hour of its Time of Day, in local solar time at the longitude (the UTC hour is the local
 * hour minus longitude over 15), so the sky matches the chosen Time of Day without a time zone database. The longitude is the Place's, or 0 with none.
 */
export function instantFor(memoryDay: MemoryDay, lon: number): number {
  const [y, mo, d] = memoryDay.date.split("-").map(Number) as [number, number, number];
  const solarOffsetHours = Number.isFinite(lon) ? lon / 15 : 0;
  return Date.UTC(y, mo - 1, d) + (REP_HOUR[memoryDay.timeOfDay] - solarOffsetHours) * 3_600_000;
}

/** What the weather call asks for (conditions design, "The Open-Meteo calls"): now at a position, or one hour of a recorded day. Positions are the Place's, already rounded. */
export type WeatherRequest =
  | { kind: "forecast"; lat: number; lon: number }
  | { kind: "archive"; lat: number; lon: number; date: string; hour: number };

/** A Place with a Memory Day always asks the archive for that date, at the hour of its Time of Day, and never the forecast; a Place alone asks the forecast. */
export function weatherRequestFor(place: Pick<Place, "lat" | "lon">, memoryDay?: MemoryDay): WeatherRequest {
  return memoryDay === undefined
    ? { kind: "forecast", lat: place.lat, lon: place.lon }
    : { kind: "archive", lat: place.lat, lon: place.lon, date: memoryDay.date, hour: REP_HOUR[memoryDay.timeOfDay] };
}

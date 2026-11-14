import type { ConditionsChoice, MemoryDay, PlaceInput, TimeOfDay } from "../conditions/types";
import { TIMES_OF_DAY } from "../conditions/types";
import type { PlaceMatch } from "./api";

/**
 * The pure parts of the "Set the sky" card (Requirement 12.1). The card is optional and never makes
 * Wander or a case wait: with nothing chosen there is no `ConditionsChoice` at all, and the server
 * applies the default sky. Nothing here reads a clock or the browser: dates and the hour are passed in.
 */

/** A Memory Day is a date from 1940 to yesterday. */
export const MEMORY_DAY_MIN = "1940-01-01";

export { TIMES_OF_DAY };
export const TIME_LABELS: Record<TimeOfDay, string> = { dawn: "Dawn", day: "Day", dusk: "Dusk", night: "Night" };

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** The local calendar date of `d`, as `YYYY-MM-DD`. */
export const isoDate = (d: Date): string => `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The last day that may be chosen: yesterday, in the visitor's own calendar. */
export function memoryDayMax(today: Date): string {
  const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  return isoDate(y);
}

/** `null` when `date` is a real calendar day from 1940 to yesterday; `format` for anything that is not a date; `range` for a real date outside the bounds. */
export function memoryDayError(date: string, today: Date): "format" | "range" | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (m === null) return "format";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const real = new Date(y, mo - 1, d);
  // A date that rolls over (month 13, February 30) changes the year or the day, so these two are enough.
  if (real.getFullYear() !== y || real.getDate() !== d) return "format";
  return date < MEMORY_DAY_MIN || date > memoryDayMax(today) ? "range" : null;
}

export const MEMORY_DAY_ERROR_COPY: Record<"format" | "range", string> = {
  format: "That is not a date. Use the date picker, or leave this empty.",
  range: "Pick a day from 1940 up to yesterday.",
};

const round2 = (x: number): number => Math.round(x * 100) / 100;

/** A searched place as the Host needs it: the position the server already rounded, rounded again so nothing finer can pass. */
export const placeFromMatch = (m: PlaceMatch): PlaceInput => ({ lat: round2(m.lat), lon: round2(m.lon), tz: m.tz, label: m.label });

/** The visitor's position from the browser, cut to two decimals (about a kilometre) before it goes anywhere, with no time zone name. */
export const placeFromPosition = (lat: number, lon: number): PlaceInput => ({ lat: round2(lat), lon: round2(lon), tz: null, label: "Your location" });

/** The choice the card holds, or `undefined` when the visitor chose nothing (the default sky applies). `hostHour` is the visitor's own hour, 0 to 23. */
export function conditionsChoice(parts: { place?: PlaceInput | undefined; memoryDay?: MemoryDay | undefined; hostHour: number }): ConditionsChoice | undefined {
  if (parts.place === undefined && parts.memoryDay === undefined) return undefined;
  return {
    ...(parts.place === undefined ? {} : { place: parts.place }),
    ...(parts.memoryDay === undefined ? {} : { memoryDay: parts.memoryDay }),
    hostHour: Math.min(23, Math.max(0, Math.trunc(parts.hostHour))),
  };
}

/** The line under the card's Memory Day when a photo's date was suggested (Requirement 12.2). */
export const SUGGESTED_DAY_LINE = "Taken from your photo. Change it or clear it.";

export const LOCATION_FAILED_LINE = "We couldn't get your location. Search for a city instead, or leave the sky as it is.";

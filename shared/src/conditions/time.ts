import type { TimeOfDay } from "./types";

/**
 * `time.ts` of the conditions spec (design, "Time of Day"). Local hour 5 to 7 is dawn, 8 to 17 is day, 18 to 20 is dusk, and 21 to 4 is night. An hour
 * outside 0 to 23 wraps around the clock; a value that is not a finite number is night. `localHour` reads the hour at a place from its IANA zone name and
 * the injected instant, so no clock is read here.
 */
export function timeOfDay(hour: number): TimeOfDay {
  // NaN and the infinities give NaN here, which fails every comparison below and so is night.
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  if (h >= 5 && h <= 7) return "dawn";
  if (h >= 8 && h <= 17) return "day";
  if (h >= 18 && h <= 20) return "dusk";
  return "night";
}

/** The middle hour of each Time of Day, used for the sky of a Memory Day (a day with no hour of its own): dawn 6, day 12, dusk 19, night 23. */
export const REP_HOUR: Readonly<Record<TimeOfDay, number>> = Object.freeze({ dawn: 6, day: 12, dusk: 19, night: 23 });

/**
 * The hour (0 to 23) at the instant `nowMs` (milliseconds since 1970) in the zone `tz`, or `null` when the zone is missing or not one the runtime knows or
 * the instant is not a real time. The caller then uses the host's own hour.
 */
export function localHour(nowMs: number, tz: string | null | undefined): number | null {
  if (typeof tz !== "string" || tz === "") return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).formatToParts(new Date(nowMs));
    const hour = parts.find((p) => p.type === "hour");
    if (hour === undefined) return null;
    const n = Number(hour.value);
    return Number.isInteger(n) ? ((n % 24) + 24) % 24 : null;
  } catch {
    return null; // an unknown zone name, or an instant that is not a time (NaN, an infinity, past the range a Date can hold): the formatter throws a RangeError
  }
}

import type { TimeOfDay } from "./types";

/**
 * The part of `time.ts` (conditions design) the web shell needs for a photo's capture hour. Local
 * hour 5 to 7 is dawn, 8 to 17 is day, 18 to 20 is dusk, and 21 to 4 is night. An hour outside 0 to 23
 * wraps around the clock; a value that is not a finite number is night. The rest of the file
 * (`localHour`, `REP_HOUR`) comes with the conditions spec's own tasks.
 */
export function timeOfDay(hour: number): TimeOfDay {
  // NaN and the infinities give NaN here, which fails every comparison below and so is night.
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  if (h >= 5 && h <= 7) return "dawn";
  if (h >= 8 && h <= 17) return "day";
  if (h >= 18 && h <= 20) return "dusk";
  return "night";
}

import type { TempBand, WeatherClass, WindBand } from "./types";

/**
 * `weather.ts` (conditions 2.6, Requirement 2.3): what the weather service's numbers mean to the game. Total by construction: any value, NaN or null gives one
 * Weather Class, one Temperature Band and one Wind Band. The WMO code table is from the public Open-Meteo documentation as remembered; Spike conditions 1.1
 * checks it against a recorded answer. The thresholds are starting values, kept as constants.
 */

/** 0 and 1 clear; 2 and 3 cloud; 45 and 48 fog; 51 to 67 and 80 to 82 rain; 71 to 77, 85 and 86 snow; 95, 96 and 99 storm; anything else (a number that is not one of those, NaN, null, text) clear. */
export function weatherClassFromCode(code: unknown): WeatherClass {
  if (typeof code !== "number" || !Number.isInteger(code)) return "clear";
  if (code === 2 || code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code === 95 || code === 96 || code === 99) return "storm";
  return "clear";
}

/** Degrees Celsius: below 0 freezing, below 10 cold, below 20 mild, below 28 warm, otherwise hot; anything that is not a number is mild. */
export const TEMP_EDGES = { freezing: 0, cold: 10, mild: 20, warm: 28 } as const;
export function tempBand(tempC: unknown): TempBand {
  if (typeof tempC !== "number" || Number.isNaN(tempC)) return "mild";
  if (tempC < TEMP_EDGES.freezing) return "freezing";
  if (tempC < TEMP_EDGES.cold) return "cold";
  if (tempC < TEMP_EDGES.mild) return "mild";
  if (tempC < TEMP_EDGES.warm) return "warm";
  return "hot";
}

/** Kilometres an hour: below 12 calm, below 29 breezy, otherwise windy; anything that is not a number is calm. */
export const WIND_EDGES = { calm: 12, breezy: 29 } as const;
export function windBand(windKmh: unknown): WindBand {
  if (typeof windKmh !== "number" || Number.isNaN(windKmh)) return "calm";
  if (windKmh < WIND_EDGES.calm) return "calm";
  if (windKmh < WIND_EDGES.breezy) return "breezy";
  return "windy";
}

/** The most drops or flakes the Viewer may draw: 1200 by default, 400 at quality level 1 or lower, 120 under reduced motion; none for clear, cloud and fog. */
export const PARTICLE_CAPS = { normal: 1200, low: 400, reduced: 120 } as const;
export function particleBudget(weather: WeatherClass, opts: { quality: number; reducedMotion: boolean }): number {
  if (weather !== "rain" && weather !== "storm" && weather !== "snow") return 0;
  return Math.min(PARTICLE_CAPS.normal, opts.quality <= 1 ? PARTICLE_CAPS.low : PARTICLE_CAPS.normal, opts.reducedMotion ? PARTICLE_CAPS.reduced : PARTICLE_CAPS.normal);
}

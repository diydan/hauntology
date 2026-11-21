import { color } from "../design/tokens";
import type { TempBand, TimeOfDay, WeatherClass, WindBand } from "./types";

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

export type RgbTuple = readonly [number, number, number];
export type AtmosphereLook = Readonly<{
  tint: RgbTuple;
  tintStrength: number;
  haze: number;
  brightness: number;
}>;

const hexRgb = (hex: string): RgbTuple => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

const WEATHER_LOOK: Readonly<Record<WeatherClass, Readonly<{ tint: RgbTuple; strength: number; haze: number; brightness: number }>>> = {
  clear: { tint: [0, 0, 0], strength: 0, haze: 0, brightness: 1 },
  cloud: { tint: hexRgb(color.ash), strength: 0.16, haze: 0.18, brightness: 0.92 },
  fog: { tint: hexRgb(color.bone), strength: 0.35, haze: 0.68, brightness: 0.85 },
  rain: { tint: hexRgb(color["art-glass"]), strength: 0.28, haze: 0.36, brightness: 0.84 },
  storm: { tint: hexRgb(color.dust), strength: 0.42, haze: 0.45, brightness: 0.72 },
  snow: { tint: hexRgb(color["art-lavender"]), strength: 0.25, haze: 0.32, brightness: 0.95 },
};

const TIME_LOOK: Readonly<Record<TimeOfDay, Readonly<{ tint: RgbTuple; strength: number; haze: number; brightness: number }>>> = {
  dawn: { tint: hexRgb(color["art-flame"]), strength: 0.2, haze: 0.08, brightness: 0.9 },
  day: { tint: [0, 0, 0], strength: 0, haze: 0, brightness: 1 },
  dusk: { tint: hexRgb(color.lantern), strength: 0.26, haze: 0.1, brightness: 0.85 },
  night: { tint: hexRgb(color["art-blue"]), strength: 0.28, haze: 0.12, brightness: 0.78 },
};

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Pure Viewer look (conditions 2.6, 4.1; Requirements 4.1, 4.2): every non-neutral tint comes from `shared/src/design/tokens.ts`,
 * `clear` at `day` is the identity, and `brightness` stays at least `0.6` so nights and storms remain walkable.
 */
export function atmosphereLook(weather: WeatherClass, timeOfDay: TimeOfDay): AtmosphereLook {
  const w = WEATHER_LOOK[weather] ?? WEATHER_LOOK.clear;
  const t = TIME_LOOK[timeOfDay] ?? TIME_LOOK.day;
  const total = w.strength + t.strength;
  const tint: RgbTuple =
    total === 0
      ? [0, 0, 0]
      : [
          Math.round((w.tint[0] * w.strength + t.tint[0] * t.strength) / total),
          Math.round((w.tint[1] * w.strength + t.tint[1] * t.strength) / total),
          Math.round((w.tint[2] * w.strength + t.tint[2] * t.strength) / total),
        ];
  return Object.freeze({
    tint: Object.freeze(tint),
    tintStrength: clamp01(Math.max(w.strength, t.strength, w.strength * 0.7 + t.strength * 0.5)),
    haze: clamp01(w.haze + t.haze * (1 - w.haze)),
    brightness: Math.max(0.6, Math.round(w.brightness * t.brightness * 1000) / 1000),
  });
}

import { color } from "../design/tokens";
import type { MoonSky, SkyStar, TimeOfDay, WeatherClass } from "./types";

export const SKY_MAX_WIDTH = 1024;
export const SKY_MAX_HEIGHT = 512;
export const SKY_LOW_WIDTH = 512;
export const SKY_LOW_HEIGHT = 256;

const hexRgb = (hex: string): readonly [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

const STAR_RGB = hexRgb(color.bone);
const MOON_RGB = hexRgb(color["art-silver"]);

const WEATHER_VIS: Readonly<Record<WeatherClass, number>> = {
  clear: 1,
  cloud: 0.35,
  fog: 0,
  rain: 0,
  storm: 0,
  snow: 0,
};

const TIME_VIS: Readonly<Record<TimeOfDay, number>> = {
  dawn: 0,
  day: 0,
  dusk: 0.5,
  night: 1,
};

/** Sky texture brightness multiplier (`0` in dawn/day or fog/rain/storm/snow, `0.35` under cloud). */
export function skyVisibility(weather: WeatherClass, timeOfDay: TimeOfDay): number {
  return (TIME_VIS[timeOfDay] ?? 0) * (WEATHER_VIS[weather] ?? 0);
}

export type SkyTexture = Readonly<{
  width: number;
  height: number;
  data: Uint8ClampedArray;
}>;

function addPixel(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, rgb: readonly [number, number, number], alpha: number): void {
  if (x < 0 || x >= width || y < 0 || y >= height || alpha <= 0) return;
  const idx = (y * width + x) * 4;
  const a = Math.min(255, Math.round(alpha * 255));
  const r = Math.min(255, Math.round(rgb[0] * alpha));
  const g = Math.min(255, Math.round(rgb[1] * alpha));
  const b = Math.min(255, Math.round(rgb[2] * alpha));
  data[idx] = Math.max(data[idx] ?? 0, r);
  data[idx + 1] = Math.max(data[idx + 1] ?? 0, g);
  data[idx + 2] = Math.max(data[idx + 2] ?? 0, b);
  data[idx + 3] = Math.max(data[idx + 3] ?? 0, a);
}

/**
 * Pure equirectangular RGBA Star Texture (`conditions` 6.3; Requirements 6.2, 6.3), called once per Atmosphere:
 * dimensions are bounded to at most 1024x512 (`512x256` at low quality), colours come from `design/tokens.ts`,
 * clouds dim brightness, and fog/rain/storm/snow or dawn/day produce an empty texture.
 */
export function rasterizeSky(
  stars: readonly SkyStar[],
  moon: MoonSky | undefined,
  weather: WeatherClass,
  timeOfDay: TimeOfDay,
  size: Readonly<{ width?: number; height?: number; low?: boolean }> = {},
): SkyTexture {
  const defaultW = size.low ? SKY_LOW_WIDTH : SKY_MAX_WIDTH;
  const defaultH = size.low ? SKY_LOW_HEIGHT : SKY_MAX_HEIGHT;
  const width = Math.max(1, Math.min(SKY_MAX_WIDTH, Math.trunc(size.width ?? defaultW)));
  const height = Math.max(1, Math.min(SKY_MAX_HEIGHT, Math.trunc(size.height ?? defaultH)));
  const data = new Uint8ClampedArray(width * height * 4);
  const vis = skyVisibility(weather, timeOfDay);
  if (vis <= 0) return { width, height, data };

  for (const s of stars) {
    if (s.alt <= 0) continue;
    const cx = Math.floor(((s.az % 360) / 360) * width);
    const cy = Math.floor(((90 - s.alt) / 90) * (height * 0.5));
    const radius = s.mag <= 0.5 ? 2 : 1;
    const base = Math.max(0.25, Math.min(1, 1 - s.mag * 0.14)) * vis;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const dist = Math.hypot(dx, dy);
        if (dist > radius + 0.2) continue;
        const falloff = Math.max(0, 1 - dist / (radius + 0.5));
        addPixel(data, width, height, (cx + dx + width) % width, cy + dy, STAR_RGB, base * falloff);
      }
    }
  }

  if (moon && moon.alt > 0) {
    const cx = Math.floor(((moon.az % 360) / 360) * width);
    const cy = Math.floor(((90 - moon.alt) / 90) * (height * 0.5));
    const radius = width >= SKY_MAX_WIDTH ? 5 : 3;
    const bright = (0.2 + 0.8 * moon.lit) * vis;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const dist = Math.hypot(dx, dy);
        if (dist > radius) continue;
        // Shade lit fraction across disc horizontally
        const across = (dx + radius) / (2 * radius);
        const litMask = across <= moon.lit + 0.1 ? 1 : 0.15;
        addPixel(data, width, height, (cx + dx + width) % width, cy + dy, MOON_RGB, bright * litMask);
      }
    }
  }

  return { width, height, data };
}

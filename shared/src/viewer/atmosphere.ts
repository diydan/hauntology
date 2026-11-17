import type { Atmosphere } from "../conditions/types";
import { clamp, finiteOr, type QualityLevel } from "./types";

/**
 * The frozen conditions as picture settings, and tilt-to-look (Requirements 3.6, 8.1;
 * world-viewer task 2.17). Both are looks only: neither returns anything that could
 * move the player, change collision, move an anchor or touch the Haunt Level.
 */

export type AtmosphereParams = {
  /** Colour multipliers [r, g, b], each within the grade limits below. */
  tint: readonly [number, number, number];
  /** Multiplies the haunt dimming; 1 is unchanged. */
  brightness: number;
  fogDensity: number;
  precipitation: { kind: "none" | "rain" | "snow"; count: number };
  sky: { starsVisible: boolean; starCount: number; moonLit: number };
};

/** The grade may darken or cool the picture, never blow it out. */
export const GRADE_MIN = 0.45;
export const GRADE_MAX = 1.05;
export const MAX_PARTICLES = 1500;

const NEUTRAL: AtmosphereParams = {
  tint: [1, 1, 1],
  brightness: 1,
  fogDensity: 0,
  precipitation: { kind: "none", count: 0 },
  sky: { starsVisible: false, starCount: 0, moonLit: 0 },
};

const TIME_GRADE: Record<Atmosphere["timeOfDay"], { tint: readonly [number, number, number]; brightness: number }> = {
  dawn: { tint: [1.0, 0.82, 0.68], brightness: 0.85 },
  day: { tint: [1, 1, 1], brightness: 1 },
  dusk: { tint: [0.95, 0.72, 0.62], brightness: 0.72 },
  night: { tint: [0.55, 0.62, 0.85], brightness: 0.5 },
};

const WEATHER_FOG: Record<Atmosphere["weather"], number> = {
  clear: 0, cloud: 0.004, fog: 0.035, rain: 0.012, storm: 0.02, snow: 0.016,
};

/** The share of the particle cap each Quality Level may spend; level 0 spends least. */
const QUALITY_SHARE: Record<QualityLevel, number> = { 0: 0.25, 1: 0.5, 2: 0.75, 3: 1 };

/**
 * Picture settings for a frozen atmosphere (or the neutral look for `null`, which is
 * what the shell sends to restore it). Precipitation is capped at `MAX_PARTICLES`,
 * scaled down by Quality Level, and halved again under reduced motion; the star sky
 * shows only at dusk and night, with the snapshot's own star count.
 */
export function atmosphereParams(atmosphere: Atmosphere | null, quality: QualityLevel, reducedMotion: boolean): AtmosphereParams {
  if (!atmosphere) return NEUTRAL;
  const grade = TIME_GRADE[atmosphere.timeOfDay];
  const dimmed = atmosphere.weather === "storm" || atmosphere.weather === "fog" ? 0.9 : 1;
  const tint = grade.tint.map((c) => clamp(c, GRADE_MIN, GRADE_MAX)) as unknown as readonly [number, number, number];

  const kind = atmosphere.weather === "rain" || atmosphere.weather === "storm" ? "rain" : atmosphere.weather === "snow" ? "snow" : "none";
  const share = QUALITY_SHARE[quality] * (reducedMotion ? 0.5 : 1);
  const count = kind === "none" ? 0 : Math.round(MAX_PARTICLES * share);

  const starsVisible = atmosphere.timeOfDay === "dusk" || atmosphere.timeOfDay === "night";
  return {
    tint,
    brightness: clamp(grade.brightness * dimmed, GRADE_MIN, GRADE_MAX),
    fogDensity: WEATHER_FOG[atmosphere.weather],
    precipitation: { kind, count },
    sky: {
      starsVisible,
      starCount: starsVisible ? (atmosphere.stars?.length ?? 0) : 0,
      moonLit: atmosphere.moonSky ? clamp(finiteOr(atmosphere.moonSky.lit, 0), 0, 1) : 0,
    },
  };
}

/** Look direction only: tilt can never carry a position. Angles are radians. */
export type LookState = { yaw: number; pitch: number };
export type TiltReading = { alpha: number; beta: number } | null;
export type TiltCalibration = { alpha: number; beta: number };

/** Wobbles smaller than this (degrees) are hand tremor, not looking. */
export const TILT_DEADZONE_DEG = 1.5;
/** The fastest the view may turn from tilt, radians per second. */
export const TILT_MAX_RATE = 2.5;
export const PITCH_LIMIT = 1.4;

const wrapDeg = (deg: number): number => ((deg + 540) % 360) - 180;
const beyondDeadzone = (deg: number): number =>
  Math.abs(deg) <= TILT_DEADZONE_DEG ? 0 : deg - Math.sign(deg) * TILT_DEADZONE_DEG;

/**
 * One tilt step: the reading's offset from the calibration tap becomes a look
 * change, deadzoned, rate-clamped by `dtMs`, with pitch clamped to ±`PITCH_LIMIT`.
 * No reading, a reading with non-finite parts, or no elapsed time leaves the look
 * unchanged, so drag-to-look keeps working whenever tilt cannot.
 */
export function tiltLook(state: LookState, reading: TiltReading, calibration: TiltCalibration, dtMs: number): LookState {
  const yaw = finiteOr(state.yaw, 0);
  const pitch = clamp(finiteOr(state.pitch, 0), -PITCH_LIMIT, PITCH_LIMIT);
  if (!reading || !Number.isFinite(reading.alpha) || !Number.isFinite(reading.beta)) return { yaw, pitch };
  if (!Number.isFinite(calibration.alpha) || !Number.isFinite(calibration.beta)) return { yaw, pitch };
  const dt = Math.max(0, finiteOr(dtMs, 0)) / 1000;
  if (dt === 0) return { yaw, pitch };

  const maxTurn = TILT_MAX_RATE * dt;
  const dYaw = clamp((beyondDeadzone(wrapDeg(reading.alpha - calibration.alpha)) * Math.PI) / 180, -maxTurn, maxTurn);
  const dPitch = clamp((beyondDeadzone(reading.beta - calibration.beta) * Math.PI) / 180, -maxTurn, maxTurn);
  return { yaw: yaw + dYaw, pitch: clamp(pitch + dPitch, -PITCH_LIMIT, PITCH_LIMIT) };
}

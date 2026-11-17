import type { AssetRef } from "../world/manifest";
import {
  finiteOr,
  QUALITY_MAX,
  QUALITY_MIN,
  type DeviceCaps,
  type QualityLevel,
} from "./types";

/**
 * Rendering quality and splat LOD choice (Requirements 1.1, 5.2; world-viewer task 2.11).
 */

/** The state `nextQuality` folds frame-rate samples into. Times are milliseconds. */
export type QualityState = {
  level: QualityLevel;
  max: QualityLevel;
  /** Smoothed frames per second (exponential average over samples). */
  emaFps: number;
  /** When the smoothed rate first fell below the step-down threshold, or null. */
  belowSince: number | null;
  /** When the smoothed rate first reached the step-up threshold, or null. */
  aboveSince: number | null;
  lastChangeAt: number | null;
  lastDownAt: number | null;
};

export const QUALITY_DOWN_FPS = 24;
export const QUALITY_UP_FPS = 55;
export const QUALITY_DOWN_AFTER_MS = 3000;
export const QUALITY_UP_AFTER_MS = 10000;
export const QUALITY_MIN_CHANGE_GAP_MS = 5000;
export const QUALITY_NO_UP_AFTER_DOWN_MS = 30000;

export function initialQuality(level: QualityLevel = QUALITY_MAX, max: QualityLevel = QUALITY_MAX): QualityState {
  return { level, max, emaFps: 60, belowSince: null, aboveSince: null, lastChangeAt: null, lastDownAt: null };
}

const clampLevel = (n: number, max: QualityLevel): QualityLevel =>
  Math.min(max, Math.max(QUALITY_MIN, Math.trunc(finiteOr(n, QUALITY_MIN)))) as QualityLevel;

/**
 * Folds one frame-rate sample into the quality state (Requirement 5.2): stepping down
 * takes a smoothed rate below 24 fps held for 3 s; changes are one level at a time, at
 * least 5 s apart; nothing steps up within 30 s of a step down, and stepping up takes
 * a smoothed 55 fps held for 10 s. The level stays within [0, max]. A sample or clock
 * that is not finite changes nothing but the returned state is still well formed.
 */
export function nextQuality(state: QualityState, fpsSample: number, nowMs: number): { level: QualityLevel; state: QualityState } {
  const max = clampLevel(state.max, QUALITY_MAX);
  const level = clampLevel(state.level, max);
  const now = finiteOr(nowMs, 0);
  const fps = Math.max(0, finiteOr(fpsSample, state.emaFps));
  const emaFps = state.emaFps * 0.9 + fps * 0.1;

  const belowSince = emaFps < QUALITY_DOWN_FPS ? (state.belowSince ?? now) : null;
  const aboveSince = emaFps >= QUALITY_UP_FPS ? (state.aboveSince ?? now) : null;
  const gapOk = state.lastChangeAt === null || now - state.lastChangeAt >= QUALITY_MIN_CHANGE_GAP_MS;

  let next = level;
  let lastChangeAt = state.lastChangeAt;
  let lastDownAt = state.lastDownAt;
  if (gapOk && level > QUALITY_MIN && belowSince !== null && now - belowSince >= QUALITY_DOWN_AFTER_MS) {
    next = (level - 1) as QualityLevel;
    lastChangeAt = now;
    lastDownAt = now;
  } else if (
    gapOk && level < max && aboveSince !== null && now - aboveSince >= QUALITY_UP_AFTER_MS &&
    (state.lastDownAt === null || now - state.lastDownAt >= QUALITY_NO_UP_AFTER_DOWN_MS)
  ) {
    next = (level + 1) as QualityLevel;
    lastChangeAt = now;
  }

  return {
    level: next,
    state: {
      level: next,
      max,
      emaFps,
      belowSince: next !== level ? null : belowSince,
      aboveSince: next !== level ? null : aboveSince,
      lastChangeAt,
      lastDownAt,
    },
  };
}

/** Splat LOD ranks, lowest first. An asset with no `lod` ranks by nothing: below all tagged ones. */
const LOD_RANK: Record<string, number> = { "100k": 0, "150k": 1, "500k": 2, full: 3 };
const lodRank = (ref: AssetRef): number => (ref.lod ? (LOD_RANK[ref.lod] ?? -1) : -1);

/**
 * A capability score that never decreases when any single capability grows
 * (more memory, more cores, a bigger texture limit, or not being a phone).
 * Unknown memory or cores count as a middling device.
 */
export function capabilityScore(caps: DeviceCaps): number {
  if (!caps.webgl2) return 0;
  const memory = caps.memoryGb === undefined ? 4 : Math.max(0, finiteOr(caps.memoryGb, 4));
  const cores = caps.cores === undefined ? 4 : Math.max(0, finiteOr(caps.cores, 4));
  const texture = Math.max(0, finiteOr(caps.maxTexture, 0));
  return (caps.mobile ? 0 : 30) + Math.min(memory, 16) * 3 + Math.min(cores, 16) * 2 + Math.min(texture / 1024, 16);
}

/** The score a device needs before each LOD rank is offered. */
const LOD_NEEDS = [0, 35, 55, 85];

/**
 * Picks the best available splat LOD the device can afford (Requirement 1.1): always
 * one of `available` (the lowest when nothing is affordable), and a device that is at
 * least as capable in every dimension never gets a lower one. Ties keep list order.
 */
export function chooseLod(caps: DeviceCaps, available: readonly AssetRef[]): AssetRef {
  const first = available[0];
  if (!first) throw new RangeError("chooseLod needs at least one available LOD");
  const score = capabilityScore(caps);
  let best: AssetRef | null = null;
  let lowest = first;
  for (const ref of available) {
    if (lodRank(ref) < lodRank(lowest)) lowest = ref;
    const need = LOD_NEEDS[Math.max(0, lodRank(ref))] ?? 0;
    if (score >= need && (best === null || lodRank(ref) > lodRank(best))) best = ref;
  }
  return best ?? lowest;
}

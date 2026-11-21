import { MAX_LONG_SIDE, MIN_SHORT_SIDE } from "./upload";

/**
 * Enhance planning (world-pipeline Requirement 11, task 11.1). A single photo is one view of a place. Enhance makes extra views of the same
 * scene by outpainting (continuing the picture sideways) and hands the world service the original and the extensions together, each with its
 * own azimuth, so the world is built from more than one direction. This module is the pure half: where the extra views look, how much of the
 * original each one keeps, and the prompt that carries them. It calls nothing and spends nothing. The feature is off unless `ENHANCE_ENABLED`
 * says so, and is meant to stay off until Spike 1.3 (the recorded A/B) shows it improves worlds (Requirement 11.2).
 *
 * Geometry: a view is a window the size of the original, moved sideways by `shift` of the original's width. The part of the original still
 * inside the window is kept as it is (the overlap, `1 - |shift|`), and the strip that came into view is painted by the outpainting model. A
 * view needs at least `MIN_OVERLAP` of the original to anchor the model's work, so every shift is at most 0.6. The azimuth is the shift times
 * `ENHANCE_FOV_DEG` (the horizontal field of view assumed for a phone photo; a decision, not a measurement). Positive is to the right.
 */
export const ENHANCE_FOV_DEG = 70;
export const MIN_OVERLAP = 0.4;
export const ENHANCE_VIEWS_DEFAULT = 2;
export const ENHANCE_VIEWS_MAX = 4;
/** In the order they are made: the widest first, so a quota that runs out part-way has still given the most different views. */
const SHIFTS = [0.5, -0.5, 0.25, -0.25] as const;

export type EnhanceView = Readonly<{
  /** Degrees from the original, positive to the right; never 0 (that is the original). */
  azimuthDeg: number;
  /** The window's move as a fraction of the original's width, in [-0.6, 0.6] and not 0. */
  shift: number;
  /** The share of the window the original covers: `1 - |shift|`, at least `MIN_OVERLAP`. */
  overlap: number;
  /** Which edge the new strip is painted on, and how wide it is as a fraction of the window's width. */
  fill: Readonly<{ side: "left" | "right"; fraction: number }>;
}>;

export type EnhancePlan =
  | Readonly<{ ok: true; width: number; height: number; views: readonly EnhanceView[] }>
  | Readonly<{ ok: false; reason: "disabled" | "bad_size" }>;

const isSide = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

/** `ENHANCE_VIEWS` from the environment: a whole number from 1 to 4, else the default; `0` is not a view count, so it is the default as well (the switch is `ENHANCE_ENABLED`). */
export function enhanceViewsFromEnv(value: string | undefined): number {
  const n = typeof value === "string" && /^\s*\d{1,2}\s*$/.test(value) ? Number(value.trim()) : Number.NaN;
  return Number.isInteger(n) && n >= 1 && n <= ENHANCE_VIEWS_MAX ? n : ENHANCE_VIEWS_DEFAULT;
}

/** `ENHANCE_ENABLED`: only the exact word `true` turns it on. Off for anything else, including nothing. */
export const enhanceEnabledFromEnv = (value: string | undefined): boolean => typeof value === "string" && value.trim().toLowerCase() === "true";

/**
 * The extra views for a photo of `width` by `height` pixels. `views` is how many to make (clamped to 1 to 4; not a number gives the default).
 * A size outside what the upload accepts is `bad_size` and the caller uses the single-image path. Total: it never throws.
 */
export function planEnhance(size: { width: number; height: number }, views: number = ENHANCE_VIEWS_DEFAULT): EnhancePlan {
  const { width, height } = size ?? ({} as { width: number; height: number });
  if (!isSide(width) || !isSide(height)) return { ok: false, reason: "bad_size" };
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  if (short < MIN_SHORT_SIDE || long > MAX_LONG_SIDE) return { ok: false, reason: "bad_size" };
  const count = Number.isFinite(views) ? Math.min(ENHANCE_VIEWS_MAX, Math.max(1, Math.trunc(views))) : ENHANCE_VIEWS_DEFAULT;
  const planned: EnhanceView[] = SHIFTS.slice(0, count).map((shift) => ({
    azimuthDeg: Math.round(shift * ENHANCE_FOV_DEG * 100) / 100,
    shift,
    overlap: 1 - Math.abs(shift),
    fill: { side: shift > 0 ? "right" : "left", fraction: Math.abs(shift) },
  }));
  return { ok: true, width, height, views: planned };
}

/** One picture of a prompt. `azimuthDeg` is 0 for the original. */
export type PromptImage = Readonly<{ image: Uint8Array; contentType: string; azimuthDeg: number }>;

/**
 * What the world service is asked to build from: the original photo alone (the single-image path, which is the fallback for everything), or the original with
 * its extensions, in order of azimuth. The real request's shape (`type: "multi-image"`, how each image carries its azimuth) is not confirmed against the service
 * (`steering/worldlabs-api.md` names the type only), so the adapter that sends it is not written; this is our own shape.
 */
export type WorldPrompt =
  | Readonly<{ kind: "single"; image: Uint8Array; contentType: string }>
  | Readonly<{ kind: "multi-image"; images: readonly PromptImage[] }>;

export const singlePrompt = (image: Uint8Array, contentType: string): WorldPrompt => ({ kind: "single", image, contentType });

/** The original and its extensions as one prompt: the original at azimuth 0, the rest sorted by azimuth. No extensions is the single-image prompt. */
export function multiImagePrompt(original: { image: Uint8Array; contentType: string }, extensions: readonly PromptImage[]): WorldPrompt {
  if (extensions.length === 0) return singlePrompt(original.image, original.contentType);
  const images = [{ image: original.image, contentType: original.contentType, azimuthDeg: 0 }, ...extensions].sort((a, b) => a.azimuthDeg - b.azimuthDeg);
  return { kind: "multi-image", images };
}

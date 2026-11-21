import type { PrivateView, PublicView } from "./views";

/**
 * The Spirit lens (party-mode 16.x): off by default and local to the phone. `lensData` reads only the Player's own
 * Private View and the Public View, so no message exists for it and the server sends nothing new. `lensPlan` decides
 * how it draws. No camera, no markers; Theory marks are ignored.
 */
export type LensRipple = Readonly<{ eventId: number; kind: "phone-cue" | "rattle"; target: number }>;
export type LensData = Readonly<{
  /** Cards this Player knows: their Hand, what was shown to them and the Residue they found. */
  known: readonly string[];
  /** The Zones this Player inspected, from the public log. */
  inspected: readonly string[];
  /** The latest Cue and Rattle ripples, from the public log. */
  ripples: readonly LensRipple[];
}>;
export const LENS_RIPPLES = 6;

export function lensData(priv: PrivateView, pub: PublicView): LensData {
  const known = [...new Set([...priv.hand.map((c) => c.id), ...priv.shownToMe, ...priv.found])];
  const inspected = [...new Set(pub.events.flatMap((e) => (e.kind === "inspect" && e.seat === priv.seat ? [e.zone] : [])))];
  const ripples = pub.events
    .flatMap((e): LensRipple[] => (e.kind === "phone-cue" || e.kind === "rattle" ? [{ eventId: e.id, kind: e.kind, target: e.target }] : []))
    .slice(-LENS_RIPPLES);
  return { known, inspected, ripples };
}

export const LENS_MIN_FRAME_MS = 33;
export type LensInput = Readonly<{ sensors: boolean; faceDown: boolean; hidden: boolean; reducedMotion: boolean; now: number; tapped?: boolean; calibratedAtMs?: number | null }>;
export type LensPlan = Readonly<{ draw: boolean; frameIntervalMs: number; fixedView: boolean; calibratedAtMs: number | null; usesCamera: false }>;

/**
 * Whether to draw (not face down, not hidden), at most 30 frames a second (a quarter of that with reduced motion), a
 * fixed view when the phone has no sensors or the visitor prefers reduced motion, and the calibration: a tap sets it to
 * now, and a later tap sets it again, because drift is expected.
 */
export function lensPlan(i: LensInput): LensPlan {
  const fixedView = !i.sensors || i.reducedMotion;
  const calibratedAtMs = i.sensors && i.tapped === true && Number.isFinite(i.now) ? i.now : (i.calibratedAtMs ?? null);
  return { draw: !i.faceDown && !i.hidden, frameIntervalMs: i.reducedMotion ? 4 * LENS_MIN_FRAME_MS : LENS_MIN_FRAME_MS, fixedView, calibratedAtMs, usesCamera: false };
}

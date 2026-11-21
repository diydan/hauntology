/** A short buzz where the phone has one, and `false` where it does not, so the screen can pulse instead (party-mode 9.5). */
export type HapticKind = "turn" | "ask" | "found" | "warning";
const PATTERNS: Readonly<Record<HapticKind, readonly number[]>> = { turn: [80, 60, 80], ask: [60], found: [120], warning: [40, 40, 40] };

export function haptic(kind: HapticKind, nav: { vibrate?: (p: number | number[]) => boolean } = typeof navigator === "undefined" ? {} : navigator): boolean {
  if (typeof nav.vibrate !== "function") return false;
  try { return nav.vibrate([...PATTERNS[kind]]); } catch { return false; }
}

export const canVibrate = (nav: { vibrate?: unknown } = typeof navigator === "undefined" ? {} : navigator): boolean => typeof nav.vibrate === "function";

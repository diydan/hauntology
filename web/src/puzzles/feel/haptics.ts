import { HapticLimiter, hotColdInterval, type HapticName } from "@hauntology/shared/puzzles/haptics";
import type { FeelEvent, FeelSettings, Haptics } from "./types";

export type HapticsHost = Readonly<{
  /** `navigator.vibrate`, or undefined (an iPhone has none). */
  vibrate?: ((pattern: readonly number[]) => boolean) | undefined;
  now(): number;
  /** False until the Player has touched the page: a browser refuses a buzz before that and logs it as an error. Absent means yes. */
  canVibrate?: (() => boolean) | undefined;
}>;

/**
 * Buzz with limits (four pulses a second, six seconds an Attempt, one rumble) and a visual twin for every buzz.
 * Where the phone cannot vibrate, or the Player chose `visual`, or Touch only is on, only the twin happens.
 */
export class BrowserHaptics implements Haptics {
  private readonly limiter = new HapticLimiter();
  private lastHot = Number.NEGATIVE_INFINITY;

  constructor(private readonly host: HapticsHost, private readonly settings: () => FeelSettings, private readonly emit: (e: FeelEvent) => void) {}

  get supported(): boolean { return typeof this.host.vibrate === "function"; }

  get mode(): "vibrate" | "visual" {
    return this.settings().hapticMode !== "visual" && typeof this.host.vibrate === "function" ? "vibrate" : "visual";
  }

  newAttempt(): void {
    this.limiter.reset();
    this.lastHot = Number.NEGATIVE_INFINITY;
  }

  buzz(name: HapticName): boolean {
    const pattern = this.limiter.offer(name, this.host.now());
    if (pattern === null) return false;
    this.emit({ type: "buzz", name });
    if (!this.settings().touchOnly && this.mode === "vibrate" && (this.host.canVibrate?.() ?? true)) {
      try { this.host.vibrate?.(pattern); } catch { /* a refused vibration is not an error */ }
    }
    return true;
  }

  hotCold(distanceDeg: number, windowDeg: number): number {
    const interval = hotColdInterval(distanceDeg, windowDeg);
    const t = this.host.now();
    if (t - this.lastHot >= interval) {
      this.lastHot = t;
      this.buzz("tick");
    }
    return interval;
  }
}

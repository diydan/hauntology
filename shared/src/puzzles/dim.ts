/**
 * Light plans for the dark in "What moved", the torch in "Hidden words" and the candle fade: grey levels over
 * time. Fades only, at most two brightness changes in any second, a peak below full white, and one still step for
 * a Player who prefers reduced motion. Pure.
 */
export type LightStep = Readonly<{ t: number; lum: number }>;
export type LightKind = "dark" | "torch" | "candle";

export const LIGHT_PEAK = 0.9;

export function lightPlan(kind: LightKind, reducedMotion = false): LightStep[] {
  if (reducedMotion) return [{ t: 0, lum: 0.3 }];
  switch (kind) {
    case "dark": return [{ t: 0, lum: LIGHT_PEAK }, { t: 600, lum: 0.12 }, { t: 1400, lum: 0.12 }, { t: 2000, lum: LIGHT_PEAK }];
    case "torch": return [{ t: 0, lum: 0.1 }];
    case "candle": return [{ t: 0, lum: LIGHT_PEAK }, { t: 500, lum: 0.5 }];
  }
}
export const dimPlan = (reducedMotion = false): LightStep[] => lightPlan("dark", reducedMotion);
export const torchPlan = (reducedMotion = false): LightStep[] => lightPlan("torch", reducedMotion);
export const candlePlan = (reducedMotion = false): LightStep[] => lightPlan("candle", reducedMotion);

/** Brightness changes in the worst one-second window of a plan (a fade counts once). */
export function worstChangesPerSecond(plan: readonly LightStep[]): number {
  let worst = 0;
  for (let i = 0; i < plan.length; i++) {
    let n = 0;
    for (let j = i + 1; j < plan.length; j++) {
      const a = plan[i] as LightStep;
      const b = plan[j] as LightStep;
      const before = plan[j - 1] as LightStep;
      if (b.t - a.t < 1000 && b.lum !== before.lum) n++;
    }
    worst = Math.max(worst, n);
  }
  return worst;
}

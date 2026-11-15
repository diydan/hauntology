// Light cues for the device lab: plans of grey levels over time. Pure, no DOM.
// Rules (party-mode steering): greys only, fades only, at most two brightness changes in any second,
// a peak below full white, at most 6 seconds, and nothing at all for a Player who prefers reduced motion.
import { worstChangesPerSecond } from './core.js';

export const LIGHT_MAX_MS = 6000;
export const LIGHT_PEAK = 0.9;
export const LIGHT_MIN_RAMP_MS = 200;
export const LIGHT_NAMES = ['glow', 'wave', 'heartbeat', 'failing_bulb', 'creeping_dark', 'steady'];

/** Steps [{ t, lum }] from black (lum 0) back to black. `ms` only matters for `steady`. */
export function lightPlan(name, ms = 3000) {
  switch (name) {
    case 'glow': return [{ t: 0, lum: 0 }, { t: 1000, lum: 0.3 }, { t: 3000, lum: 0.3 }, { t: 4000, lum: 0 }];
    case 'wave': return [{ t: 0, lum: 0 }, { t: 600, lum: 0.5 }, { t: 1500, lum: 0 }];
    case 'heartbeat': return [{ t: 0, lum: 0 }, { t: 400, lum: 0.45 }, { t: 1000, lum: 0.05 }, { t: 1400, lum: 0.45 }, { t: 2000, lum: 0 }];
    case 'failing_bulb': return [{ t: 0, lum: 0 }, { t: 800, lum: 0.35 }, { t: 1800, lum: 0.35 }, { t: 2300, lum: 0.08 }, { t: 2900, lum: 0.35 }, { t: 4200, lum: 0.35 }, { t: 4700, lum: 0.03 }, { t: 5200, lum: 0.28 }, { t: 6000, lum: 0 }];
    case 'creeping_dark': return [{ t: 0, lum: 0 }, { t: 1200, lum: 0.4 }, { t: 1800, lum: 0.4 }, { t: 5800, lum: 0 }];
    case 'steady': {
      const total = Number.isFinite(ms) ? Math.max(1500, Math.min(LIGHT_MAX_MS, Math.round(ms))) : 3000;
      return [{ t: 0, lum: 0 }, { t: 500, lum: 0.5 }, { t: total - 500, lum: 0.5 }, { t: total, lum: 0 }];
    }
    default: return null;
  }
}

/** True when a plan obeys every light rule. */
export function lightPlanOk(plan) {
  if (!Array.isArray(plan) || plan.length < 2 || plan[0].t !== 0 || plan[0].lum !== 0) return false;
  for (let i = 0; i < plan.length; i++) {
    const s = plan[i];
    if (!Number.isFinite(s.t) || !Number.isFinite(s.lum) || s.lum < 0 || s.lum > LIGHT_PEAK) return false;
    if (i > 0 && s.t - plan[i - 1].t < LIGHT_MIN_RAMP_MS) return false; // fades only: no jump shorter than a ramp
  }
  if (plan[plan.length - 1].t > LIGHT_MAX_MS) return false;
  return worstChangesPerSecond(plan) <= 2;
}

/** Keyframes for the Web Animations API: grey level as rgb(), offsets 0 to 1. */
export function lightKeyframes(plan) {
  const total = plan[plan.length - 1].t;
  return {
    duration: total,
    frames: plan.map((s) => { const v = Math.round(s.lum * 255); return { offset: s.t / total, backgroundColor: `rgb(${v},${v},${v})` }; }),
  };
}

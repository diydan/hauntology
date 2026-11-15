/**
 * The buzz catalogue and the rules for how much a phone may buzz. Pure: the vibration itself lives in
 * `web/src/puzzles/feel/haptics.ts`. No feature depends on a buzz; every buzz has a visual twin.
 */
export const HAPTIC_NAMES = ["tick", "click", "thunk", "snap", "buzz", "bump", "rumble", "heartbeat"] as const;
export type HapticName = (typeof HAPTIC_NAMES)[number];

/** Pattern in ms: even entries buzz, odd entries are gaps. */
export const PATTERNS: Readonly<Record<HapticName, readonly number[]>> = {
  tick: [10],
  click: [18],
  thunk: [45],
  snap: [20, 25, 20],
  buzz: [60, 40, 60],
  bump: [100],
  rumble: [200, 100, 200, 100, 200, 100, 200],
  heartbeat: [50, 110, 50],
};

export const HAPTIC_CAPS = { maxPulseMs: 400, maxPerSecond: 4, maxTotalMs: 6000, maxRumbles: 1 } as const;
export type HapticCaps = Readonly<{ maxPulseMs: number; maxPerSecond: number; maxTotalMs: number; maxRumbles: number }>;

/** The "on" parts of a pattern as [offsetMs, lengthMs]. */
export function pulsesOf(pattern: readonly number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let t = 0;
  pattern.forEach((ms, i) => { if (i % 2 === 0) out.push([t, ms]); t += ms; });
  return out;
}

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/** Hot and cold: the pulse interval in ms, from 800 (far) down to 250 (inside the window). Never longer as it gets nearer. */
export function hotColdInterval(distanceDeg: number, windowDeg: number): number {
  const d = Math.max(0, (Number.isFinite(distanceDeg) ? distanceDeg : 40) - windowDeg / 2);
  const span = Math.max(1, 40 - windowDeg / 2);
  return Math.round(250 + 550 * clamp(d / span, 0, 1));
}

/** Accepts or drops buzz events so one Attempt never passes the caps. Make one per Attempt. */
export class HapticLimiter {
  private starts: number[] = [];
  private totalMs = 0;
  private rumbles = 0;
  constructor(private readonly caps: HapticCaps = HAPTIC_CAPS) {}

  reset(): void { this.starts = []; this.totalMs = 0; this.rumbles = 0; }

  /** The pattern to play, or null when the event is dropped. */
  offer(name: HapticName, tMs: number): readonly number[] | null {
    const pattern = PATTERNS[name];
    const c = this.caps;
    const pulses = pulsesOf(pattern);
    if (pulses.some(([, len]) => len > c.maxPulseMs)) return null;
    if (name === "rumble" && this.rumbles >= c.maxRumbles) return null;
    const total = pulses.reduce((a, [, len]) => a + len, 0);
    if (this.totalMs + total > c.maxTotalMs) return null;
    // A long pattern puts pulses in the future, so check every one-second window of the combined list.
    const all = [...this.starts, ...pulses.map(([off]) => tMs + off)].sort((a, b) => a - b);
    for (const x of all) {
      if (all.filter((y) => y >= x && y < x + 1000).length > c.maxPerSecond) return null;
    }
    this.starts = all.filter((x) => x > tMs - 1000);
    this.totalMs += total;
    if (name === "rumble") this.rumbles++;
    return pattern;
  }
}

export type HapticEvent = Readonly<{ t: number; name: HapticName }>;
export type HapticPlan = Readonly<{ t: number; name: HapticName; pattern: readonly number[] }>;

/** The buzzes a list of timed events would really make, in time order. Nothing when vibration is off. */
export function planHaptics(events: readonly HapticEvent[], enabled = true, caps: HapticCaps = HAPTIC_CAPS): HapticPlan[] {
  if (!enabled) return [];
  const lim = new HapticLimiter(caps);
  const out: HapticPlan[] = [];
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    const pattern = lim.offer(e.name, e.t);
    if (pattern) out.push({ t: e.t, name: e.name, pattern });
  }
  return out;
}

/**
 * Light cues and clock sync for the phone light bar (party-mode 17.1 to 17.4). A cue is a schedule of greys with fades:
 * never a colour, never full white, at most two changes in any second, at most 6 seconds. Phones that did not agree to
 * light, or whose Player prefers reduced motion, get nothing. The common start is on the server clock, so each phone
 * starts at that moment minus its own offset.
 */
export type LightKind = "wave" | "heartbeat" | "failing-bulb" | "creeping-dark" | "glow";
export const LIGHT_KINDS: readonly LightKind[] = ["wave", "heartbeat", "failing-bulb", "creeping-dark", "glow"];
export const MAX_LIGHT_LEVEL = 0.9;
export const MAX_LIGHT_MS = 6_000;
/** Steps are at least this far apart, so there are at most two in any second and every fade has time to run. */
export const MIN_STEP_GAP_MS = 600;
const WAVE_SEAT_GAP_MS = 600;

export type LightTarget = Readonly<{ seat: number; consent: boolean; reducedMotion: boolean }>;
export type LightStep = Readonly<{ atMs: number; level: number }>;
export type LightSchedule = Readonly<{ seat: number; startAtMs: number; steps: readonly LightStep[] }>;

const PATTERNS: Readonly<Record<Exclude<LightKind, "wave">, readonly LightStep[]>> = {
  heartbeat: [{ atMs: 0, level: 0.7 }, { atMs: 600, level: 0.2 }, { atMs: 1200, level: 0.6 }, { atMs: 1800, level: 0 }, { atMs: 3600, level: 0.7 }, { atMs: 4200, level: 0.2 }, { atMs: 4800, level: 0.6 }, { atMs: 5400, level: 0 }],
  "failing-bulb": [{ atMs: 0, level: 0.8 }, { atMs: 600, level: 0.3 }, { atMs: 1200, level: 0.7 }, { atMs: 2400, level: 0.1 }, { atMs: 3000, level: 0.5 }, { atMs: 4200, level: 0 }],
  "creeping-dark": [{ atMs: 0, level: 0.6 }, { atMs: 1200, level: 0.45 }, { atMs: 2400, level: 0.3 }, { atMs: 3600, level: 0.15 }, { atMs: 4800, level: 0 }],
  glow: [{ atMs: 0, level: 0 }, { atMs: 1500, level: 0.45 }, { atMs: 4500, level: 0 }],
};

/** One schedule per phone in seat order, or none for a phone that did not agree or prefers reduced motion. */
export function lightCue(kind: LightKind, targets: readonly LightTarget[], startAtMs: number, reducedMotion: boolean): LightSchedule[] {
  if (reducedMotion || !Number.isFinite(startAtMs)) return [];
  const ok = [...targets].filter((t) => t.consent && !t.reducedMotion).sort((a, b) => a.seat - b.seat);
  return ok.map((t, k): LightSchedule => {
    if (kind === "wave") {
      const d = k * WAVE_SEAT_GAP_MS;
      return { seat: t.seat, startAtMs, steps: [{ atMs: d, level: 0 }, { atMs: d + 600, level: 0.8 }, { atMs: d + 1800, level: 0 }] };
    }
    return { seat: t.seat, startAtMs, steps: PATTERNS[kind] };
  });
}

/** The latest brightness of a schedule at `atMs` after its start, fading between steps. */
export function levelAt(steps: readonly LightStep[], atMs: number): number {
  if (steps.length === 0) return 0;
  const first = steps[0] as LightStep;
  if (atMs <= first.atMs) return first.level;
  for (let i = 1; i < steps.length; i++) {
    const a = steps[i - 1] as LightStep, b = steps[i] as LightStep;
    if (atMs <= b.atMs) return a.level + ((b.level - a.level) * (atMs - a.atMs)) / (b.atMs - a.atMs);
  }
  return (steps[steps.length - 1] as LightStep).level;
}

// ---------------------------------------------------------------- clock sync
export const START_LEAD_MS = 500;
export const MAX_OFFSET_ERROR_MS = 150;
export const OFFSET_SAMPLES = 5;

/** One `ping` and `pong`: the phone's send and receive times on its own clock, and the server's time in the answer. */
export type PingSample = Readonly<{ sentMs: number; serverMs: number; receivedMs: number }>;
export type OffsetEstimate = Readonly<{ offsetMs: number; errorMs: number }>;

/**
 * The phone's clock offset (`server = phone + offset`): the median over the last few exchanges, each assuming the
 * answer took half the round trip, and the error as the spread of those offsets. `null` with no usable sample.
 */
export function estimateOffset(samples: readonly PingSample[]): OffsetEstimate | null {
  const offs = samples
    .filter((s) => [s.sentMs, s.serverMs, s.receivedMs].every(Number.isFinite) && s.receivedMs >= s.sentMs)
    .slice(-OFFSET_SAMPLES)
    .map((s) => s.serverMs - (s.sentMs + s.receivedMs) / 2)
    .sort((a, b) => a - b);
  if (offs.length === 0) return null;
  const mid = Math.floor(offs.length / 2);
  const median = offs.length % 2 === 1 ? (offs[mid] as number) : ((offs[mid - 1] as number) + (offs[mid] as number)) / 2;
  return { offsetMs: median, errorMs: (offs[offs.length - 1] as number) - (offs[0] as number) };
}

export type SyncPhone = Readonly<{ seat: number; offset: OffsetEstimate | null }>;
export type SyncResult = Readonly<{ commonStartMs: number; starts: readonly { seat: number; startOnPhoneMs: number }[]; dropped: readonly number[] }>;

/** The common start is at least 500 ms after `now`; a phone with no estimate or an error over 150 ms is dropped from the cue. */
export function lightSync(now: number, phones: readonly SyncPhone[], leadMs = START_LEAD_MS): SyncResult {
  const commonStartMs = now + Math.max(START_LEAD_MS, leadMs);
  const starts: { seat: number; startOnPhoneMs: number }[] = [];
  const dropped: number[] = [];
  for (const p of [...phones].sort((a, b) => a.seat - b.seat)) {
    if (p.offset === null || p.offset.errorMs > MAX_OFFSET_ERROR_MS) dropped.push(p.seat);
    else starts.push({ seat: p.seat, startOnPhoneMs: commonStartMs - p.offset.offsetMs });
  }
  return { commonStartMs, starts, dropped };
}

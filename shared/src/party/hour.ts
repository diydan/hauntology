import { soundPlan, type PhoneSeat, type SoundPlan } from "./cues";

/**
 * The hour strike and the midnight strike (party-mode 15.1 to 15.3). A bell strikes on the hour of the host's own clock:
 * once for each hour on a 12-hour dial, twelve at midnight, at one server time for every target. It changes no rule.
 */
export type Strike = Readonly<{ atMs: number; count: number; hour: number; midnight: boolean }>;
export const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * The next strike after `nowMs` and after `prev` (so the same strike is never made twice). `offsetMin` is the host's
 * offset from UTC in minutes (east positive); the hour boundary is on the host's clock, so a zone with a half-hour
 * offset still strikes on its own hour. `null` when the Master switched it off or an input is not a finite number.
 */
export function hourStrike(nowMs: number, offsetMin: number, prev: Strike | null, enabled = true): Strike | null {
  if (!enabled || !Number.isFinite(nowMs) || !Number.isFinite(offsetMin)) return null;
  const off = Math.round(offsetMin) * 60_000;
  const after = Math.max(nowMs, prev?.atMs ?? Number.NEGATIVE_INFINITY);
  const atMs = (Math.floor((after + off) / HOUR_MS) + 1) * HOUR_MS - off;
  const hour = Math.floor((((atMs + off) % DAY_MS) + DAY_MS) % DAY_MS / HOUR_MS);
  return { atMs, count: hour % 12 === 0 ? 12 : hour % 12, hour, midnight: hour === 0 };
}

/** The line the ghost speaks at midnight, scripted, through the ghost voice when it is on. */
export const MIDNIGHT_LINE = "Midnight. The house has been waiting for this part.";

export type StrikeTarget = Readonly<{ target: "host" | number; atMs: number; count: number; plan: SoundPlan }>;
/**
 * The Bell on the Host and on every phone with consent and a free sound slot, all at the same server time, together with
 * a light cue. A phone with no consent or no slot left plays nothing; the Host always strikes.
 */
export function strikeTargets(strike: Strike, phones: readonly PhoneSeat[], soundsOn: boolean): StrikeTarget[] {
  const out: StrikeTarget[] = [{ target: "host", atMs: strike.atMs, count: strike.count, plan: "play" }];
  for (const p of [...phones].sort((a, b) => a.seat - b.seat)) out.push({ target: p.seat, atMs: strike.atMs, count: strike.count, plan: soundPlan(p, soundsOn) });
  return out;
}

import type { PhoneSeat } from "./cues";
import type { EngineEvent, EngineState } from "./engine";
import type { HauntOption } from "./haunt";
import { rattleIntensity } from "./rattle";
import { lightCue, lightSync, MAX_LIGHT_MS, type LightKind, type LightStep } from "./light";
import { strikeTargets, type Strike } from "./hour";
import { offsetOf, type RoomExtras } from "./room-extras";

/**
 * The Room's timed show around the Engine (party-mode 4.17, 4.19): the hour strike and the light cues, turned into the
 * messages the Room sends. Both change no rule. Every target gets the same server time, a phone with no usable clock
 * offset is dropped from a light cue, and a phone that did not agree to the light bar gets nothing.
 */

/** The light a Haunt Event plays: a slow dark for Cold Spot and Blackout, a wave for Restless, a glow for a Lull, a heartbeat for a Slam. */
export const HAUNT_LIGHT: Readonly<Record<HauntOption, LightKind>> = {
  "cold-spot": "creeping-dark", blackout: "creeping-dark", restless: "wave", lull: "glow", slam: "heartbeat",
};

/** A Rattle's light by level (party-mode 19.4): breathing grey, a grey wave, a creeping dark. */
export const RATTLE_LIGHT: Readonly<Record<1 | 2 | 3, LightKind>> = { 1: rattleIntensity(1)!.light, 2: rattleIntensity(3)!.light, 3: rattleIntensity(5)!.light };

export type LightTrigger = Readonly<{ kind: LightKind; /** `null` = every phone that agreed, or the seats named. */ seats: readonly number[] | null }>;

/** The light cues the events logged between two Engine states ask for: a Haunt Event for every phone, a House Cue or a Frame for the one phone it played on. */
export function lightTriggers(prev: EngineState | null, next: EngineState | null): LightTrigger[] {
  if (next === null) return [];
  const from = prev?.nextId ?? 0;
  const fresh: readonly EngineEvent[] = next.log.filter((e) => e.id >= from);
  const out: LightTrigger[] = [];
  for (const e of fresh) {
    if (e.kind === "haunt-event") out.push({ kind: HAUNT_LIGHT[e.option], seats: null });
    else if (e.kind === "phone-cue") out.push({ kind: "glow", seats: [e.target] });
    else if (e.kind === "rattle") out.push({ kind: RATTLE_LIGHT[e.level ?? 1], seats: null });
  }
  // a Player who just joined the haunting: a creeping dark on every phone that agreed (the sting itself is the Engine's `becoming`)
  for (const p of next.players) if (p.becomingPlayed === true && prev?.players.find((q) => q.seat === p.seat)?.becomingPlayed !== true) out.push({ kind: "creeping-dark", seats: null });
  return out;
}

export type LightMsg = Readonly<{ t: "lightCue"; cue: LightKind; startAtMs: number; durationMs: number; steps: readonly LightStep[] }>;

/** One `lightCue` per phone: started at a common server time at least 500 ms ahead, translated into the phone's own clock, late phones dropped. */
export function lightMessages(trigger: LightTrigger, now: number, humans: readonly number[], x: RoomExtras): { seat: number; msg: LightMsg }[] {
  if (!x.switches.lightBar) return [];
  const wanted = humans.filter((s) => trigger.seats === null || trigger.seats.includes(s)).filter((s) => x.light[s]?.consent === true);
  if (wanted.length === 0) return [];
  const sync = lightSync(now, wanted.map((seat) => ({ seat, offset: offsetOf(x.clock, seat) })));
  const kept = new Set(sync.starts.map((s) => s.seat));
  const schedules = lightCue(trigger.kind, wanted.filter((s) => kept.has(s)).map((seat) => ({ seat, consent: true, reducedMotion: x.light[seat]?.reducedMotion === true })), sync.commonStartMs, false);
  return schedules.map((sc) => {
    const start = sync.starts.find((s) => s.seat === sc.seat) as { startOnPhoneMs: number };
    const last = sc.steps[sc.steps.length - 1];
    return { seat: sc.seat, msg: { t: "lightCue", cue: trigger.kind, startAtMs: start.startOnPhoneMs, durationMs: Math.min(MAX_LIGHT_MS, last?.atMs ?? 0), steps: sc.steps } };
  });
}

export type StrikeMsg = Readonly<{ t: "strike"; atMs: number; count: number; hour: number; midnight: boolean; plan: "play" | "flash" | "none" }>;

/** The strike for the Host (always) and every phone, all at the same server time. The phone's plan says play, flash or nothing. */
export function strikeMessages(strike: Strike, phones: readonly PhoneSeat[], soundsOn: boolean): { target: "host" | number; msg: StrikeMsg }[] {
  return strikeTargets(strike, phones, soundsOn).map((t) => ({ target: t.target, msg: { t: "strike", atMs: t.atMs, count: t.count, hour: strike.hour, midnight: strike.midnight, plan: t.plan } }));
}

/** The words every screen reads for a strike. At midnight the line is the ghost's own. */
export const strikeLine = (strike: Strike, midnightLine: string): string =>
  strike.midnight ? midnightLine : `The clock struck ${["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"][strike.count] ?? String(strike.count)}.`;

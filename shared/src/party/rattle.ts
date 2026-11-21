import { canCue, CUE_GAP_MS, MAX_CUES_PER_TURN, MAX_PLAYING, soundPlan, type CueRefusal, type PhoneSeat, type SoundPlan } from "./cues";
import type { LightKind } from "./light";
import type { SoundId } from "./sounds";

/**
 * Rattle and the Becoming (party-mode 19.1 to 19.7). A Poltergeist who turned Rattle on shakes their phone, or holds a
 * button, and the house answers with a sound and a light. It shares every Cue limit, is anonymous until the ending and
 * touches no clock, Resolve, Haunt level, Hand or Solution: nothing in this file takes or returns any of them.
 */

// ---------------------------------------------------------------- shake detection
export type Reading = Readonly<{ atMs: number; /** signed acceleration along the strongest axis, m/s² without gravity */ a: number }>;
export const SHAKE_STRENGTH = 12;
export const SHAKE_SWINGS = 3;
export const SHAKE_WINDOW_MS = 1_500;

/**
 * Three swings within 1.5 s (a swing is a reading above the strength that turns the other way from the last one), counted
 * over the window ending at `now`. One bump, or a long push one way, is one swing at most. Readings that are not finite
 * numbers, or from the future, are dropped.
 */
export function shakeDetect(readings: readonly Reading[], now: number, strength = SHAKE_STRENGTH): Readonly<{ rattle: boolean; swings: number }> {
  const recent = readings
    .filter((r) => Number.isFinite(r.atMs) && Number.isFinite(r.a) && r.atMs <= now && now - r.atMs <= SHAKE_WINDOW_MS && Math.abs(r.a) >= strength)
    .sort((x, y) => x.atMs - y.atMs);
  let swings = 0;
  let lastSign = 0;
  for (const r of recent) {
    const sign = Math.sign(r.a);
    if (sign !== lastSign) { swings++; lastSign = sign; }
  }
  return { rattle: swings >= SHAKE_SWINGS, swings };
}

// ---------------------------------------------------------------- opt-in and limits
export type RattleSeat = Readonly<{ seat: number; bot: boolean; poltergeist: boolean; rattleOn: boolean; lastCueMs: number | null }>;
export type RattleOffer = Readonly<{ offered: boolean; askToTurnOn: boolean; via: readonly ("shake" | "button")[] }>;

/**
 * Rattle is offered only to a Poltergeist and only while the Master's switch is on. It starts off (iOS asks for motion
 * permission), so a Poltergeist is first asked; with it on they get the shake where the phone has sensors and always
 * the hold-to-rattle button.
 */
export function rattleOffer(p: Pick<RattleSeat, "bot" | "poltergeist" | "rattleOn">, settingOn: boolean, sensors: boolean): RattleOffer {
  if (!settingOn || p.bot || !p.poltergeist) return { offered: false, askToTurnOn: false, via: [] };
  if (!p.rattleOn) return { offered: false, askToTurnOn: true, via: [] };
  return { offered: true, askToTurnOn: false, via: sensors ? ["shake", "button"] : ["button"] };
}

export type RattleRefusal = "rattle_off" | "bot" | "not_poltergeist" | "rattle_not_on" | Exclude<CueRefusal, "own_turn" | "bot">;
export const rattleDenied = (reason: RattleRefusal): string => `rattle_denied:${reason}`;

/** `canCue` for the gesture: the same 4 s gap, three sounding at most, six a Turn. */
export function canRattle(p: RattleSeat, o: Readonly<{ settingOn: boolean; playingEnds: readonly number[]; turnCueCount: number; now: number }>): { ok: true } | { ok: false; reason: RattleRefusal } {
  if (!o.settingOn) return { ok: false, reason: "rattle_off" };
  if (p.bot) return { ok: false, reason: "bot" };
  if (!p.poltergeist) return { ok: false, reason: "not_poltergeist" };
  if (!p.rattleOn) return { ok: false, reason: "rattle_not_on" };
  const c = canCue({ seat: p.seat, bot: p.bot, lastCueMs: p.lastCueMs }, null, o.playingEnds, o.turnCueCount, o.now);
  return c.ok ? { ok: true } : { ok: false, reason: c.reason as Exclude<CueRefusal, "own_turn" | "bot"> };
}
export { CUE_GAP_MS, MAX_CUES_PER_TURN, MAX_PLAYING };

/** An accepted Rattle adds one to the Turn's Rattles and one to its Cue count. */
export const countRattle = <T extends Readonly<{ rattles: number; cueCount: number }>>(turn: T): T => ({ ...turn, rattles: turn.rattles + 1, cueCount: turn.cueCount + 1 });
/** Each Turn starts with no Rattles. */
export const resetRattles = <T extends Readonly<{ rattles: number }>>(turn: T): T => ({ ...turn, rattles: 0 });

// ---------------------------------------------------------------- intensity
export type RattleLevel = 1 | 2 | 3;
export const RATTLE_MAX_VOLUME = 0.8;
export type Intensity = Readonly<{ level: RattleLevel; sound: SoundId; volume: number; light: LightKind; logLine: string }>;
/** The three public log lines: no sender, no clip. */
export const RATTLE_LINES: Readonly<Record<RattleLevel, string>> = { 1: "the floorboards creaked", 2: "a wind passed", 3: "the house rumbled" };

/** Level 1 for 1 to 2 Rattles this Turn (a creak and a slow grey breathing), 2 for 3 to 4 (wind, a grey wave), 3 for 5 or more (a low rumble, a creeping dark). */
export function rattleIntensity(rattlesThisTurn: number): Intensity | null {
  if (!Number.isInteger(rattlesThisTurn) || rattlesThisTurn < 1) return null;
  const level: RattleLevel = rattlesThisTurn <= 2 ? 1 : rattlesThisTurn <= 4 ? 2 : 3;
  const sound: SoundId = level === 1 ? "creak" : level === 2 ? "wind" : "rumble";
  const light: LightKind = level === 1 ? "glow" : level === 2 ? "wave" : "creeping-dark";
  return { level, sound, volume: RATTLE_MAX_VOLUME, light, logLine: RATTLE_LINES[level] };
}

export type RattleDelivery = Readonly<{ target: "host" | number; sound: SoundId | null; plan: SoundPlan; light: boolean }>;
/**
 * The Host and every phone: sound where the phone has consent and a free slot, and the light for a phone that agreed to
 * light, including one with no sounds left (light only). A phone that agreed to neither gets nothing.
 */
export function rattleDelivery(i: Intensity, phones: readonly (PhoneSeat & Readonly<{ lightConsent: boolean }>)[], soundsOn: boolean): RattleDelivery[] {
  const out: RattleDelivery[] = [{ target: "host", sound: i.sound, plan: "play", light: false }];
  for (const p of [...phones].sort((a, b) => a.seat - b.seat)) {
    const plan = soundPlan(p, soundsOn);
    out.push({ target: p.seat, sound: plan === "none" ? null : i.sound, plan, light: p.lightConsent && !p.bot });
  }
  return out;
}

/** The secret record of who rattled, kept with the other cue sources and shown only in the ending payload. */
export const rattleSource = (eventId: number, seat: number): Readonly<{ eventId: number; source: number }> => ({ eventId, source: seat });

// ---------------------------------------------------------------- the Becoming
export const BECOMING_MS = 4_000;
export type Becoming = Readonly<{ atMs: number; durationMs: number; countsAsSound: false; offerRattle: true; fadeOrder: readonly number[] }>;
/**
 * The sting when a Player joins the haunting: once per Player, at most 4 s, on their own phone and the Host, not counted
 * toward the three sounds, with a grey fade of the light bar outward from their seat. Their phone then offers Rattle.
 */
export function becoming(p: Readonly<{ seat: number; becomingPlayed: boolean }>, seats: readonly number[], nowMs: number): Becoming | null {
  if (p.becomingPlayed) return null;
  const order = [...seats].sort((a, b) => Math.abs(a - p.seat) - Math.abs(b - p.seat) || a - b);
  return { atMs: nowMs, durationMs: BECOMING_MS, countsAsSound: false, offerRattle: true, fadeOrder: order };
}

// ---------------------------------------------------------------- prompts
export type RattlePromptKind = "rattle-first" | "rattle-join";
export type PromptState = Readonly<{ first: boolean; join: boolean }>;
export const NO_PROMPTS: PromptState = { first: false, join: false };
export type RattlePrompt = Readonly<{ kind: RattlePromptKind; text: string; button: "turn-on-rattle" }>;

/**
 * At most one `rattle-first` prompt a Turn (while no Rattle has landed) and one `rattle-join` prompt a Turn (after someone
 * else's Rattle lands), private to a Poltergeist who has Rattle off, naming no sender. Returns the prompt and what was shown.
 */
export function rattlePrompts(p: Pick<RattleSeat, "bot" | "poltergeist" | "rattleOn">, settingOn: boolean, turn: Readonly<{ rattlesThisTurn: number; ownRattlesThisTurn: number }>, shown: PromptState): { prompt: RattlePrompt | null; shown: PromptState } {
  if (!settingOn || p.bot || !p.poltergeist || p.rattleOn) return { prompt: null, shown };
  if (turn.rattlesThisTurn === 0 && !shown.first) return { prompt: { kind: "rattle-first", text: "The house is quiet. Turn on Rattle to stir it.", button: "turn-on-rattle" }, shown: { ...shown, first: true } };
  if (turn.rattlesThisTurn - turn.ownRattlesThisTurn > 0 && !shown.join) return { prompt: { kind: "rattle-join", text: "Something stirred the house. Turn on Rattle to join in.", button: "turn-on-rattle" }, shown: { ...shown, join: true } };
  return { prompt: null, shown };
}

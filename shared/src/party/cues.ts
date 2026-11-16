import { hash, mulberry32, randInt } from "../puzzles/rng";

/**
 * Cues, phone sound, House Cues and Frames (party-mode 12.1, 13.1, 14.1 to 14.5). A Cue is a short sound with a
 * caption and no rule effect. A House Cue is the Room playing a Cue on one phone at a Haunt Event; a Frame is a Player
 * playing one on another Player's phone. Both make the same public event, so nobody but the sender can tell them
 * apart until the ending. Nothing depends on sound: every sound has a text line, and a phone without sound flashes.
 */
export const CUES = [
  { id: "creak", caption: "A floorboard creaks" },
  { id: "whisper", caption: "Someone whispers" },
  { id: "bell", caption: "A small bell rings" },
  { id: "laugh", caption: "A soft laugh" },
] as const;
export type CueId = (typeof CUES)[number]["id"];
export const isCue = (s: string): s is CueId => CUES.some((c) => c.id === s);

export const CUE_GAP_MS = 4_000;
export const CUE_PLAY_MS = 3_000;
export const MAX_PLAYING = 3;
export const MAX_CUES_PER_TURN = 6;
export const SOUNDS_PER_ROUND = 3;
export const RESTLESS_STEP_MS = 400;

export type CueSeat = Readonly<{ seat: number; bot: boolean; lastCueMs: number | null }>;
export type CueRefusal = "own_turn" | "bot" | "cue_gap" | "too_many_playing" | "turn_cue_limit";

/** A Cue from a human who is not the active Player, at most one per 4 s each, three sounding, six per Turn (12.1). */
export function canCue(p: CueSeat, activeSeat: number | null, playingEnds: readonly number[], turnCueCount: number, now: number): { ok: true } | { ok: false; reason: CueRefusal } {
  if (p.bot) return { ok: false, reason: "bot" };
  if (p.seat === activeSeat) return { ok: false, reason: "own_turn" };
  if (p.lastCueMs !== null && now - p.lastCueMs < CUE_GAP_MS) return { ok: false, reason: "cue_gap" };
  if (playingEnds.filter((e) => e > now).length >= MAX_PLAYING) return { ok: false, reason: "too_many_playing" };
  if (turnCueCount >= MAX_CUES_PER_TURN) return { ok: false, reason: "turn_cue_limit" };
  return { ok: true };
}

export type PhoneSeat = Readonly<{ seat: number; bot: boolean; consent: boolean; hasAudio: boolean; soundsThisRound: number }>;
export type SoundPlan = "play" | "flash" | "none";

/** Play with consent and audio; flash with consent and no audio; nothing without consent, with sounds off, or after three this Round. */
export function soundPlan(p: PhoneSeat, soundsOn: boolean): SoundPlan {
  if (!soundsOn || !p.consent || p.bot || p.soundsThisRound >= SOUNDS_PER_ROUND) return "none";
  return p.hasAudio ? "play" : "flash";
}
const free = (p: PhoneSeat): boolean => !p.bot && p.consent && p.soundsThisRound < SOUNDS_PER_ROUND;

/**
 * The phones a House Cue plays on, from the seeded stream `housecue`: one consenting phone with a free sound slot,
 * or every such phone in seat order for Restless. The Cue is picked from the catalogue by the same stream.
 */
export function houseCuePhones(phones: readonly PhoneSeat[], level: number, seed: number, restless: boolean): { cue: CueId; seats: number[] } {
  const r = mulberry32(hash("housecue", seed, level));
  const cue = (CUES[randInt(r, CUES.length)] as (typeof CUES)[number]).id;
  const ok = phones.filter(free).map((p) => p.seat).sort((a, b) => a - b);
  if (restless) return { cue, seats: ok };
  return { cue, seats: ok.length === 0 ? [] : [ok[randInt(r, ok.length)] as number] };
}

/** Restless plays on phone k at now + 400 k ms, against the server clock. */
export const restlessSchedule = (seats: readonly number[], nowMs: number): { seat: number; playAtMs: number }[] => seats.map((seat, k) => ({ seat, playAtMs: nowMs + RESTLESS_STEP_MS * k }));

export type FrameRefusal = "frames_off" | "own_turn" | "self" | "no_consent" | "phone_busy" | "sender_round_limit" | "target_round_limit" | "cue_limit" | "bot";
export type FrameSeat = PhoneSeat & Readonly<{ lastCueMs: number | null; frameSentRound: number | null; framedRound: number | null }>;

/** A Frame: a human, not on their Turn, plays a Cue on another consenting human's phone; one sent and one received per Round each. */
export function canFrame(sender: FrameSeat, target: FrameSeat, o: Readonly<{ framesOn: boolean; activeSeat: number | null; round: number; playingEnds: readonly number[]; turnCueCount: number; now: number }>): { ok: true } | { ok: false; reason: FrameRefusal } {
  const no = (reason: FrameRefusal): { ok: false; reason: FrameRefusal } => ({ ok: false, reason });
  if (!o.framesOn) return no("frames_off");
  if (sender.bot || target.bot) return no("bot");
  if (sender.seat === o.activeSeat) return no("own_turn");
  if (sender.seat === target.seat) return no("self");
  if (!target.consent) return no("no_consent");
  if (target.soundsThisRound >= SOUNDS_PER_ROUND) return no("phone_busy");
  if (sender.frameSentRound === o.round) return no("sender_round_limit");
  if (target.framedRound === o.round) return no("target_round_limit");
  if (!canCue(sender, o.activeSeat, o.playingEnds, o.turnCueCount, o.now).ok) return no("cue_limit");
  return { ok: true };
}

/** The one public event a House Cue and a Frame both make: whose phone, which Cue. No source, ever. */
export const phoneCueEvent = (id: number, target: number, cue: CueId) => ({ id, kind: "phone-cue" as const, target, cue });

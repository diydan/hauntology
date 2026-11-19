import { STITCH_GAME_CAP, STITCH_MIN_GAME_MS, STITCH_ROUND_CAP } from "../limits";
import type { StitchClip } from "./compose";
import { consentEffective, type StitchConsent } from "./consent";
import { eligibleTemplates, STARTER_TEMPLATES, type StitchTemplate } from "./templates";

/**
 * Stitch rarity & reveal rules (ghost-voice 5.7, Requirement 5.4).
 *
 * Eligible only on a Haunt Event or midnight line, >= 60s into the game, outside an Accusation,
 * within 1 per Round and 2 per game, never the same seat twice running, and only from a seat
 * with effective consent and all clips for at least one Template.
 */
export type StitchEventKind = "haunt_event" | "midnight" | "other";

export type StitchSeatCandidate = {
  seat: number;
  consent: StitchConsent | null;
  clips: readonly StitchClip[];
};

export type StitchEligibilityInput = {
  kind: StitchEventKind;
  gameElapsedMs: number;
  accusationActive: boolean;
  roundStitches: number;
  gameStitches: number;
  lastSeat: number | null;
  seats: readonly StitchSeatCandidate[];
  enabled: boolean;
  templates?: readonly StitchTemplate[];
};

export function stitchEligible(
  c: StitchEligibilityInput,
  rng: () => number,
): { ok: true; seat: number; template: StitchTemplate } | { ok: false; reason: string } {
  if (!c.enabled) return { ok: false, reason: "disabled" };
  if (c.kind !== "haunt_event" && c.kind !== "midnight") return { ok: false, reason: "wrong_moment" };
  if (!Number.isFinite(c.gameElapsedMs) || c.gameElapsedMs < STITCH_MIN_GAME_MS) return { ok: false, reason: "too_early" };
  if (c.accusationActive) return { ok: false, reason: "accusation_active" };
  if (c.roundStitches >= STITCH_ROUND_CAP) return { ok: false, reason: "round_cap" };
  if (c.gameStitches >= STITCH_GAME_CAP) return { ok: false, reason: "game_cap" };

  const templates = c.templates ?? STARTER_TEMPLATES;
  const readySeats = c.seats
    .filter((s) => s.seat !== c.lastSeat && consentEffective(s.consent))
    .map((s) => ({ seat: s.seat, templates: eligibleTemplates(s.seat, templates, s.clips) }))
    .filter((s) => s.templates.length > 0);

  if (readySeats.length === 0) return { ok: false, reason: "no_eligible_seat" };

  const seatIdx = Math.min(readySeats.length - 1, Math.max(0, Math.floor(rng() * readySeats.length)));
  const pickedSeat = readySeats[seatIdx]!;
  const tplIdx = Math.min(pickedSeat.templates.length - 1, Math.max(0, Math.floor(rng() * pickedSeat.templates.length)));
  return { ok: true, seat: pickedSeat.seat, template: pickedSeat.templates[tplIdx]! };
}

export type StitchPublicEvent = { kind: "stitch"; text: "a voice whispered" };

export function stitchPublicEvent(): StitchPublicEvent {
  return { kind: "stitch", text: "a voice whispered" };
}

export type PlayedStitch = {
  eventId: string;
  seat: number;
  templateId: string;
  subtitle: string;
  at: number;
};

export function stitchReveal(played: readonly PlayedStitch[]): { eventId: string; seat: number; templateId: string; subtitle: string; at: number }[] {
  return played.map((p) => ({ eventId: p.eventId, seat: p.seat, templateId: p.templateId, subtitle: p.subtitle, at: p.at }));
}

import { ACHIEVEMENTS, earned, type AchievementId, type ClockEvent } from "@hauntology/shared/party/clock";
import type { PrivateSnapshot, PublicSnapshot } from "@hauntology/shared/party/engine";
import { denialCopy } from "@hauntology/shared/app/errors-copy";
import type { Knowledge } from "@hauntology/shared/party/notebook";
import type { GameView } from "../game-view";

/** Plain helpers for the phone's play screens: what the Room's views say, in the words and numbers a screen needs. No rule lives here. */

/** Milliseconds left to a server deadline, on this phone's clock plus the offset the Room measured. Never below zero. */
export const remainingMs = (deadlineMs: number | null, nowMs: number, offsetMs: number): number | null =>
  deadlineMs === null || !Number.isFinite(deadlineMs) ? null : Math.max(0, deadlineMs - (nowMs + offsetMs));

export const WARNING_MS = 10_000;

/** "1:05", "0:09", or "No clock". Rounds up, so the last second still reads 0:01. */
export function clockWords(ms: number | null, paused = false): string {
  if (ms === null) return "No clock";
  const total = Math.ceil(ms / 1000);
  const text = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  return paused ? `${text} (paused)` : text;
}

export type Turn = Readonly<{ activeSeat: number | null; mine: boolean; poltergeist: boolean; zone: string | null; name: string }>;
export function turnOf(game: GameView, me: number): Turn {
  const pub = game.pub;
  const active = pub?.active ?? null;
  const mineRec = pub?.seats.find((s) => s.seat === me);
  return { activeSeat: active, mine: active === me && mineRec?.poltergeist !== true, poltergeist: mineRec?.poltergeist === true, zone: pub?.at ?? null, name: pub?.seats.find((s) => s.seat === active)?.nickname ?? "" };
}

export type NamedCard = Readonly<{ id: string; name: string }>;
export function nameOf(pub: PublicSnapshot | null, id: string): string {
  return pub?.zones.find((c) => c.id === id)?.name ?? pub?.suspects.find((c) => c.id === id)?.name ?? pub?.relics.find((c) => c.id === id)?.name ?? id;
}

/** Everything this seat knows for certain, as the notebook reads it (party-mode 4.4). Passes come from the public Suggestion events. */
export function knowledgeOf(game: GameView, me: number, autoCross: boolean): Knowledge {
  const priv = game.priv;
  const passes = (game.pub?.events ?? []).flatMap((e) => (e.kind === "suggest" ? e.passed.map((seat) => ({ seat, cards: [e.suspect, e.zone, e.relic] })) : []));
  return { me, hand: (priv?.hand ?? []).map((c) => c.id), shown: (priv?.shownToMe ?? []).map((x) => ({ card: x.card, by: x.by })), found: priv?.found ?? [], passes, autoCross };
}

/** The Achievements this seat has earned, in the words of the rules, from the public log alone. */
export function achievementsOf(pub: PublicSnapshot | null, me: number): readonly { id: AchievementId; label: string; seconds: number }[] {
  const log = (pub?.events ?? []) as readonly ClockEvent[];
  return [...earned(log, me, pub?.zones.length ?? 6)].map((id) => ({ id, label: ACHIEVEMENTS[id].label, seconds: ACHIEVEMENTS[id].seconds }));
}

export const HAUNT_WORDS: Readonly<Record<string, { name: string; line: string }>> = {
  "cold-spot": { name: "Cold Spot", line: "One room goes cold: nobody can ask there until the end of the next round." },
  blackout: { name: "Blackout", line: "The next Turn is shorter." },
  restless: { name: "Restless", line: "Every phone that agreed to sound rattles in turn." },
  lull: { name: "Lull", line: "The haunting eases by one." },
  slam: { name: "Slam", line: "A door shuts, and a knock sounds at the screen." },
};

/** The words for a refusal the Room sent. A code the phone has no words for gets the Room's general line. */
export const refusalWords = (code: string): { title: string; body: string } => {
  const c = denialCopy(code);
  return { title: c.title, body: c.body };
};

/** The seconds left to a private deadline, for the 10 s answer window and the 15 s Haunt choice. */
export const secondsLeft = (deadlineMs: number, nowMs: number, offsetMs: number): number => Math.max(0, Math.ceil((deadlineMs - (nowMs + offsetMs)) / 1000));

export const isMyAnswer = (priv: PrivateSnapshot | null): priv is PrivateSnapshot & { answer: NonNullable<PrivateSnapshot["answer"]> } => priv?.answer != null;

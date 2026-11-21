import type { EngineEvent, PrivateSnapshot, PublicSnapshot } from "@hauntology/shared/party/engine";
import type { Recap } from "@hauntology/shared/party/ending";
import { caughtLogLine, doneLogLine } from "@hauntology/shared/party/errands";

/**
 * Plain words for the solo table (integration 4.2): names for seats and cards, one log line per public event, and the
 * notebook. Framework-free, so it is tested on its own. It reads only the views the Room sent.
 */
export type Names = Readonly<{ seat(n: number | null): string; card(id: string): string }>;

export function namesOf(view: PublicSnapshot, mySeat: number | null): Names {
  const cards = new Map<string, string>();
  for (const x of [...view.suspects, ...view.zones, ...view.relics]) cards.set(x.id, x.name);
  return {
    seat: (n) => (n === null ? "nobody" : n === mySeat ? "You" : view.seats.find((x) => x.seat === n)?.nickname ?? `Seat ${n}`),
    card: (id) => cards.get(id) ?? id,
  };
}

/** One line for the public log, or null for an event the log does not show. Never anything private. */
export function eventLine(e: EngineEvent, n: Names): string | null {
  switch (e.kind) {
    case "turn-start": return `${n.seat(e.seat)}: turn starts.`;
    case "visit": return `${n.seat(e.seat)} went to the ${n.card(e.zone)}.`;
    case "inspect": return `${n.seat(e.seat)} searched the ${n.card(e.zone)}.`;
    case "suggest": {
      const who = `${n.seat(e.seat)} asked: ${n.card(e.suspect)}, in the ${n.card(e.zone)}, with the ${n.card(e.relic)}?`;
      return e.refuter === null ? `${who} Nobody could answer.` : `${who} ${n.seat(e.refuter)} showed a card.`;
    }
    case "seal": return `${n.seat(e.seat)} sealed an accusation.`;
    case "accuse": return `${n.seat(e.seat)} was ${e.right ? "right" : "wrong"}.`;
    case "timeout": return `${n.seat(e.seat)} ran out of time.`;
    case "haunt": return `The haunt rises to ${e.level}.`;
    case "haunt-event": return `The house stirs: ${e.option.replace("-", " ")}.`;
    case "eavesdrop": return `${n.seat(e.seat)} listened in.`;
    case "nudge": return `${n.seat(e.seat)} nudged ${n.seat(e.target)}.`;
    case "errand-done": return doneLogLine(n.seat(e.target), e.object);
    case "errand-caught": return caughtLogLine(n.seat(e.seat));
    default: return null;
  }
}

export type NoteMark = "mine" | "shown" | "found" | null;

/** The notebook: each card, and how you know it is not the answer (in your hand, shown to you, or found). */
export function notebook(view: PublicSnapshot, me: PrivateSnapshot | null): Readonly<{ group: string; rows: { id: string; name: string; mark: NoteMark }[] }>[] {
  const mark = (id: string): NoteMark =>
    me === null ? null : me.hand.some((c) => c.id === id) ? "mine" : me.shownToMe.some((x) => x.card === id) ? "shown" : me.found.includes(id) ? "found" : null;
  const rows = (xs: readonly { id: string; name: string }[]) => xs.map((x) => ({ id: x.id, name: x.name, mark: mark(x.id) }));
  return [
    { group: "Ghosts", rows: rows(view.suspects) },
    { group: "Rooms", rows: rows(view.zones) },
    { group: "Relics", rows: rows(view.relics) },
  ];
}

/** Seconds left on the clock, never below zero; null when no clock runs. */
export const secondsLeft = (view: PublicSnapshot, nowMs: number): number | null =>
  view.deadlineMs === null || view.paused ? null : Math.max(0, Math.ceil((view.deadlineMs - nowMs) / 1000));

/**
 * The ending's reveal (party-mode 8.5, 11.6, 12.x): who sent each Frame, House Cue, Rattle and Haunting puzzle, in order.
 * It reads only the recap (the public log plus the source list the Room releases at the end). A source whose public entry is
 * missing is skipped, never guessed. Errands (and anything else) are left to their own sections: only the four kinds below produce a line.
 */
export function revealLines(recap: Recap, n: Names): string[] {
  const entry = (id: number) => recap.entries.find((e) => e.id === id);
  const out: string[] = [];
  for (const src of recap.reveal) {
    if (src.kind === "haunting-puzzle") { if (src.from !== null) out.push(`${n.seat(src.from)} solved a haunting puzzle.`); continue; }
    const e = entry(src.eventId);
    if (e === undefined) continue;
    if (src.kind === "rattle" && e.kind === "rattle" && src.from !== null) out.push(`${n.seat(src.from)} rattled ${possessive(n.seat(e.target))} phone.`);
    else if (src.kind === "frame" && e.kind === "phone-cue" && src.from !== null) out.push(`${n.seat(src.from)} sent the ${e.cue ?? "cue"} to ${n.seat(e.target)}, and it looked like the house.`);
    else if (src.kind === "house-cue" && e.kind === "phone-cue") out.push(`The house itself sent the ${e.cue ?? "cue"} to ${n.seat(e.target)}.`);
  }
  return out;
}

const possessive = (name: string): string => (name === "You" ? "your" : `${name}'s`);

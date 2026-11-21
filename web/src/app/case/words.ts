import type { DoorEvent, DoorFeed } from "./room-client";
import type { PublicDoor } from "@hauntology/shared/party/doors";
import type { EngineEvent, PrivateSnapshot, PublicSnapshot } from "@hauntology/shared/party/engine";
import { caughtLogLine, doneLogLine } from "@hauntology/shared/party/errands";
import { knockWords } from "@hauntology/shared/puzzles/knock";

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

/** A door has no name of its own: it is named by the two rooms it joins (knock-door 7.3). */
export const doorName = (d: Pick<PublicDoor, "a" | "b">, n: Names): string => `the door between the ${n.card(d.a)} and the ${n.card(d.b)}`;
const upper = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** One line for a door change, for the live region (knock-door 2.4, 4.4, 7.3). Never the pattern. */
export function doorLine(e: DoorEvent, doors: readonly PublicDoor[], n: Names): string {
  const d = doors.find((x) => x.id === e.id);
  const name = d === undefined ? "a door" : doorName(d, n);
  if (e.open) {
    switch (e.reason) {
      case "knock": return upper(`${name} opens to the knock.`);
      case "together": return upper(`${name} gives way. You pushed it together.`);
      case "timeout": return upper(`${name} creaks open by itself.`);
      default: return upper(`${name} opens.`);
    }
  }
  if (e.reason === "act") return upper(`${e.have} of ${e.need} are pushing ${name}.${e.need - e.have > 0 ? ` ${e.need - e.have} more to go.` : ""}`);
  return e.reason === "slam" ? upper(`${name} slams shut.`) : upper(`${name} is shut.`);
}

/** A door's state in words: shut or open, how it opens, and a heavy door's count. */
export function doorStatus(d: PublicDoor, n: Names): string {
  const how = d.lock === "knock" ? "opens to the ghost's knock" : `needs ${d.need} ${d.need === 1 ? "Player" : "Players"} to push together${!d.open && d.have > 0 ? ` (${d.have} of ${d.need} now)` : ""}`;
  return `${upper(doorName(d, n))} is ${d.open ? "open" : "shut"}; it ${how}.`;
}

/** What the Room said about a knock try, in one line (knock-door 3.4, 3.5). */
export function doorResultLine(r: NonNullable<DoorFeed["result"]>): string {
  if (r.outcome === "opened") return `${r.heard} The door opens.`;
  if (r.outcome === "failed") return `${r.heard} No tries left. The door will open by itself next round.`;
  return `${r.heard} Not that one. ${r.triesLeft} ${r.triesLeft === 1 ? "try" : "tries"} left.`;
}

/** A knock as marks: "● ● ●   ● ●" for 3, pause, 2. */
export const knockMarks = (groups: readonly number[]): string => groups.map((g) => "●".repeat(g).split("").join(" ")).join("   ");
/** The same knock in words: "3, pause, 2". */
export const knockLine = (groups: readonly number[], long: number | null): string => knockWords({ groups, long });

/** Seconds left on the clock, never below zero; null when no clock runs. */
export const secondsLeft = (view: PublicSnapshot, nowMs: number): number | null =>
  view.deadlineMs === null || view.paused ? null : Math.max(0, Math.ceil((view.deadlineMs - nowMs) / 1000));

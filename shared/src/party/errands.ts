import { hash, mulberry32, shuffle } from "../puzzles/rng";

/**
 * Haunting errands (`.kiro/specs/errands`): a Poltergeist's secret job to get one Detective to hold one everyday object.
 * Pure logic only. The Room keeps the open Errands, sends each one to its Poltergeist only, and asks the Target. Nothing
 * here reads or changes a card, a Hand, the Solution, the Turn order or a win.
 */

/** Twelve safe things found in most homes: nothing hot, sharp, a medicine, or taken from a person (4.2). */
export const ERRAND_OBJECTS = [
  "spoon", "mug", "cushion", "sock", "pen", "book", "remote", "glass of water", "tea towel", "apple", "coat", "key ring",
] as const;
export type ErrandObject = (typeof ERRAND_OBJECTS)[number];
export const isErrandObject = (s: string): s is ErrandObject => (ERRAND_OBJECTS as readonly string[]).includes(s);

/** The line every Errand card shows (4.3). */
export const ERRAND_RULE_LINE = "Ask, trick or tempt. Never grab or push.";
/** Scare points for a Done Errand (2.2). */
export const DONE_SCARE = 2;
/** Bonus time for a right Caught call, added to the caller's next Turn (3.2). */
export const CAUGHT_BONUS_MS = 10_000;
/** An open Errand is replaced once it is this many full Rounds old (1.3). */
export const ERRAND_ROUNDS = 2;
/** How long the Target has to answer "Are you holding …?" before the Errand stays open (2.3). */
export const DONE_ANSWER_MS = 20_000;

export type Seat = number;
export type ErrandStatus = "open" | "done" | "caught" | "expired";
export type Errand = Readonly<{
  id: string;
  from: Seat;
  target: Seat;
  object: ErrandObject;
  givenRound: number;
  /** The Round in which the Poltergeist last tapped Done, or null. Done may be tried once per Round (2.3). */
  doneTriedRound: number | null;
  status: ErrandStatus;
}>;

/** What the Room knows about a seat, for choosing a Target (1.2). */
export type SeatInfo = Readonly<{ seat: Seat; human: boolean; detective: boolean; optedOut: boolean }>;

/** The seats that may be a Target of `from`: human Detectives who have not opted out, never the sender (1.2, 4.4). */
export function eligibleTargets(from: Seat, seats: readonly SeatInfo[]): Seat[] {
  return seats.filter((s) => s.human && s.detective && !s.optedOut && s.seat !== from).map((s) => s.seat);
}

/**
 * The next Errand for a Poltergeist, or null when no fair Target exists (1.1 to 1.4).
 * Deterministic in the seed, the sender and how many Errands that sender was already given.
 * `preferred` is the object from a lobby photo; the Room passes it only for the first Errand of the game (1.4).
 * No two open Errands share a Target and an object (1.3).
 */
export function nextErrand(
  seed: number, from: Seat, given: number, seats: readonly SeatInfo[], open: readonly Errand[], round: number,
  preferred: ErrandObject | null = null,
): Errand | null {
  const targets = eligibleTargets(from, seats);
  if (targets.length === 0) return null;
  const r = mulberry32(hash("errand", seed, from, given));
  const taken = new Set(open.filter((e) => e.status === "open").map((e) => `${e.target}|${e.object}`));
  const objects = shuffle(r, ERRAND_OBJECTS);
  const order = preferred === null ? objects : [preferred, ...objects.filter((o) => o !== preferred)];
  const people = shuffle(r, targets);
  for (const object of order) {
    for (const target of people) {
      if (taken.has(`${target}|${object}`)) continue;
      return { id: `${from}:${given}`, from, target, object, givenRound: round, doneTriedRound: null, status: "open" };
    }
  }
  return null; // every pair is taken: only possible with more open Errands than pairs
}

/** An open Errand that is two full Rounds old is replaced (1.3). */
export const isExpired = (e: Errand, round: number): boolean => e.status === "open" && round - e.givenRound >= ERRAND_ROUNDS;

/** The Poltergeist may tap Done once per Round per open Errand (2.3). */
export const mayTryDone = (e: Errand, round: number): boolean => e.status === "open" && e.doneTriedRound !== round;

/**
 * Settle the Target's answer to "Are you holding a <object> right now?". Only Yes makes it Done and scores (2.1, 2.2);
 * No or no answer keeps it open and uses the Round's try (2.3). A settled Errand never scores again.
 */
export function settleDone(e: Errand, answer: "yes" | "no" | "timeout", round: number): { errand: Errand; scare: number } {
  if (!mayTryDone(e, round)) return { errand: e, scare: 0 };
  if (answer === "yes") return { errand: { ...e, doneTriedRound: round, status: "done" }, scare: DONE_SCARE };
  return { errand: { ...e, doneTriedRound: round }, scare: 0 };
}

/** A Detective may call Caught once per Round (3.1). */
export const mayCallCaught = (lastCallRound: number | null, round: number): boolean => lastCallRound !== round;

/**
 * A Caught call: a Detective names a Poltergeist and an object. A match closes that Errand with no Scare points and
 * gives the caller Bonus time (3.2). A miss changes nothing, and says nothing about whether an Errand exists (3.3).
 */
export function settleCaught(
  open: readonly Errand[], caller: Seat, poltergeist: Seat, object: ErrandObject,
): { errands: Errand[]; closed: Errand | null; bonusMs: number } {
  const hit = open.find((e) => e.status === "open" && e.from === poltergeist && e.object === object && e.from !== caller);
  if (!hit) return { errands: [...open], closed: null, bonusMs: 0 };
  const closed: Errand = { ...hit, status: "caught" };
  return { errands: open.map((e) => (e.id === hit.id ? closed : e)), closed, bonusMs: CAUGHT_BONUS_MS };
}

/** What the public log may say about a Done Errand: the Target and the object, never the sender (2.2). */
export const doneLogLine = (targetName: string, object: ErrandObject): string => `${targetName} was made to hold a ${object}`;
/** What the public log says about a right Caught call (3.2). */
export const caughtLogLine = (callerName: string): string => `${callerName} caught a haunting`;
/** The ending recap line for one Errand: sender, Target, object and outcome (2.4). */
export function recapLine(e: Errand, name: (s: Seat) => string): string {
  const outcome = { open: "not finished", done: "done", caught: "caught", expired: "ran out" }[e.status];
  return `${name(e.from)} tried to get ${name(e.target)} to hold a ${e.object}: ${outcome}`;
}

/**
 * The Errand object a lobby Photo Prompt subject stands for, or null (1.4). Matches by name, so "a mug" and "Mug"
 * both give "mug"; the photo prompt catalogue lives with the lobby and only needs to name its subjects plainly.
 */
export function errandObjectForPrompt(subject: string): ErrandObject | null {
  const s = subject.trim().toLowerCase().replace(/^(a|an|the|your)\s+/, "");
  if (isErrandObject(s)) return s;
  return ERRAND_OBJECTS.find((o) => s === `${o}s` || s.startsWith(`${o} `)) ?? null;
}

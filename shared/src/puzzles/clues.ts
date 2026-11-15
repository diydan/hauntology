/**
 * Spirit clues (puzzles Requirement 15): the optional layer that shows a Sight as clues hanging in the air round the phone.
 * Pure: the ring depends on the seed and the code alone, nothing here reads the clock, a sensor or `Math.random`, and
 * nothing here knows a Hand, a Residue position or a Solution. The layer changes how a Sight is shown, never what it says.
 */
import { hash, mulberry32, randInt, shuffle } from "./rng";

export type ClueForm = "code" | "address" | "phone" | "date";
export type StoryForm = Exclude<ClueForm, "code">;

/**
 * One clue on the Clue ring. `turn` and `height` are radians: turn 0 is straight ahead and positive is to the right
 * (in the range -pi to pi), height 0 is level and positive is up. A Code piece also carries its place in the code.
 */
export type SpiritClue = Readonly<{
  id: string;
  form: ClueForm;
  text: string;
  place?: number;
  of?: number;
  turn: number;
  height: number;
}>;

/** How far from the Player the clues hang (the drawing's choice; the logic only needs directions). */
export const RING_RADIUS_M = 1.5;
/** The most clues one ring holds, so that two clues are never closer than MIN_TURN_GAP of turn. */
export const MAX_CLUES = 7;
export const MIN_TURN_GAP = (35 * Math.PI) / 180;
/** How far a clue may sit from the middle of its slot. */
export const JITTER = (8 * Math.PI) / 180;
export const HEIGHT_MIN = (-30 * Math.PI) / 180;
export const HEIGHT_MAX = (40 * Math.PI) / 180;

/** Made-up streets, made-up numbers, dates before 1950. Nothing here is a real address, and no Player types or sends one. */
export const ADDRESSES: readonly string[] = [
  "9 Marrow Lane", "14 Thistle Row", "3 Sallow Court", "22 Lantern Yard", "7 Ember Close", "31 Wren Hollow", "5 Quill Street",
  "18 Fallow Mews", "12 Ashen Walk", "26 Bracken Gate", "4 Gable End", "15 Lindle Road", "8 Tallow Hill", "20 Cinder Row",
];
export const DATES: readonly string[] = [
  "12 March 1931", "3 November 1927", "29 June 1904", "17 January 1919", "8 September 1936", "21 April 1912", "5 December 1898",
  "30 May 1923", "14 October 1941", "2 February 1906", "19 August 1933", "27 July 1915", "9 June 1889", "11 November 1921",
];
/** 555-0100 to 555-0199: the range reserved for fiction, so a clue never rings a stranger. */
export const PHONE_PATTERN = /^555-01\d\d$/;

const TAU = Math.PI * 2;
/** An angle brought into -pi (excluded) to pi (included). */
const wrap = (x: number): number => {
  let t = x % TAU;
  if (t > Math.PI) t -= TAU;
  if (t <= -Math.PI) t += TAU;
  return t;
};

/** The shortest way round the circle between two turns, 0 to pi. Not a number in, pi out (far away). */
export function turnGap(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Math.PI;
  return Math.abs(wrap(a - b));
}

function storyText(r: () => number, form: StoryForm): string {
  if (form === "address") return ADDRESSES[randInt(r, ADDRESSES.length)] ?? "9 Marrow Lane";
  if (form === "date") return DATES[randInt(r, DATES.length)] ?? "12 March 1931";
  return `555-01${String(randInt(r, 100)).padStart(2, "0")}`;
}

/**
 * Hang the clues of one Sight round the Player: one Code piece for each digit of `code` and, to make seven clues at most,
 * up to three Story clues (one of each form). The turn is cut into one equal slot for each clue, the clues take the slots
 * in a seeded order, each sits within JITTER of the middle of its slot, so no two are closer than MIN_TURN_GAP of turn and,
 * with four or more clues, every quarter of the turn holds one. Heights come from the seed.
 */
export function placeClues(seed: number, code: readonly number[]): SpiritClue[] {
  if (code.length < 1 || code.length > MAX_CLUES || code.some((d) => !Number.isInteger(d) || d < 0 || d > 9)) {
    throw new RangeError("a code is 1 to 7 digits, each 0 to 9");
  }
  const r = mulberry32(hash("spirit-clues", seed >>> 0, code.join("")));
  const storyCount = Math.min(3, MAX_CLUES - code.length);
  const forms = shuffle(r, ["address", "phone", "date"] as const).slice(0, storyCount);
  const pieces: Omit<SpiritClue, "turn" | "height">[] = code.map((d, i) => ({ id: `code-${i + 1}`, form: "code", text: String(d), place: i + 1, of: code.length }));
  const story: Omit<SpiritClue, "turn" | "height">[] = forms.map((f) => ({ id: f, form: f, text: storyText(r, f) }));
  const all = shuffle(r, [...pieces, ...story]);
  const n = all.length;
  return all.map((c, k) => {
    const middle = ((k + 0.5) * TAU) / n; // 0 to 2 pi, clockwise from straight ahead
    const turn = wrap(middle + (r() * 2 - 1) * JITTER);
    const height = HEIGHT_MIN + r() * (HEIGHT_MAX - HEIGHT_MIN);
    return { ...c, turn, height };
  });
}

/** True when the clue's text comes from the fixed made-up lists (or is a digit, or a 555-01xx number). */
export function isMadeUp(c: Pick<SpiritClue, "form" | "text">): boolean {
  if (c.form === "code") return /^[0-9]$/.test(c.text);
  if (c.form === "address") return ADDRESSES.includes(c.text);
  if (c.form === "date") return DATES.includes(c.text);
  return PHONE_PATTERN.test(c.text);
}

/** The plain name of a clue, for the Clue list and for a screen reader. */
export function clueTitle(c: Pick<SpiritClue, "form" | "place" | "of">): string {
  if (c.form === "code") return `Code piece ${c.place ?? "?"} of ${c.of ?? "?"}`;
  if (c.form === "address") return "An address";
  if (c.form === "phone") return "A phone number";
  return "A date";
}

// ---------------------------------------------------------------- the text way in (the Clue list, "Show all as text")

export type ClueRow = Readonly<{ id: string; title: string; text: string | null }>;

/** Every clue as a row: its text once read, `null` ("Not found yet") before. */
export function clueRows(clues: readonly SpiritClue[], read: ReadonlySet<string>): ClueRow[] {
  return clues.map((c) => ({ id: c.id, title: clueTitle(c), text: read.has(c.id) ? c.text : null }));
}

/** "Code so far": each digit in its place, `null` for a piece not read yet. The length is the length of the code. */
export function codeSoFar(clues: readonly SpiritClue[], read: ReadonlySet<string>): (number | null)[] {
  const pieces = clues.filter((c) => c.form === "code").sort((a, b) => (a.place ?? 0) - (b.place ?? 0));
  return pieces.map((c) => (read.has(c.id) ? Number(c.text) : null));
}

/** "Show all as text": every clue read at once, so a Lock is finishable without turning (12.1). */
export const readAll = (clues: readonly SpiritClue[]): Set<string> => new Set(clues.map((c) => c.id));

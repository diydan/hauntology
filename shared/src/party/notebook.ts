/**
 * The notebook (party-mode 4.4): a grid of the 18 cards against every Player and the Residue. The game fills in only
 * what the Player knows for certain: their own Hand, each card shown to them, each Residue card they found, and, only
 * with auto-cross on, "lacks" for the three cards of a Suggestion a Player passed on. It makes no other inference.
 * The Player's own marks are kept apart and are never removed. The notebook stays on the device.
 */
export type Mark = "has" | "lacks" | "maybe" | "blank";
/** A column: a seat number, or the Residue. */
export type Column = number | "residue";
export const cellKey = (card: string, col: Column): string => `${card}|${col}`;

export type Knowledge = Readonly<{
  me: number;
  hand: readonly string[];
  shown: readonly Readonly<{ card: string; by: number }>[];
  found: readonly string[];
  /** Suggestions a Player could not answer: they lack all three cards. */
  passes: readonly Readonly<{ seat: number; cards: readonly string[] }>[];
  autoCross: boolean;
}>;

/** The marks the game fills in. "has" wins over "lacks" if both ever meet (they cannot in a real game). */
export function autoMarks(k: Knowledge): ReadonlyMap<string, "has" | "lacks"> {
  const out = new Map<string, "has" | "lacks">();
  if (k.autoCross) for (const p of k.passes) for (const c of p.cards) out.set(cellKey(c, p.seat), "lacks");
  for (const c of k.hand) out.set(cellKey(c, k.me), "has");
  for (const s of k.shown) out.set(cellKey(s.card, s.by), "has");
  for (const c of k.found) out.set(cellKey(c, "residue"), "has");
  return out;
}

/** How many of the three Residue cards this Player has found. */
export const residueFound = (k: Knowledge): number => Math.min(3, new Set(k.found).size);

/** The Player's own marks. Setting "blank" clears only a mark the Player made. */
export type PlayerMarks = ReadonlyMap<string, Exclude<Mark, "blank">>;
export function markCard(marks: PlayerMarks, card: string, col: Column, mark: Mark): PlayerMarks {
  const next = new Map(marks);
  if (mark === "blank") next.delete(cellKey(card, col));
  else next.set(cellKey(card, col), mark);
  return next;
}

/** What one cell shows: the Player's own mark if they made one, else the game's, else blank. */
export function cellMark(auto: ReadonlyMap<string, "has" | "lacks">, mine: PlayerMarks, card: string, col: Column): Mark {
  const key = cellKey(card, col);
  return mine.get(key) ?? auto.get(key) ?? "blank";
}

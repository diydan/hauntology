/**
 * What the Spirit table shows of a card (spirit-table 3.5): worked out from the Player's own notebook grid alone.
 * Every card is in exactly one of the Solution, the Residue or one Hand, so a card that some Player or the Residue is marked as
 * having cannot be in the Solution: it is ruled out. A card nobody is marked as having, with some column marked maybe, is
 * maybe. Anything else, including a card marked as lacked in every column, has no Mark: by elimination it would be the
 * Solution, but the notebook makes no inference (party-mode 4.4) and the table makes none either.
 */
import { cellMark, type Column, type PlayerMarks } from "../party/notebook";

export type TableMark = "ruled_out" | "maybe";

/** The notebook as the table reads it: the game's marks, the Player's own marks, and the columns (every seat and the Residue). */
export type TableNotebook = Readonly<{
  auto: ReadonlyMap<string, "has" | "lacks">;
  mine: PlayerMarks;
  columns: readonly Column[];
}>;

export function markOf(notebook: TableNotebook, card: string): TableMark | undefined {
  let maybe = false;
  for (const col of notebook.columns) {
    const m = cellMark(notebook.auto, notebook.mine, card, col);
    if (m === "has") return "ruled_out"; // ruled out beats maybe
    if (m === "maybe") maybe = true;
  }
  return maybe ? "maybe" : undefined;
}

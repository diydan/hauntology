import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { cellKey, cellMark, markCard, type Column, type Mark, type PlayerMarks } from "../party/notebook";
import { markOf, type TableNotebook } from "./notebook";

const CARDS = ["c1", "c2", "c3", "c4"] as const;
const COLUMNS: readonly Column[] = [0, 1, 2, 3, "residue"];
const autoArb = fc.array(fc.tuple(fc.constantFrom(...CARDS), fc.constantFrom(...COLUMNS), fc.constantFrom("has" as const, "lacks" as const)), { maxLength: 12 }).map((cells) => new Map(cells.map(([c, col, m]) => [cellKey(c, col), m] as const)));
const mineArb = fc.array(fc.tuple(fc.constantFrom(...CARDS), fc.constantFrom(...COLUMNS), fc.constantFrom<Mark>("has", "lacks", "maybe", "blank")), { maxLength: 12 });
const build = (cells: readonly (readonly [string, Column, Mark])[]): PlayerMarks => cells.reduce<PlayerMarks>((m, [c, col, mark]) => markCard(m, c, col, mark), new Map());

describe("Property 9: A card's mark comes from the notebook grid alone", () => {
  // Feature: spirit-table, Property 9: A card's mark comes from the notebook grid alone
  // Validates: Requirements 3.2, 3.5
  it("is ruled out exactly when some column is marked has, maybe exactly when none is and some column is maybe, and none otherwise", () => {
    fc.assert(
      fc.property(autoArb, mineArb, fc.constantFrom(...CARDS), (auto, cells, card) => {
        const nb: TableNotebook = { auto, mine: build(cells), columns: COLUMNS };
        const marks = COLUMNS.map((col) => cellMark(auto, nb.mine, card, col));
        const expected = marks.includes("has") ? "ruled_out" : marks.includes("maybe") ? "maybe" : undefined;
        return markOf(nb, card) === expected;
      }),
      propParams(),
    );
  });

  it("gives no mark to a card marked as lacked in every column (the notebook makes no inference)", () => {
    fc.assert(
      fc.property(fc.constantFrom(...CARDS), (card) => {
        const auto = new Map(COLUMNS.map((col) => [cellKey(card, col), "lacks" as const]));
        return markOf({ auto, mine: new Map(), columns: COLUMNS }, card) === undefined;
      }),
      propParams(),
    );
  });

  it("does not change with any other card's marks, or with the order the marks were made in", () => {
    fc.assert(
      fc.property(autoArb, mineArb, fc.constantFrom(...CARDS), (auto, cells, card) => {
        const mine = build(cells), reversed = build([...cells].reverse());
        const dedupe = (m: PlayerMarks): string => JSON.stringify([...m.entries()].sort());
        const otherCards = cells.filter(([c]) => c === card);
        const same = markOf({ auto, mine, columns: COLUMNS }, card) === markOf({ auto, mine: build(otherCards), columns: COLUMNS }, card);
        // the same set of marks (one per cell, so the order cannot matter) gives the same mark
        const sameSet = dedupe(mine) === dedupe(reversed) ? markOf({ auto, mine, columns: COLUMNS }, card) === markOf({ auto, mine: reversed, columns: COLUMNS }, card) : true;
        return same && sameSet;
      }),
      propParams(),
    );
  });

  it("lets the Player's own mark over a game mark decide, as the grid does", () => {
    const auto = new Map([[cellKey("c1", 1), "has" as const]]);
    expect(markOf({ auto, mine: new Map(), columns: COLUMNS }, "c1")).toBe("ruled_out");
    expect(markOf({ auto, mine: markCard(new Map(), "c1", 1, "maybe"), columns: COLUMNS }, "c1")).toBe("maybe");
    expect(markOf({ auto, mine: markCard(new Map(), "c1", 1, "lacks"), columns: COLUMNS }, "c1")).toBeUndefined();
  });
});

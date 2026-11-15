import { describe, expect, it } from "vitest";
import { BOARD_CLUES, BOARD_WORDS, BOARD_WORDS_3, BOARD_WORDS_4, BOARD_WORDS_5, READ_WORDS, READ_WORDS_4, READ_WORDS_5, READ_WORDS_6 } from "./words";

describe("word lists", () => {
  it("are 36 words each (12 per level), A to Z only, the right lengths, no repeats", () => {
    expect(READ_WORDS).toHaveLength(36);
    expect(BOARD_WORDS).toHaveLength(36);
    for (const [list, len] of [[READ_WORDS_4, 4], [READ_WORDS_5, 5], [READ_WORDS_6, 6], [BOARD_WORDS_3, 3], [BOARD_WORDS_4, 4], [BOARD_WORDS_5, 5]] as const) {
      expect(new Set(list).size).toBe(list.length);
      for (const w of list) { expect(w).toMatch(/^[A-Z]+$/); expect(w).toHaveLength(len); }
    }
  });

  it("have gentle words only: nothing from a small list of dark words", () => {
    const dark = ["DEAD", "DEATH", "GRAVE", "BONE", "BLOOD", "KILL", "HANG", "CORPSE", "TOMB", "ASH"];
    for (const w of [...READ_WORDS, ...BOARD_WORDS]) expect(dark, w).not.toContain(w);
  });

  it("give every Spirit board word a short clue that does not contain the word", () => {
    expect(Object.keys(BOARD_CLUES).sort()).toEqual([...BOARD_WORDS].sort());
    for (const w of BOARD_WORDS) {
      const clue = BOARD_CLUES[w];
      expect(clue.length, w).toBeGreaterThanOrEqual(5);
      expect(clue.length, w).toBeLessThanOrEqual(40);
      expect(clue.toUpperCase(), w).not.toContain(w);
      expect(clue, w).toMatch(/^[a-z ,'-]+$/i);
    }
  });
});

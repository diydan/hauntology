import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { PHRASE_MAX, PHRASE_MAX_CHARS, PHRASE_WINDOW_LINES, recentPhrases } from "./phrases";
import { BEARING_PHRASE } from "./scripted";
import type { HistoryLine } from "./types";

// The ghost's stock phrases (docs/spikes/4.2.md: "dear one" opened 15 of 24 hints, "do not hurry on my account" came back again and again). Every line below is made up.

const ghost = (...texts: string[]): HistoryLine[] => texts.map((text) => ({ role: "ghost", text }));
const AVOID = [...Object.values(BEARING_PHRASE), "very close", "nearer", "far"];

const PAID_RUN = ghost(
  "Go to your left, dear one, and only a few steps, for what you are looking for is very close. I would not dawdle, since the house is patient but the moths are not.",
  "Ahead of you, dear one, just a few steps, and what you seek is nearer than it looks. Do not dawdle; the moths are already gathering at the round window.",
  "To your right, dear one, a few steps, and what you seek is nearer than you fear. Mind your footing; the boards here remember every guest.",
  "Behind you and to the right, dear one, a short way, and what you seek is nearer than you would like. Turn carefully; the house is patient but the moths are not.",
  "Go behind you, dear one, only a few steps, and what you look for is nearer than you think. Walk gently; do not hurry on my account.",
  "Ahead and to the left, dear one, and what you seek is far, farther than your patience will like. Walk slowly and do not hurry on my account.",
);

describe("recentPhrases: the words the ghost has said again and again", () => {
  it("finds what really came back in the paid run: the pet name, the closing clauses, the stock middle", () => {
    const found = recentPhrases(PAID_RUN, AVOID);
    expect(found).toContain("dear one");
    expect(found).toContain("do not hurry on my account");
    expect(found.some((p) => p.includes("the moths are"))).toBe(true); // the closing clause of two of the six, cut at the cap of six phrases
    expect(found.some((p) => p.includes("what you seek is"))).toBe(true);
    expect(found.some((p) => p.includes("a few steps"))).toBe(true);
  });

  it("never names the engine's own words for the way and the distance, which a hint must say", () => {
    const lines = ghost(...Array.from({ length: 6 }, () => "Go to your left and keep going, it is very close, nearer than you think."));
    expect(recentPhrases(lines, AVOID).length).toBeGreaterThan(0);
    for (const phrase of recentPhrases(lines, AVOID)) {
      for (const needed of [...Object.values(BEARING_PHRASE), "very close", "nearer", "far"]) {
        expect(` ${phrase} `, `${phrase} / ${needed}`).not.toContain(` ${needed} `);
        expect(` ${needed} `, `${phrase} / ${needed}`).not.toContain(` ${phrase} `);
      }
    }
    // with nothing to avoid the same history does name them (so the filter is what keeps them out)
    expect(recentPhrases(lines, []).some((p) => p.includes("to your left"))).toBe(true);
    // "to the left" is the engine's own word too (the check treats it as the same), so it is kept out when "to your left" is the one given
    const the = ghost(...Array.from({ length: 6 }, () => "Keep going to the left, it is a long way."));
    expect(recentPhrases(the, ["to the left"]).some((p) => p.includes("to the left"))).toBe(false);
  });

  it("says nothing with fewer than two ghost lines, or when nothing came back", () => {
    expect(recentPhrases([], AVOID)).toEqual([]);
    expect(recentPhrases(ghost("One line only, and very long indeed."), AVOID)).toEqual([]);
    expect(recentPhrases(ghost("The kettle is cold.", "A moth sits on the sill.", "The stairs are steep.", "No one is home."), AVOID)).toEqual([]);
  });

  it("needs a two-word run in three lines and a longer run in two", () => {
    expect(recentPhrases(ghost("The dear one waits.", "Ah, dear one, wait.", "A quiet room."), [])).toEqual([]);
    expect(recentPhrases(ghost("The dear one waits.", "Ah, dear one, wait.", "So, dear one, go."), [])).toEqual(["dear one"]);
    expect(recentPhrases(ghost("It was only the moth and the lamp.", "Only the moth and the lamp remain."), [])).toEqual(["only the moth and the lamp"]);
  });

  it("is made of function words only never: a run of plain words (to the, of a, it is) is not a stock phrase", () => {
    const plain = ghost("It is to the", "it is to the", "it is to the", "it is to the");
    expect(recentPhrases(plain, [])).toEqual([]);
  });

  it("reads only the ghost's lines, never the visitor's, and only the last six", () => {
    const visitor: HistoryLine[] = Array.from({ length: 6 }, () => ({ role: "visitor", text: "tell me about the moonlit teapot again" }));
    expect(recentPhrases([...visitor, ...ghost("A single answer.")], [])).toEqual([]);
    const old = ghost(...Array.from({ length: 4 }, () => "the teapot sings softly"));
    const fresh = ghost("one", "two", "three", "four", "five", "six").map((h, i) => ({ ...h, text: `${["a lamp", "a door", "a stair", "a sill", "a bell", "a coat"][i]} waits` }));
    expect(recentPhrases([...old, ...fresh], [])).toEqual([]); // the old lines are outside the window of six
    expect(PHRASE_WINDOW_LINES).toBe(6);
  });

  it("keeps the longest run and drops a run inside it, and the shorter, more frequent run when it is separate", () => {
    const lines = ghost("do not hurry on my account, dear one", "do not hurry on my account", "I say do not hurry on my account, dear one", "dear one, go");
    const found = recentPhrases(lines, []);
    expect(found).toContain("do not hurry on my account");
    expect(found).toContain("dear one");
    expect(found).not.toContain("hurry on my account");
    expect(found).not.toContain("do not hurry");
  });

  it("is capped at six phrases and 200 characters, and is the same every time", () => {
    const wordy = ghost(...Array.from({ length: 6 }, () => "alpha beta gamma. delta epsilon zeta. eta theta iota. kappa lambda mu. nu xi omicron. pi rho sigma. tau upsilon phi."));
    const found = recentPhrases(wordy, []);
    expect(found.length).toBeLessThanOrEqual(PHRASE_MAX);
    expect(found.join("").length).toBeLessThanOrEqual(PHRASE_MAX_CHARS);
    expect(recentPhrases(wordy, [])).toEqual(found);
    expect(PHRASE_MAX).toBe(6);
    expect(PHRASE_MAX_CHARS).toBe(200);
  });

  it("holds the 200 characters even when the words are long, by dropping a phrase that no longer fits", () => {
    const long = (w: string) => `${w}aaaaaaaaa ${w}bbbbbbbbb ${w}ccccccccc ${w}ddddddddd ${w}eeeeeeeee ${w}fffffffff`;
    const lines = ghost(...Array.from({ length: 6 }, () => ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"].map(long).join(". ") + "."));
    const found = recentPhrases(lines, []);
    expect(found.length).toBeGreaterThan(1);
    expect(found.join("").length).toBeLessThanOrEqual(PHRASE_MAX_CHARS);
    expect(found.join("").length).toBeGreaterThan(PHRASE_MAX_CHARS - 80); // it fills the room, it does not stop at one
  });

  it("drops a longer run that holds a phrase already chosen, and a run that only continues one (a few steps, few steps and what you)", () => {
    const holds = ghost("dear one go", "so dear one go", "ah dear one", "a dear one", "oh dear one", "a lamp");
    expect(recentPhrases(holds, [])).toEqual(["dear one"]); // "dear one go" (two lines) holds the more frequent "dear one" (five), so it adds nothing
    const continues = ghost("only a few steps and what you seek", "a few steps and what you seek", "a few steps and what you seek is near");
    expect(recentPhrases(continues, [])).toEqual(["a few steps and what you", "you seek"]); // "few steps and what you seek" only continues the first by five words, so it is not named
  });

  it("copes with a very long line and with odd characters", () => {
    const long = ghost("word ".repeat(1000), "word ".repeat(1000), "ünï cödé — «quoted» ‘words’ here ", "ünï cödé — «quoted» ‘words’ here ");
    const found = recentPhrases(long, []);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((p) => p.length <= PHRASE_MAX_CHARS)).toBe(true);
  });
});

describe("Property: recentPhrases over any history", () => {
  const lineArb = fc.constantFrom("dear one", "go gently", "the house is patient", "do not hurry on my account", "a moth", "the round window", "step softly", "very close", "to your left", "the boards are fond").map((x) => x);
  const textArb = fc.array(lineArb, { minLength: 1, maxLength: 5 }).map((parts) => parts.join(", ") + ".");
  const historyArb = fc.array(fc.record({ role: fc.constantFrom<"visitor" | "ghost">("visitor", "ghost"), text: fc.oneof(textArb, fc.string({ maxLength: 80 })) }), { maxLength: 16 });

  it("is bounded, deterministic, made of words the ghost said in more than one line, and never holds an avoided word run", () => {
    fc.assert(
      fc.property(historyArb, (history) => {
        const found = recentPhrases(history, AVOID);
        expect(recentPhrases(history, AVOID)).toEqual(found);
        expect(found.length).toBeLessThanOrEqual(PHRASE_MAX);
        expect(found.join("").length).toBeLessThanOrEqual(PHRASE_MAX_CHARS);
        expect(new Set(found).size).toBe(found.length);
        for (const phrase of found) expect(phrase, phrase).toMatch(/^[\p{L}\p{N}'’]+( [\p{L}\p{N}'’]+)+$/u); // plain words only: nothing a visitor could use to break out of the prompt
        const window = history.filter((h) => h.role === "ghost").slice(-PHRASE_WINDOW_LINES).map((h) => ` ${h.text.toLowerCase().split(/[^\p{L}\p{N}'’]+/u).filter(Boolean).join(" ")} `);
        for (const phrase of found) {
          expect(window.filter((l) => l.includes(` ${phrase} `)).length, phrase).toBeGreaterThanOrEqual(2);
          for (const needed of [...Object.values(BEARING_PHRASE), "very close", "nearer", "far"]) {
            expect(` ${phrase} `.includes(` ${needed} `) || ` ${needed} `.includes(` ${phrase} `), `${phrase} / ${needed}`).toBe(false);
          }
        }
      }),
      propParams(),
    );
  });

  it("does not change when the visitor's lines change", () => {
    fc.assert(
      fc.property(historyArb, fc.string({ maxLength: 40 }), (history, said) => {
        const swapped = history.map((h): HistoryLine => (h.role === "visitor" ? { role: "visitor", text: said } : h));
        expect(recentPhrases(swapped, AVOID)).toEqual(recentPhrases(history, AVOID));
      }),
      propParams(),
    );
  });
});

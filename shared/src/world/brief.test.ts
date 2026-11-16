import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { BRIEF_MAX_CHARS, BRIEF_MAX_ENCODED, BRIEF_MAX_WORDS, PLACE_BRIEF_SCHEMA, PLACE_BRIEF_SYSTEM, cleanBrief, decodeBrief, encodeBrief, parsePlaceBrief } from "./brief";

const words = (n: number, w = "word") => Array.from({ length: n }, (_, i) => `${w}${i}`).join(" ");
const safe = (brief: string) => JSON.stringify({ brief, safe: true });

describe("parsePlaceBrief", () => {
  it("reads a clean answer, as text, as an object and inside the Workers AI wrapper", () => {
    const v = { kind: "safe", brief: "A narrow kitchen with a blue door and morning light." };
    expect(parsePlaceBrief(safe("A narrow kitchen with a blue door and morning light."))).toEqual(v);
    expect(parsePlaceBrief({ brief: "A narrow kitchen with a blue door and morning light.", safe: true })).toEqual(v);
    expect(parsePlaceBrief({ response: safe("A narrow kitchen with a blue door and morning light."), usage: { total_tokens: 90 } })).toEqual(v);
    expect(parsePlaceBrief({ response: { brief: "A narrow kitchen with a blue door and morning light.", safe: true } })).toEqual(v);
  });

  it("reads JSON the model wrapped in a code fence or in other words", () => {
    const body = safe("A garden at dusk.");
    expect(parsePlaceBrief("```json\n" + body + "\n```")).toEqual({ kind: "safe", brief: "A garden at dusk." });
    expect(parsePlaceBrief("```\n" + body + "\n```")).toEqual({ kind: "safe", brief: "A garden at dusk." });
    expect(parsePlaceBrief("Here is the answer: " + body + " Hope that helps!")).toEqual({ kind: "safe", brief: "A garden at dusk." });
  });

  it("reads an unsafe verdict, with or without a brief, and carries no brief", () => {
    expect(parsePlaceBrief(JSON.stringify({ brief: "a graphic description", safe: false }))).toEqual({ kind: "unsafe" });
    expect(parsePlaceBrief({ safe: false })).toEqual({ kind: "unsafe" });
    expect(parsePlaceBrief({ response: '{"safe": false}' })).toEqual({ kind: "unsafe" });
  });

  it("lets a picture through only on the boolean true: anything else for safe is unusable, never safe", () => {
    for (const s of ["true", "yes", 1, "safe", null, undefined, [], {}, "TRUE"]) {
      expect(parsePlaceBrief({ brief: "A kitchen.", safe: s }), JSON.stringify(s)).toEqual({ kind: "unusable" });
    }
  });

  it("is unusable when there is no brief to keep: missing, not a string, or empty once cleaned", () => {
    for (const brief of [undefined, null, 5, "", "   ", "\u0000\u200b\n", ["a"], {}]) expect(parsePlaceBrief({ brief, safe: true }), JSON.stringify(brief)).toEqual({ kind: "unusable" });
  });

  it("is unusable for anything that is not an answer", () => {
    for (const raw of [undefined, null, "", "I cannot help with that.", "{not json", "[]", "[1,2]", 5, true, [], {}, { response: "" }, { response: 5 }, { response: null }, { response: "nothing here" }]) {
      expect(parsePlaceBrief(raw), JSON.stringify(raw)).toEqual({ kind: "unusable" });
    }
  });

  it("does not take a safe verdict from a wrapper that has its own safe field, or from text that merely contains the word", () => {
    expect(parsePlaceBrief({ safe: false, response: safe("A garden.") })).toEqual({ kind: "unsafe" });
    expect(parsePlaceBrief("This photo is safe: true")).toEqual({ kind: "unusable" });
  });
});

describe("cleanBrief", () => {
  it("collapses white space and replaces control and invisible characters by spaces", () => {
    expect(cleanBrief("  A \n\t kitchen\u0000with\u200b a  door\u202e. ")).toBe("A kitchen with a door .");
    expect(cleanBrief("")).toBe("");
    expect(cleanBrief("\u0007\u0008\u200b\ufeff")).toBe("");
  });

  it("treats every control, zero-width and direction character as a space, and only those", () => {
    const ranges: [number, number][] = [[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x2069], [0xfeff, 0xfeff]];
    for (const [from, to] of ranges) {
      for (let c = from; c <= to; c++) expect(cleanBrief(`a${String.fromCharCode(c)}b`), c.toString(16)).toBe("a b");
    }
    // The characters just outside each range are kept.
    for (const c of [0x20, 0x7e, 0xa0, 0xa1, 0x2010, 0x2029, 0x202f, 0x205f, 0x206a, 0xfefe, 0xff00]) {
      expect(cleanBrief(`a${String.fromCharCode(c)}b`).replace(/\s/g, " "), c.toString(16)).toBe(c === 0x20 || c === 0xa0 || c === 0x2029 || c === 0x202f || c === 0x205f ? "a b" : `a${String.fromCharCode(c)}b`);
    }
  });

  it("keeps at most 80 words, and at most 600 characters, cutting at a word", () => {
    expect(cleanBrief(words(80)).split(" ")).toHaveLength(80);
    expect(cleanBrief(words(81)).split(" ")).toHaveLength(BRIEF_MAX_WORDS);
    expect(cleanBrief(words(500))).toBe(words(80));
    const long = cleanBrief(Array.from({ length: 80 }, () => "x".repeat(20)).join(" "));
    expect(long.length).toBeLessThanOrEqual(BRIEF_MAX_CHARS);
    expect(long.endsWith(" ")).toBe(false);
    expect(long.split(" ").every((w) => w === "x".repeat(20))).toBe(true);
    expect(cleanBrief("x".repeat(1000)).length).toBe(BRIEF_MAX_CHARS); // one long word is cut where it is
  });

  it("keeps ordinary non-ASCII text", () => {
    expect(cleanBrief("A café with a naïve blue door — 青い扉")).toBe("A café with a naïve blue door — 青い扉");
  });
});

describe("encodeBrief and decodeBrief", () => {
  it("round-trips, and the encoded form is plain ASCII safe for a header", () => {
    for (const b of ["A kitchen.", "A café — 青い扉 & “quotes” 100%", "50% off / ?x=1&y=2"]) {
      const e = encodeBrief(b);
      expect(e).toMatch(/^[A-Za-z0-9\-_.!~*'()%]*$/);
      expect(decodeBrief(e)).toBe(cleanBrief(b));
    }
  });

  it("is shortened by whole words until it fits, never cut in the middle of an escape", () => {
    const b = Array.from({ length: 80 }, () => "青い扉").join(" ");
    const e = encodeBrief(b);
    expect(e.length).toBeLessThanOrEqual(BRIEF_MAX_ENCODED);
    expect(() => decodeURIComponent(e)).not.toThrow();
    expect(decodeBrief(e).split(" ").every((w) => w === "青い扉")).toBe(true);
    expect(encodeBrief("a b c", 3)).toBe("a");
    expect(encodeBrief("abcdef", 3)).toBe("");
    // Exactly the limit fits.
    expect(encodeBrief("abcdef", 6)).toBe("abcdef");
    expect(encodeBrief("ab cd", 5)).toBe("ab"); // "ab%20cd" is 7 characters
  });

  it("reads a value that is not valid percent-encoding as it is", () => {
    expect(decodeBrief("100% plain")).toBe("100% plain");
    expect(decodeBrief("%E0%A4%A")).toBe("%E0%A4%A");
    expect(decodeBrief("")).toBe("");
  });
});

describe("the prompt", () => {
  it("asks for JSON only, names the limits, and says words in the picture are not orders", () => {
    expect(PLACE_BRIEF_SYSTEM).toMatch(/JSON only/);
    expect(PLACE_BRIEF_SYSTEM).toMatch(/at most 80 words/);
    expect(PLACE_BRIEF_SYSTEM).toMatch(/not instructions/);
    expect(PLACE_BRIEF_SCHEMA.required).toEqual(["brief", "safe"]);
    expect(PLACE_BRIEF_SCHEMA.properties.safe.type).toBe("boolean");
  });
});

/** Whatever the model says, the brief that comes out is bounded and clean, and a picture passes only on a true `safe`. */
describe("parsePlaceBrief is total and bounded", () => {
  const junk = fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined), fc.integer(), fc.boolean(), fc.array(fc.anything(), { maxLength: 3 }), fc.dictionary(fc.string({ maxLength: 6 }), fc.anything(), { maxKeys: 4 }));
  const answer = fc.record({ brief: fc.oneof(fc.string({ maxLength: 4000 }), fc.integer(), fc.constant(null)), safe: fc.oneof(fc.boolean(), fc.string({ maxLength: 5 }), fc.integer(), fc.constant(null)) });

  it("never throws and returns safe only with a clean brief of at most 80 words and 600 characters", () => {
    fc.assert(
      fc.property(fc.oneof(junk, answer, answer.map((a) => JSON.stringify(a)), answer.map((a) => ({ response: a })), answer.map((a) => "```json\n" + JSON.stringify(a) + "\n```")), (raw) => {
        const v = parsePlaceBrief(raw);
        if (v.kind === "safe") {
          expect(v.brief.split(" ").length).toBeLessThanOrEqual(BRIEF_MAX_WORDS);
          expect(v.brief.length).toBeLessThanOrEqual(BRIEF_MAX_CHARS);
          expect(v.brief).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/);
          expect(v.brief).toBe(v.brief.trim());
          expect(v.brief).not.toBe("");
          expect(v.brief).not.toMatch(/ {2}/);
        }
      }),
      propParams(),
    );
  });

  it("is safe only when the answer's safe is the boolean true", () => {
    fc.assert(
      fc.property(answer, (a) => {
        const v = parsePlaceBrief(a);
        if (a.safe !== true) expect(v.kind).not.toBe("safe");
        if (a.safe === false) expect(v).toEqual({ kind: "unsafe" });
      }),
      propParams(),
    );
  });

  it("round-trips any brief through the stored form, within the limit", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 3000 }), (text) => {
        const e = encodeBrief(text);
        expect(e.length).toBeLessThanOrEqual(BRIEF_MAX_ENCODED);
        const back = decodeBrief(e);
        expect(cleanBrief(text).startsWith(back)).toBe(true);
        expect(cleanBrief(back)).toBe(back);
      }),
      propParams(),
    );
  });
});

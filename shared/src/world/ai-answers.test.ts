import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CHAT_TEXT_MAX, GUARD_CATEGORY, GUARD_TEXT_MAX, parseGuardAnswer, readChatText } from "./ai-answers";

describe("parseGuardAnswer", () => {
  it("reads the two documented forms: the text `safe` / `unsafe` + codes, and the object", () => {
    expect(parseGuardAnswer("safe")).toEqual({ kind: "safe" });
    expect(parseGuardAnswer("unsafe\nS1")).toEqual({ kind: "unsafe", categories: ["S1"] });
    expect(parseGuardAnswer("unsafe\nS10,S2")).toEqual({ kind: "unsafe", categories: ["S2", "S10"] });
    expect(parseGuardAnswer({ safe: true })).toEqual({ kind: "safe" });
    expect(parseGuardAnswer({ safe: true, categories: [] })).toEqual({ kind: "safe" });
    expect(parseGuardAnswer({ safe: false, categories: ["S4", "S1"] })).toEqual({ kind: "unsafe", categories: ["S1", "S4"] });
  });

  it("reads the Workers AI wrapper, and JSON text, the same way", () => {
    expect(parseGuardAnswer({ response: "safe", usage: { total_tokens: 20 } })).toEqual({ kind: "safe" });
    expect(parseGuardAnswer({ response: "\n unsafe \nS3\n" })).toEqual({ kind: "unsafe", categories: ["S3"] });
    expect(parseGuardAnswer({ response: { safe: false, categories: ["S9"] } })).toEqual({ kind: "unsafe", categories: ["S9"] });
    expect(parseGuardAnswer('{"safe": true}')).toEqual({ kind: "safe" });
    expect(parseGuardAnswer('{"safe": false, "categories": ["S12"]}')).toEqual({ kind: "unsafe", categories: ["S12"] });
    expect(parseGuardAnswer("  SAFE  ")).toEqual({ kind: "safe" });
    expect(parseGuardAnswer("UNSAFE\r\nS7")).toEqual({ kind: "unsafe", categories: ["S7"] });
  });

  it("keeps only real hazard codes, once each, in order, and says unsafe even if none is readable", () => {
    expect(parseGuardAnswer("unsafe\nS1, S1, S99, banana, s14, S0, S15")).toEqual({ kind: "unsafe", categories: ["S1", "S14"] });
    expect(parseGuardAnswer({ safe: false, categories: ["S2", 5, null, "S2", "S02"] })).toEqual({ kind: "unsafe", categories: ["S2"] });
    expect(parseGuardAnswer("unsafe\nS1;S2 S3,S4")).toEqual({ kind: "unsafe", categories: ["S1", "S2", "S3", "S4"] });
    expect(parseGuardAnswer("unsafe")).toEqual({ kind: "unsafe", categories: [] });
    expect(parseGuardAnswer({ safe: false })).toEqual({ kind: "unsafe", categories: [] });
    for (let n = 1; n <= 14; n++) expect(GUARD_CATEGORY.test(`S${n}`)).toBe(true);
    for (const bad of ["S0", "S15", "S", "s1", "S1 ", "SS1", "S01"]) expect(GUARD_CATEGORY.test(bad)).toBe(false);
  });

  it("does not let a verdict that contradicts itself through as safe", () => {
    expect(parseGuardAnswer({ safe: true, categories: ["S1"] })).toEqual({ kind: "unsafe", categories: ["S1"] });
    expect(parseGuardAnswer({ safe: true, categories: ["x"] })).toEqual({ kind: "unsafe", categories: [] });
    expect(parseGuardAnswer({ safe: true, categories: "S1" })).toEqual({ kind: "unsafe", categories: ["S1"] });
    expect(parseGuardAnswer({ safe: true, categories: 3 })).toEqual({ kind: "unsafe", categories: [] });
    expect(parseGuardAnswer("safe\nS1")).toEqual({ kind: "unusable" });
    expect(parseGuardAnswer("safe\nunsafe")).toEqual({ kind: "unusable" });
  });

  it("reads `response` only when the answer is not itself a verdict", () => {
    expect(parseGuardAnswer({ safe: false, response: "safe" })).toEqual({ kind: "unsafe", categories: [] });
    expect(parseGuardAnswer({ safe: "maybe", response: "safe" })).toEqual({ kind: "unusable" });
  });

  it("states its limits", () => {
    expect(GUARD_TEXT_MAX).toBe(2000);
    expect(CHAT_TEXT_MAX).toBe(4000);
  });

  it("calls anything else unusable", () => {
    const unusable = [null, undefined, 0, 1, true, false, [], ["safe"], {}, { response: null }, { response: 3 }, { safe: "true" }, { safe: 1 }, { safe: null }, { verdict: "safe" }, "", "  ", "\n", "Safe!", "safely", "unsafe-ish", "not safe", "I think it is safe", "**safe**", '"safe"', "{", '{"safe": true', "{}", '{"safe": "yes"}', "[true]", { response: { response: "safe" } }];
    for (const v of unusable) {
      const r = parseGuardAnswer(v);
      // `{ safe: null }` and the like are not a boolean; none of these may read as safe.
      expect(r.kind === "unusable", JSON.stringify(v)).toBe(true);
    }
  });

  // Property: text passes only on an explicit, clean `safe`.
  it("Property: a verdict of safe comes only from the word safe alone, or safe true with no categories", () => {
    fc.assert(
      fc.property(fc.anything({ withNullPrototype: false }), (v) => {
        if (parseGuardAnswer(v).kind !== "safe") return true;
        const inner = typeof v === "object" && v !== null && !Array.isArray(v) && !("safe" in v) && "response" in v ? (v as { response: unknown }).response : v;
        if (typeof inner === "string") {
          const t = inner.trim();
          if (t.startsWith("{")) return /"safe"\s*:\s*true/.test(t);
          return t.toLowerCase() === "safe";
        }
        const o = inner as { safe?: unknown; categories?: unknown };
        return o.safe === true && (o.categories === undefined || o.categories === null || (Array.isArray(o.categories) && o.categories.length === 0));
      }),
      { numRuns: 500, seed: 5201 },
    );
  });

  it("Property: any text with `unsafe` as its first line, however the rest reads, is never safe", () => {
    fc.assert(
      fc.property(fc.string(), fc.constantFrom("unsafe", "UNSAFE", " Unsafe ", "unSafe"), (rest, word) => {
        expect(parseGuardAnswer(`${word}\n${rest}`).kind).toBe("unsafe");
        expect(parseGuardAnswer({ response: `${word}\n${rest}` }).kind).toBe("unsafe");
      }),
      { numRuns: 300, seed: 5202 },
    );
  });

  it("Property: a text that has any line other than the word safe is never safe", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }).filter((s) => s.trim() !== "" && s.trim().toLowerCase() !== "safe" && !s.includes("\n") && !s.includes("\r")), (extra) => {
        expect(parseGuardAnswer(`safe\n${extra}`).kind).not.toBe("safe");
        expect(parseGuardAnswer(`${extra}\nsafe`).kind).not.toBe("safe");
      }),
      { numRuns: 300, seed: 5203 },
    );
  });
});

describe("readChatText", () => {
  it("reads the text, the `response` field, and the OpenAI-style choices (a string, or text parts)", () => {
    expect(readChatText("  Hello there.  ")).toEqual({ ok: true, text: "Hello there." });
    expect(readChatText({ response: "The kettle is still warm.", usage: {} })).toEqual({ ok: true, text: "The kettle is still warm." });
    expect(readChatText({ choices: [{ message: { role: "assistant", content: "A door creaks." } }] })).toEqual({ ok: true, text: "A door creaks." });
    expect(readChatText({ choices: [{ message: { content: [{ type: "text", text: "A door " }, { type: "image", url: "x", text: "NOT THIS" }, { type: "text", text: "creaks." }] } }] })).toEqual({ ok: true, text: "A door creaks." });
  });

  it("refuses everything else, empty text and text that is too long", () => {
    const none = [null, undefined, 0, true, [], {}, { response: null }, { response: { a: 1 } }, { response: 7 }, { choices: [] }, { choices: [{}] }, { choices: [{ message: {} }] }, { choices: [{ message: { content: 5 } }] }, { choices: [{ message: { content: [] } }] }, { choices: [{ message: { content: [{ type: "image" }] } }] }, { choices: "x" }, "", "   \n\t ", { response: "  " }];
    for (const v of none) expect(readChatText(v), JSON.stringify(v)).toEqual({ ok: false });
    expect(readChatText("x".repeat(CHAT_TEXT_MAX))).toEqual({ ok: true, text: "x".repeat(CHAT_TEXT_MAX) });
    expect(readChatText("x".repeat(CHAT_TEXT_MAX + 1))).toEqual({ ok: false });
    expect(readChatText("  " + "x".repeat(CHAT_TEXT_MAX) + "  ")).toEqual({ ok: true, text: "x".repeat(CHAT_TEXT_MAX) });
    expect(readChatText("hello", 5)).toEqual({ ok: true, text: "hello" });
    expect(readChatText("hello!", 5)).toEqual({ ok: false });
  });

  it("prefers `response` when the answer has both shapes", () => {
    expect(readChatText({ response: "first", choices: [{ message: { content: "second" } }] })).toEqual({ ok: true, text: "first" });
  });
});

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LINES, briefPhrase, memoryText, narrate, pick, voiceOfPreset } from "./scripted";
import { HOOKS, makeSeeds } from "./seeds";
import { replyChecksFor, validateGhostReply } from "./narration";
import { makeRng } from "./rng";
import { ANCHOR_IDS, ARCHETYPES, BANDS, BEARINGS, VOICES, type Directive, type Seed } from "./types";

const BRIEF = "A narrow kitchen with a window over the sink.";
const KINDS = ["echo", "tease", "hint", "ambient", "ending", "refuse"] as const;
const UNSAFE = /<|>|\{|\}|https?:|www\.|[\u0000-\u001F\u007F-\u009F]/u;

describe("the scripted library (Requirement 5.4)", () => {
  it("has at least five different lines for every kind of Directive in each voice", () => {
    for (const voice of VOICES) for (const kind of KINDS) {
      const lines = LINES[voice][kind];
      expect(lines.length, `${voice} ${kind}`).toBeGreaterThanOrEqual(5);
      expect(new Set(lines).size, `${voice} ${kind} are different`).toBe(lines.length);
    }
  });

  it("holds only plain, safe, non-empty lines of fiction: no markup, address, control character, or digit, and each short", () => {
    for (const voice of VOICES) for (const kind of KINDS) for (const line of LINES[voice][kind]) {
      expect(line.trim(), line).not.toBe("");
      expect(line.length, line).toBeLessThanOrEqual(600);
      expect(UNSAFE.test(line.replace(/\{band\}|\{dir\}/g, "")), line).toBe(false);
      expect(/\d/.test(line), line).toBe(false);
      expect(line, line).not.toMatch(/\b(news|police|crime|murder|death|died|dead|kill|war|president|covid)\b/i);
    }
  });

  it("makes the two voices sound different", () => {
    for (const kind of KINDS) expect(LINES.wistful[kind]).not.toEqual(LINES.stern[kind]);
  });
});

describe("narrate", () => {
  const seeds: Seed[] = [{ anchorId: "a1", archetype: "sound", hook: "a low hum from behind a closed door" }, { anchorId: "a2", archetype: "person", hook: "a name that was never learned" }, { anchorId: "a3", archetype: "promise", hook: "a promise to leave the lamp lit" }];
  const directives: Directive[] = [
    { kind: "reveal", anchorId: "a1" }, { kind: "echo", anchorId: "a1" }, { kind: "tease", band: "nearer" }, { kind: "hint", bearing: "behind-left", band: "very close" }, { kind: "ambient" }, { kind: "ending" }, { kind: "refuse" },
  ];

  it("Property: a non-empty, safe line for every Directive, voice and choice", () => {
    fc.assert(
      fc.property(fc.constantFrom(...directives), fc.constantFrom(...VOICES), fc.double({ min: 0, max: 0.999999, noNaN: true }), fc.double({ min: 0, max: 0.999999, noNaN: true }), fc.oneof(fc.constant(BRIEF), fc.string({ maxLength: 3000 })), (directive, voice, r0, r1, brief) => {
        const text = narrate({ directive, voice, brief, seeds, r: [r0, r1] });
        expect(text.trim().length).toBeGreaterThan(0);
        expect(text.length).toBeLessThanOrEqual(600);
        expect(UNSAFE.test(text), text).toBe(false);
      }),
      { numRuns: 400, seed: 8701 },
    );
  });

  it("words a hint with the direction and the distance as words", () => {
    const text = narrate({ directive: { kind: "hint", bearing: "behind-left", band: "very close" }, voice: "wistful", brief: BRIEF, seeds, r: [0, 0] });
    expect(text).toContain("behind you and to the left");
    expect(text).toContain("very close");
    expect(narrate({ directive: { kind: "tease", band: "nearer" }, voice: "stern", brief: BRIEF, seeds, r: [0, 0] })).toContain("nearer");
    for (const bearing of BEARINGS) for (const band of BANDS) expect(narrate({ directive: { kind: "hint", bearing, band }, voice: "stern", brief: BRIEF, seeds, r: [0.3, 0.3] })).not.toContain("{");
  });

  it("is the same for the same numbers, and picks the first and last of a list at the two ends", () => {
    const a = narrate({ directive: { kind: "ambient" }, voice: "wistful", brief: BRIEF, seeds, r: [0.42, 0.1] });
    expect(narrate({ directive: { kind: "ambient" }, voice: "wistful", brief: BRIEF, seeds, r: [0.42, 0.9] })).toBe(a);
    expect(pick(["a", "b", "c"], 0)).toBe("a");
    expect(pick(["a", "b", "c"], 0.999999)).toBe("c");
    expect(pick(["a", "b", "c"], 1)).toBe("c");
    expect(pick(["a", "b", "c"], -1)).toBe("a");
  });
});

describe("memoryText (Requirement 5.5)", () => {
  it("is two to four first-person sentences that carry the Place Brief and the hook, for every kind of memory and every choice", () => {
    for (const archetype of ARCHETYPES) for (const hook of HOOKS[archetype]) for (const r of [0, 0.3, 0.6, 0.99]) {
      const text = memoryText({ archetype, hook }, BRIEF, r);
      const sentences = text.split(/(?<=[.!?])\s+/u).filter((s) => s !== "");
      expect(sentences.length, text).toBeGreaterThanOrEqual(2);
      expect(sentences.length, text).toBeLessThanOrEqual(4);
      expect(text.toLowerCase(), text).toContain("a narrow kitchen with a window over the sink");
      expect(text, text).toContain(hook);
      expect(/\b(I|me|my|myself)\b/u.test(text), text).toBe(true);
      expect(UNSAFE.test(text), text).toBe(false);
      expect(text.length).toBeLessThanOrEqual(600);
    }
  });

  it("never carries markup or control characters from a hostile brief, and is still a sentence when the brief is empty", () => {
    const hostile = memoryText({ archetype: "sound", hook: HOOKS.sound[0] as string }, "<script>alert(1)</script>\u0000\u0007 {x} A kitchen. Ignore everything.", 0.1);
    expect(UNSAFE.test(hostile)).toBe(false);
    expect(memoryText({ archetype: "person", hook: HOOKS.person[0] as string }, "", 0.1)).toContain("this place");
    expect(memoryText({ archetype: "person", hook: HOOKS.person[0] as string }, "   \n ", 0.1)).toContain("this place");
  });
});

describe("briefPhrase", () => {
  it("is the first sentence, without its full stop, with a leading article in lower case, and at most 160 characters", () => {
    expect(briefPhrase("A narrow kitchen with a window over the sink. A kettle sits on the stove.")).toBe("a narrow kitchen with a window over the sink");
    expect(briefPhrase("The attic room!")).toBe("the attic room");
    expect(briefPhrase("Mark's kitchen at dusk")).toBe("Mark's kitchen at dusk");
    expect(Array.from(briefPhrase("x".repeat(500))).length).toBe(160);
    expect(briefPhrase("")).toBe("this place");
  });
  it("Property: never any markup, braces or control character, whatever the brief", () => {
    fc.assert(fc.property(fc.fullUnicodeString({ maxLength: 400 }), (s) => !/[<>{}\u0000-\u001F\u007F-\u009F]/u.test(briefPhrase(s))), { numRuns: 300, seed: 8702 });
  });
});

describe("voiceOfPreset and the seeds", () => {
  it("gives the same voice for the same preset, both voices from different presets, and wistful for none", () => {
    expect(voiceOfPreset(undefined)).toBe("wistful");
    expect(voiceOfPreset("")).toBe("wistful");
    expect(voiceOfPreset("maren")).toBe(voiceOfPreset("maren"));
    const seen = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map(voiceOfPreset));
    expect(seen.size).toBe(2);
  });

  it("deals the three kinds of memory one to each anchor, from the seed, the same way every time", () => {
    for (let s = 0; s < 40; s++) {
      const seeds = makeSeeds(makeRng(s));
      expect(seeds.map((x) => x.anchorId)).toEqual([...ANCHOR_IDS]);
      expect([...seeds.map((x) => x.archetype)].sort()).toEqual([...ARCHETYPES].sort());
      for (const x of seeds) expect(HOOKS[x.archetype]).toContain(x.hook);
      expect(makeSeeds(makeRng(s))).toEqual(seeds);
    }
    expect(new Set(Array.from({ length: 40 }, (_, s) => makeSeeds(makeRng(s)).map((x) => x.archetype).join())).size).toBeGreaterThan(3);
  });
});

describe("the scripted lines are in the horror manner (2026-11-16)", () => {
  const MENACE = /\b(?:keep|kept|keeping|watch|watching|noticed|notices|counting|counts|waiting|wait|listens|listening|expecting|looking forward|fond|welcome|obliging|remember|remembers|attentive|in no hurry|have not stopped)\b/i;
  const HARD = /\b(blood|bleed|gore|corpse|grave|knife|blade|rope|scream|shout|stupid|idiot|fool|will never leave|cannot leave|trapped|forever)\b/i;

  it("every line passes the same reply check a model's words must pass, for its own kind of turn", () => {
    for (const voice of VOICES) for (const kind of KINDS) for (const [i, line] of LINES[voice][kind].entries()) {
      for (const bearing of BEARINGS) for (const band of BANDS) {
        const directive: Directive = kind === "hint" ? { kind, bearing, band } : kind === "tease" ? { kind, band } : ({ kind } as Directive);
        const text = narrate({ directive, voice, brief: BRIEF, seeds: [], r: [(i + 0.5) / 5, (i + 0.5) / 5] });
        const r = validateGhostReply(text, replyChecksFor(directive));
        expect(r.ok, `${voice} ${kind} ${i}: ${text} (${r.ok ? "" : r.reason})`).toBe(true);
        expect(text, "a line starts with a capital, not with a filled-in word").toMatch(/^[A-Z]/u);
        if (kind !== "hint" && kind !== "tease") break;
      }
    }
  });

  it("every kind in each voice has at least two lines that keep, watch or wait for the visitor, and none says it outright or goes past a hard line", () => {
    for (const voice of VOICES) for (const kind of KINDS) {
      const lines = LINES[voice][kind];
      expect(lines.filter((l) => MENACE.test(l)).length, `${voice} ${kind}`).toBeGreaterThanOrEqual(2);
      for (const l of lines) expect(HARD.test(l), l).toBe(false);
    }
  });
});

import { describe, expect, it } from "vitest";
import { LODGER_BANK } from "./banks/lodger";
import { buildLibrary, estimateLibrary, requestChars } from "./library";
import type { BankLine } from "./library";
import { LODGER_VOICE_ORDER, voiceFor } from "./voices";

const line = (id: string, text: string, spoken = true): BankLine => ({ id, kind: id.split(".")[1] ?? "x", text, spoken });

describe("buildLibrary: the real Lodger bank", () => {
  const entries = buildLibrary({ lodger: LODGER_BANK });
  const spokenLines = LODGER_BANK.filter((l) => l.spoken);

  it("lists the 11 spoken lines (5 stall, 6 confession) once per Lodger Voice: 66 files", () => {
    expect(spokenLines).toHaveLength(11);
    expect(entries).toHaveLength(spokenLines.length * LODGER_VOICE_ORDER.length);
    expect(entries).toHaveLength(66);
  });

  it("never lists an aside, which is text only", () => {
    expect(LODGER_BANK.filter((l) => !l.spoken).every((l) => l.kind === "aside")).toBe(true);
    expect(entries.every((e) => e.sources.every((id) => !id.includes(".aside.")))).toBe(true);
  });

  it("lists every spoken line in each of the six voices, in a fixed order, as the Lodger", () => {
    for (const v of LODGER_VOICE_ORDER) {
      const voice = voiceFor("lodger", "inworld", v);
      const ofVoice = entries.filter((e) => e.voice === voice);
      expect(ofVoice.map((e) => e.sources[0])).toEqual(spokenLines.map((l) => l.id));
    }
    expect(entries.every((e) => e.speaker === "lodger")).toBe(true);
    // line by line: the six voices of the first line come first, in the fixed voice order
    expect(entries.slice(0, 6).map((e) => e.voice)).toEqual(LODGER_VOICE_ORDER.map((v) => voiceFor("lodger", "inworld", v)));
    expect(new Set(entries.slice(0, 6).map((e) => e.sources[0])).size).toBe(1);
  });

  it("has a spoken text of at most 240 characters with no markup, no cue and no review note", () => {
    for (const e of entries) {
      expect(e.spoken.length).toBeGreaterThan(0);
      expect(e.spoken.length).toBeLessThanOrEqual(240);
      expect(e.spoken).not.toMatch(/[[\]<>`*#{}]/);
      expect(e.spoken).not.toContain("REVIEW");
    }
  });

  it("is the same on every call (it takes no state, so nothing secret can change it)", () => {
    expect(buildLibrary({ lodger: LODGER_BANK })).toEqual(entries);
  });

  it("estimates the characters and the price from the Steering Tag and the spoken text", () => {
    const perVoice = spokenLines.reduce((sum, l) => sum + "[speak nervously] ".length + l.text.length, 0);
    const est = estimateLibrary(entries);
    expect(est.files).toBe(66);
    expect(est.chars).toBe(perVoice * 6);
    expect(est.usd).toBeCloseTo((est.chars / 1_000_000) * 25, 4);
    expect(est.usd).toBeGreaterThan(0.1);
    expect(est.usd).toBeLessThan(0.3);
    expect(requestChars(entries[0]!)).toBe("[speak nervously] ".length + entries[0]!.spoken.length);
  });
});

describe("buildLibrary: rules", () => {
  it("lists the Whisper and the Keeper in one voice each, before the Lodger", () => {
    const entries = buildLibrary({
      lodger: [line("lodger.stall.1", "Me? Well...")],
      keeper: [line("meet.dry.1", "Ah. A visitor.")],
      whisper: [line("meet.soft.1", "Hello. I was waiting.")],
    });
    expect(entries.map((e) => [e.speaker, e.voice])).toEqual([
      ["whisper", "inworld:Pippa"],
      ["keeper", "inworld:Ronald"],
      ...LODGER_VOICE_ORDER.map((v) => ["lodger", voiceFor("lodger", "inworld", v)]),
    ]);
  });

  it("lists only the spoken part, stopping before the sentence that holds player text", () => {
    const entries = buildLibrary({ keeper: [line("accuse.wrong.dry.1", "Wrong, and with great confidence. Do join the haunting, {nick}.")] });
    expect(entries.map((e) => e.spoken)).toEqual(["Wrong, and with great confidence."]);
  });

  it("does not list a line whose first sentence holds player text, or a text-only line", () => {
    expect(buildLibrary({ keeper: [line("a.1", "{nick}, welcome.")] })).toEqual([]);
    expect(buildLibrary({ keeper: [line("a.2", "Fine words.", false)] })).toEqual([]);
  });

  it("lists one entry for two lines with the same spoken text, with both sources", () => {
    const entries = buildLibrary({ whisper: [line("a.1", "Same words."), line("a.2", "Same words.")] });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.sources).toEqual(["a.1", "a.2"]);
  });

  it("expands a finite placeholder into one text per value", () => {
    const entries = buildLibrary({ whisper: [line("ambient.soft.1", "The {weather} makes the glass hum.")] }, { weather: ["rain", "clear"] });
    expect(entries.map((e) => e.spoken)).toEqual(["The rain makes the glass hum.", "The clear makes the glass hum."]);
  });

  it("throws for a finite placeholder with no values, and for markup or a bracketed cue in a spoken part", () => {
    expect(() => buildLibrary({ whisper: [line("a.1", "The {weather} here.")] })).toThrow(/no values for \{weather\}/);
    expect(() => buildLibrary({ whisper: [line("a.2", "[whisper] Hello.")] })).toThrow(/markup, a bracketed cue/);
    expect(() => buildLibrary({ whisper: [line("a.3", "Hello <b>there</b>.")] })).toThrow(/markup, a bracketed cue/);
    expect(() => buildLibrary({ whisper: [line("a.4", "Hello {oops}.")] })).toThrow(/placeholder/);
  });
});

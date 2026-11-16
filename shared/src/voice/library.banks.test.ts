import { describe, expect, it } from "vitest";
import { SCRIPTED_BANKS } from "./banks";
import { GHOST_KEEPER_BANK, GHOST_WHISPER_BANK } from "./banks/ghost";
import { PARTY_KEEPER_BANK, PARTY_WHISPER_BANK } from "./banks/party";
import { buildLibrary, estimateLibrary } from "./library";
import { FINITE_VALUES } from "./placeholders";
import { MAX_SPOKEN_CHARS, PLAYER_PLACEHOLDERS, spokenPart } from "./speakable";

/** The real Whisper, Keeper and Lodger banks, generated from docs/story/. */
describe("buildLibrary: every real bank", () => {
  const all = [...(SCRIPTED_BANKS.whisper ?? []), ...(SCRIPTED_BANKS.keeper ?? []), ...(SCRIPTED_BANKS.lodger ?? [])];
  const entries = buildLibrary(SCRIPTED_BANKS, FINITE_VALUES);

  it("has the banks the story writer produced: 72 single-player and 146 party lines, 16 Lodger lines", () => {
    expect(GHOST_WHISPER_BANK.length + GHOST_KEEPER_BANK.length).toBe(72);
    expect(PARTY_WHISPER_BANK.length + PARTY_KEEPER_BANK.length).toBe(146);
    expect(SCRIPTED_BANKS.lodger).toHaveLength(16);
    expect(all.length).toBe(72 + 146 + 16);
  });

  it("uses each id once", () => {
    expect(new Set(all.map((l) => l.id)).size).toBe(all.length);
  });

  it("lists 510 files: 66 Lodger, 214 for the Whisper (Pippa) and 230 for the Keeper (Ronald)", () => {
    expect(entries).toHaveLength(510);
    expect(entries.filter((e) => e.speaker === "lodger")).toHaveLength(66);
    expect(entries.filter((e) => e.voice === "inworld:Pippa")).toHaveLength(214);
    expect(entries.filter((e) => e.voice === "inworld:Ronald")).toHaveLength(230);
  });

  it("estimates about 51,400 characters and $1.28 for everything", () => {
    const est = estimateLibrary(entries);
    expect(est.files).toBe(510);
    expect(est.chars).toBeGreaterThan(51_000);
    expect(est.chars).toBeLessThan(52_000);
    expect(est.usd).toBeGreaterThan(1.2);
    expect(est.usd).toBeLessThan(1.3);
  });

  it("renders no text-only line: no cue, nudge, phone cue, not-you, choice prompt, haunt rise, round end, hand-over or aside", () => {
    const textOnly = new Set(all.filter((l) => !l.spoken).map((l) => l.id));
    expect(textOnly.size).toBe(54 + 5);
    for (const e of entries) for (const id of e.sources) expect(textOnly.has(id), id).toBe(false);
    for (const kind of ["cue.", "nudge.", "phone-cue.", "not-you", "haunt.choose", "haunt.rise", "round-end", "hand-over", "aside"]) {
      expect(all.filter((l) => l.kind.startsWith(kind.replace(/\.$/, "")) && l.spoken), kind).toEqual([]);
    }
  });

  it("gives every spoken line a spoken part, so no line marked spoken is silent by accident", () => {
    for (const l of all.filter((x) => x.spoken)) {
      const sources = entries.filter((e) => e.sources.includes(l.id));
      expect(sources.length, l.id).toBeGreaterThan(0);
    }
  });

  it("keeps every spoken text to 240 characters, with no markup, no placeholder, no tag and no player text", () => {
    for (const e of entries) {
      expect(e.spoken.length).toBeGreaterThan(0);
      expect(e.spoken.length).toBeLessThanOrEqual(MAX_SPOKEN_CHARS);
      expect(e.spoken).not.toMatch(/[[\]<>`*#{}]/);
      for (const p of PLAYER_PLACEHOLDERS) expect(e.spoken).not.toContain(p);
    }
  });

  it("stops before the sentence that holds a player's name: 33 spoken lines are cut", () => {
    const cut = all.filter((l) => l.spoken && PLAYER_PLACEHOLDERS.some((p) => l.text.includes(p)));
    expect(cut).toHaveLength(33);
    const turn = all.find((l) => l.id === "turn-start.dry.1");
    expect(turn?.text).toContain("{nick}");
    expect(spokenPart(turn?.text ?? "")).toBe("It is your hour. I am the soul of patience, though the house is rather less so.");
    const wrong = entries.find((e) => e.sources.includes("accuse.wrong.dry.1"));
    expect(wrong?.spoken).toBe("That does not stand, and I say so with some regret. The house keeps its secret a little longer.");
  });

  it("says the weather as an adjective in every text: \"Today it is cloudy\", never \"Today it is cloud\"", () => {
    const weather = entries.filter((e) => e.sources.includes("ambient.soft.1"));
    expect(weather.map((e) => e.spoken)).toEqual([
      "I keep a little weather by me. Today it is clear. It sits beside me and asks for nothing.",
      "I keep a little weather by me. Today it is cloudy. It sits beside me and asks for nothing.",
      "I keep a little weather by me. Today it is foggy. It sits beside me and asks for nothing.",
      "I keep a little weather by me. Today it is rainy. It sits beside me and asks for nothing.",
      "I keep a little weather by me. Today it is stormy. It sits beside me and asks for nothing.",
      "I keep a little weather by me. Today it is snowy. It sits beside me and asks for nothing.",
    ]);
    for (const e of entries) expect(e.spoken).not.toMatch(/\b(it is|out there it is) (cloud|fog|rain|storm|snow)\b/);
  });

  it("expands each hint line over 8 bearings and 3 distance bands: 24 texts a line", () => {
    for (const id of ["hint.soft.1", "hint.dry.2"]) expect(entries.filter((e) => e.sources.includes(id))).toHaveLength(24);
    expect(entries.filter((e) => e.sources.some((s) => s.startsWith("hint.")))).toHaveLength(240);
  });

  it("speaks the Whisper in Pippa and the Keeper in Ronald, as those Speakers", () => {
    for (const e of entries.filter((x) => x.sources.some((s) => s.includes(".soft.")))) expect([e.speaker, e.voice]).toEqual(["whisper", "inworld:Pippa"]);
    for (const e of entries.filter((x) => x.sources.some((s) => s.includes(".dry.")))) expect([e.speaker, e.voice]).toEqual(["keeper", "inworld:Ronald"]);
  });

  it("is the same on every call", () => {
    expect(buildLibrary(SCRIPTED_BANKS, FINITE_VALUES)).toEqual(entries);
  });
});

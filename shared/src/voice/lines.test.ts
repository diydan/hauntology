import { describe, expect, it } from "vitest";
import { VOICE_LINES_KEPT, VOICE_LINE_TTL_MS, VoiceLineSchema, findLine, keepLine, liveLines, type VoiceLine } from "./line";
import { spokenPart } from "./speakable";
import { speakerForGhostVoice, speakerForPersona } from "./voices";

const L = (id: string, createdAt: number, over: Partial<VoiceLine> = {}): VoiceLine => ({ id, kind: "narration", speaker: "whisper", text: "The kettle is warm.", spoken: "The kettle is warm.", voice: "inworld:Pippa", createdAt, ...over });
const T0 = 1_000_000;

describe("the speaker of a ghost voice", () => {
  it("is the Whisper for soft and the Keeper for dry", () => {
    expect(speakerForPersona("soft")).toBe("whisper");
    expect(speakerForPersona("dry")).toBe("keeper");
  });
  it("is the Whisper for the game's wistful ghost and the Keeper for its stern one, and never the Lodger", () => {
    expect(speakerForGhostVoice("wistful")).toBe("whisper");
    expect(speakerForGhostVoice("stern")).toBe("keeper");
    for (const odd of ["lodger", "mark", "", "WISTFUL", undefined, null]) expect(speakerForGhostVoice(odd as never)).toBe("keeper");
  });
});

describe("VoiceLineSchema", () => {
  it("accepts a line, and a Lodger line with an Aura-2 voice id", () => {
    expect(VoiceLineSchema.safeParse(L("Zm9vYmFyYmF6cXV4", T0)).success).toBe(true);
    expect(VoiceLineSchema.safeParse(L("a", T0, { speaker: "lodger", voice: "aura-2:aries", kind: "ending" })).success).toBe(true);
  });
  it("refuses a stored line that is not one: a bad id, voice, kind, speaker, text or time", () => {
    const bad: Array<[string, unknown]> = [
      ["id with a space", L("a b", T0)], ["empty id", L("", T0)], ["id over 128", L("a".repeat(129), T0)],
      ["voice with no name", L("a", T0, { voice: "inworld:" as never })], ["voice outside the two services", L("a", T0, { voice: "openai:nova" as never })],
      ["unknown kind", { ...L("a", T0), kind: "chat" }], ["unknown speaker", { ...L("a", T0), speaker: "narrator" }],
      ["empty text", L("a", T0, { text: "" })], ["huge text", L("a", T0, { text: "x".repeat(2001) })], ["spoken over 240", L("a", T0, { spoken: "x".repeat(241) })],
      ["time not a number", { ...L("a", T0), createdAt: Number.NaN }], ["missing field", { id: "a" }], ["not an object", "line"],
    ];
    for (const [name, v] of bad) expect(VoiceLineSchema.safeParse(v).success, name).toBe(false);
  });
});

describe("how many lines a game keeps, and for how long", () => {
  it("keeps 8 for ten minutes", () => {
    expect(VOICE_LINES_KEPT).toBe(8);
    expect(VOICE_LINE_TTL_MS).toBe(10 * 60 * 1000);
  });
  it("liveLines drops a line at exactly ten minutes and keeps one a millisecond younger", () => {
    const lines = [L("old", T0), L("young", T0 + 1)];
    expect(liveLines(lines, T0 + VOICE_LINE_TTL_MS - 1).map((l) => l.id)).toEqual(["old", "young"]);
    expect(liveLines(lines, T0 + VOICE_LINE_TTL_MS).map((l) => l.id)).toEqual(["young"]);
    expect(liveLines(lines, T0 + VOICE_LINE_TTL_MS + 1).map((l) => l.id)).toEqual([]);
  });
  it("liveLines of nothing is nothing, and never more than the last 8", () => {
    expect(liveLines(undefined, T0)).toEqual([]);
    const many = Array.from({ length: 12 }, (_, i) => L(`l${i}`, T0));
    expect(liveLines(many, T0).map((l) => l.id)).toEqual(["l4", "l5", "l6", "l7", "l8", "l9", "l10", "l11"]);
  });
  it("keepLine adds a line after pruning the old ones, and the ninth line pushes out the oldest", () => {
    let lines: VoiceLine[] = [];
    for (let i = 0; i < 9; i++) lines = keepLine(lines, L(`l${i}`, T0 + i), T0 + i);
    expect(lines.map((l) => l.id)).toEqual(["l1", "l2", "l3", "l4", "l5", "l6", "l7", "l8"]);
    const later = keepLine(lines, L("new", T0 + VOICE_LINE_TTL_MS + 100), T0 + VOICE_LINE_TTL_MS + 100);
    expect(later.map((l) => l.id)).toEqual(["new"]); // everything before was ten minutes old
  });
  it("keepLine starts a list from none", () => {
    expect(keepLine(undefined, L("only", T0), T0).map((l) => l.id)).toEqual(["only"]);
  });
  it("keepLine does not change the list it was given", () => {
    const lines = [L("a", T0)];
    keepLine(lines, L("b", T0), T0);
    expect(lines.map((l) => l.id)).toEqual(["a"]);
  });
  it("findLine finds a live line, and an expired line, an unknown id and no list are all the same null", () => {
    const lines = [L("a", T0), L("b", T0 + 5)];
    expect(findLine(lines, "b", T0 + 10)?.id).toBe("b");
    expect(findLine(lines, "a", T0 + VOICE_LINE_TTL_MS)).toBeNull();
    expect(findLine(lines, "zzz", T0 + 10)).toBeNull();
    expect(findLine(undefined, "a", T0)).toBeNull();
    expect(findLine([], "a", T0)).toBeNull();
  });
});

describe("spokenPart with the visitor's own words", () => {
  const TEXT = "The kettle is warm. Marguerite, you came back. I kept the window open.";
  it("is unchanged when no player text is given", () => {
    expect(spokenPart(TEXT)).toBe(TEXT);
    expect(spokenPart(TEXT, 240, [])).toBe(TEXT);
  });
  it("stops before the first sentence that holds any of it, ignoring case, and trims what it is given", () => {
    expect(spokenPart(TEXT, 240, ["MARGUERITE"])).toBe("The kettle is warm.");
    expect(spokenPart(TEXT, 240, ["  marguerite  "])).toBe("The kettle is warm.");
    expect(spokenPart(TEXT, 240, ["nobody", "window"])).toBe("The kettle is warm. Marguerite, you came back.");
  });
  it("ignores empty and blank entries, which would match every sentence", () => {
    expect(spokenPart(TEXT, 240, ["", "   "])).toBe(TEXT);
  });
  it("still stops at a placeholder, and at the length, as before", () => {
    expect(spokenPart("The kettle is warm. {nick}, hello.", 240, ["zzz"])).toBe("The kettle is warm.");
    expect(spokenPart(TEXT, 30, [])).toBe("The kettle is warm.");
  });
});

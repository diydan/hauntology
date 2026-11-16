import { describe, expect, it } from "vitest";
import { SpeakRequestSchema } from "./requests";

const ok = { playId: "p-abc_DEF-123", lineId: "Zm9vYmFyYmF6cXV4" };

describe("SpeakRequestSchema", () => {
  it("accepts a game id and a line id", () => expect(SpeakRequestSchema.safeParse(ok).success).toBe(true));
  it("refuses a body that carries text of any kind, or any field that is not listed", () => {
    for (const extra of [{ text: "say this" }, { spoken: "say this" }, { prompt: "x" }, { speaker: "whisper" }, { voice: "inworld:Pippa" }, { prefetch: true }, { roomCode: "ABCD" }, { x: 1 }]) {
      expect(SpeakRequestSchema.safeParse({ ...ok, ...extra }).success, JSON.stringify(extra)).toBe(false);
    }
  });
  it("refuses a missing or empty id, an id with a character outside A-Z a-z 0-9 _ -, and one over 128 characters", () => {
    for (const bad of [{ lineId: ok.lineId }, { playId: ok.playId }, { ...ok, playId: "" }, { ...ok, lineId: "" }, { ...ok, lineId: "a b" }, { ...ok, lineId: "a/b" }, { ...ok, playId: "a.b" }, { ...ok, lineId: "a".repeat(129) }, { ...ok, lineId: 5 }, { ...ok, playId: null }]) {
      expect(SpeakRequestSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
  it("refuses a body that is not an object", () => {
    for (const bad of [null, undefined, "x", 5, [], [ok], true]) expect(SpeakRequestSchema.safeParse(bad).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { MAX_SPOKEN_CHARS, splitSentences, spokenPart } from "./speakable";

describe("splitSentences", () => {
  it("splits at . ! ? followed by a space", () => {
    expect(splitSentences("Hello. I was waiting! Did you mind?")).toEqual(["Hello.", "I was waiting!", "Did you mind?"]);
  });

  it("does not split at an ellipsis", () => {
    expect(splitSentences("Oh, very well... it was me. I would like it noted that I was... provoked.")).toEqual([
      "Oh, very well... it was me.",
      "I would like it noted that I was... provoked.",
    ]);
    expect(splitSentences("Yes. It was me. Well... I mean... the creaking was my best work.")).toHaveLength(3);
  });

  it("keeps a trailing ellipsis in the last sentence and returns [] for empty text", () => {
    expect(splitSentences("Well... I mean...")).toEqual(["Well... I mean..."]);
    expect(splitSentences("")).toEqual([]);
    expect(splitSentences("   ")).toEqual([]);
  });

  it("treats ?! and !? as one end", () => {
    expect(splitSentences("Me?! Surely not.")).toEqual(["Me?!", "Surely not."]);
  });
});

describe("spokenPart", () => {
  it("is the whole line when it holds no player text and fits", () => {
    expect(spokenPart("Hello. I was waiting.")).toBe("Hello. I was waiting.");
  });

  it("stops before the first sentence that holds player text", () => {
    expect(spokenPart("The accusation does not stand. You are welcome among us regardless, {nick}.")).toBe("The accusation does not stand.");
    expect(spokenPart("A name in the middle, {zone}. And more after it.")).toBe("");
  });

  it("cuts at the last whole sentence that fits in 240 characters, never in the middle of one", () => {
    const long = "Word ".repeat(30).trim() + ".";
    expect(long.length).toBeGreaterThan(100);
    const text = `${long} ${long} ${long}`;
    const spoken = spokenPart(text);
    expect(spoken.length).toBeLessThanOrEqual(MAX_SPOKEN_CHARS);
    expect(text.startsWith(spoken)).toBe(true);
    expect(spoken.endsWith(".")).toBe(true);
    expect(spokenPart(`${"x".repeat(300)}.`)).toBe(""); // one sentence too long: subtitle only
  });
});

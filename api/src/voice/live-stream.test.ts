import { describe, expect, it } from "vitest";
import { validateGhostReply } from "@hauntology/shared/ghost/narration";
import { streamSentenceCheckedReply } from "./live-stream";

async function* chunks(items: string[], delayMs = 0): AsyncIterable<string> {
  for (const item of items) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    yield item;
  }
}

describe("streamSentenceCheckedReply (ghost-voice 6.4)", () => {
  it("streams good sentences in order, keeping <= 240 chars and valid assembled Subtitle", async () => {
    const emitted: Array<{ spoken: string; subtitle: string; seq: number; replaced: boolean }> = [];
    const res = await streamSentenceCheckedReply({
      idPrefix: "live-1",
      stream: chunks(["The hallway is cold. ", "Someone left the lantern burning."]),
      speaker: "whisper",
      playerText: [],
      fallbackScripted: "A cold draft stirs the dust.",
      onSentence: (e) => {
        emitted.push(e);
      },
    });

    expect(res.replaced).toBe(false);
    expect(res.timedOut).toBe(false);
    expect(emitted).toEqual([
      { spoken: "The hallway is cold.", subtitle: "The hallway is cold.", seq: 0, replaced: false },
      { spoken: "Someone left the lantern burning.", subtitle: "Someone left the lantern burning.", seq: 1, replaced: false },
    ]);
    expect(res.subtitle).toBe("The hallway is cold. Someone left the lantern burning.");
    expect(validateGhostReply(res.subtitle).ok).toBe(true);
  });

  it("replaces a failing sentence and drops the rest of the bad stream with one scripted line", async () => {
    const emitted: Array<{ spoken: string; subtitle: string; replaced: boolean }> = [];
    let consumed = 0;
    async function* badStream(): AsyncIterable<string> {
      consumed++;
      yield "The floorboards creak softly. ";
      consumed++;
      yield "Check https://evil.example/link for help. ";
      consumed++;
      yield "This remainder should never be emitted.";
    }

    const res = await streamSentenceCheckedReply({
      idPrefix: "live-bad",
      stream: badStream(),
      speaker: "keeper",
      playerText: [],
      fallbackScripted: "Nothing answers from the dark.",
      onSentence: (e) => {
        emitted.push({ spoken: e.spoken, subtitle: e.subtitle, replaced: e.replaced });
      },
    });

    expect(res.replaced).toBe(true);
    expect(consumed).toBe(2);
    expect(emitted).toEqual([
      { spoken: "The floorboards creak softly.", subtitle: "The floorboards creak softly.", replaced: false },
      { spoken: "Nothing answers from the dark.", subtitle: "Nothing answers from the dark.", replaced: true },
    ]);
    expect(res.subtitle).toBe("The floorboards creak softly. Nothing answers from the dark.");
    expect(validateGhostReply(res.subtitle).ok).toBe(true);
  });

  it("replaces a sentence containing player text or >240 chars before speaking", async () => {
    const emitted: string[] = [];
    const res = await streamSentenceCheckedReply({
      idPrefix: "live-pt",
      stream: chunks(["You mentioned Bartholomew earlier. "]),
      speaker: "whisper",
      playerText: ["Bartholomew"],
      fallbackScripted: "A shadow shifts near the stairs.",
      onSentence: (e) => {
        emitted.push(e.spoken);
      },
    });

    expect(res.replaced).toBe(true);
    expect(emitted).toEqual(["A shadow shifts near the stairs."]);
    expect(res.subtitle).toBe("A shadow shifts near the stairs.");
  });

  it("cuts off slow/stalled streams safely at chunkTimeoutMs with valid Subtitle", async () => {
    const emitted: string[] = [];
    const res = await streamSentenceCheckedReply({
      idPrefix: "live-slow",
      stream: chunks(["The dust settles slowly. ", "This arrives too late."], 60),
      speaker: "whisper",
      playerText: [],
      fallbackScripted: "Silence falls across the room.",
      chunkTimeoutMs: 25,
      onSentence: (e) => {
        emitted.push(e.spoken);
      },
    });

    expect(res.timedOut).toBe(true);
    expect(emitted).toEqual(["Silence falls across the room."]);
    expect(validateGhostReply(res.subtitle).ok).toBe(true);
  });

  it("caps assembled Subtitle to validateGhostReply limits (4 sentences max)", async () => {
    const emitted: string[] = [];
    const res = await streamSentenceCheckedReply({
      idPrefix: "live-long",
      stream: chunks(["One. ", "Two. ", "Three. ", "Four. ", "Five."]),
      speaker: "keeper",
      playerText: [],
      fallbackScripted: "Enough.",
      onSentence: (e) => {
        emitted.push(e.spoken);
      },
    });

    expect(res.replaced).toBe(true);
    expect(emitted).toEqual(["One.", "Two.", "Three.", "Four."]);
    expect(validateGhostReply(res.subtitle).ok).toBe(true);
  });
});

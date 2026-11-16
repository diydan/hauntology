import { describe, expect, it } from "vitest";
import { LODGER_VOICE_ORDER, LODGER_VOICES, SPEAKERS, SPEAKER_ORDER, lodgerVoiceFor, steeringTag, voiceFor } from "./voices";

describe("the cast (ghost-voice design, The cast and The Lodger's six voices)", () => {
  it("has three Speakers in a fixed order with the approved settings", () => {
    expect(SPEAKER_ORDER).toEqual(["whisper", "keeper", "lodger"]);
    expect(SPEAKERS.whisper).toEqual({ inworld: "Pippa", tag: "[whisper] ", rate: 0.9, temperature: 1.0, aura: "luna" });
    expect(SPEAKERS.keeper).toEqual({ inworld: "Ronald", tag: "", rate: 0.9, temperature: 0.7, aura: "zeus" });
    expect(SPEAKERS.lodger).toEqual({ inworld: "Mark", tag: "[speak nervously] ", rate: 1.1, temperature: 1.2, aura: "aries" });
  });

  it("has six Lodger Voices, each a different Inworld voice", () => {
    expect(LODGER_VOICE_ORDER).toEqual(["mark", "conrad", "arjun", "chloe", "eleanor", "victoria"]);
    const ids = LODGER_VOICE_ORDER.map((v) => LODGER_VOICES[v].inworld);
    expect(ids).toEqual(["Mark", "Conrad", "Arjun", "Chloe", "Eleanor", "Victoria"]);
    expect(new Set(ids).size).toBe(6);
  });

  it("never gives a Suspect the Whisper's or the Keeper's voice", () => {
    const ids = LODGER_VOICE_ORDER.map((v) => LODGER_VOICES[v].inworld as string);
    expect(ids).not.toContain(SPEAKERS.whisper.inworld);
    expect(ids).not.toContain(SPEAKERS.keeper.inworld);
  });
});

describe("lodgerVoiceFor", () => {
  it("is the Profile's voice, else Mark, and reads nothing else", () => {
    expect(lodgerVoiceFor({})).toBe("mark");
    expect(lodgerVoiceFor({ lodgerVoice: "victoria" })).toBe("victoria");
    expect(lodgerVoiceFor({ lodgerVoice: undefined })).toBe("mark");
  });
});

describe("voiceFor and steeringTag", () => {
  it("returns the Inworld voice of each Speaker, and of each Lodger Voice", () => {
    expect(voiceFor("whisper", "inworld")).toBe("inworld:Pippa");
    expect(voiceFor("keeper", "inworld")).toBe("inworld:Ronald");
    expect(voiceFor("lodger", "inworld")).toBe("inworld:Mark");
    expect(voiceFor("lodger", "inworld", "chloe")).toBe("inworld:Chloe");
    expect(voiceFor("lodger", "inworld", "arjun")).toBe("inworld:Arjun");
  });

  it("falls back to the Lodger's default Aura-2 speaker until Spike ghost-voice 1.1 picks one for a voice", () => {
    expect(voiceFor("whisper", "aura")).toBe("aura-2:luna");
    expect(voiceFor("lodger", "aura", "mark")).toBe("aura-2:aries");
    expect(voiceFor("lodger", "aura", "eleanor")).toBe("aura-2:aries"); // aura is null for now
  });

  it("gives the Steering Tag of the Speaker, and the Keeper has none", () => {
    expect(steeringTag("whisper")).toBe("[whisper] ");
    expect(steeringTag("keeper")).toBe("");
    expect(steeringTag("lodger")).toBe("[speak nervously] ");
  });
});

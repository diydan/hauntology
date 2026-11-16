import { describe, expect, it } from "vitest";
import { lodgerVoiceOf, speechVoices, type VoiceLine } from "./line";
import { LODGER_VOICE_ORDER, LODGER_VOICES, SPEAKERS, voiceFor, type VoiceId } from "./voices";

const line = (speaker: VoiceLine["speaker"], voice: VoiceId): Pick<VoiceLine, "speaker" | "voice"> => ({ speaker, voice });

describe("lodgerVoiceOf", () => {
  it.each(LODGER_VOICE_ORDER)("tells the %s voice from the line's voice id", (lv) => {
    expect(lodgerVoiceOf(line("lodger", `inworld:${LODGER_VOICES[lv].inworld}`))).toBe(lv);
  });
  it("is undefined for the Whisper and the Keeper, and for a Lodger voice that is not one of the six", () => {
    expect(lodgerVoiceOf(line("whisper", "inworld:Pippa"))).toBeUndefined();
    expect(lodgerVoiceOf(line("keeper", "inworld:Ronald"))).toBeUndefined();
    expect(lodgerVoiceOf(line("lodger", "inworld:Nobody"))).toBeUndefined();
    expect(lodgerVoiceOf(line("lodger", "aura-2:luna"))).toBeUndefined();
  });
});

describe("speechVoices", () => {
  it("gives the Whisper Pippa then luna, and the Keeper Ronald then zeus", () => {
    expect(speechVoices(line("whisper", "inworld:Pippa"))).toMatchObject({ inworld: "inworld:Pippa", aura: "aura-2:luna" });
    expect(speechVoices(line("keeper", "inworld:Ronald"))).toMatchObject({ inworld: "inworld:Ronald", aura: "aura-2:zeus" });
  });
  it.each(LODGER_VOICE_ORDER)("gives the Lodger's %s voice its own Inworld voice and the same Aura-2 voice voiceFor picks", (lv) => {
    const v = speechVoices(line("lodger", `inworld:${LODGER_VOICES[lv].inworld}`));
    expect(v).toEqual({ inworld: voiceFor("lodger", "inworld", lv), aura: voiceFor("lodger", "aura", lv), lodgerVoice: lv });
  });
  it("speaks a Lodger line whose voice is not in the cast as Mark", () => {
    expect(speechVoices(line("lodger", "inworld:Nobody"))).toMatchObject({ inworld: "inworld:Mark", aura: `aura-2:${SPEAKERS.lodger.aura}` });
  });
  it("never lets a line pick another Speaker's voice or one outside the cast", () => {
    expect(speechVoices(line("whisper", "inworld:Ronald")).inworld).toBe("inworld:Pippa");
    expect(speechVoices(line("keeper", "inworld:Pippa")).inworld).toBe("inworld:Ronald");
    expect(speechVoices(line("whisper", "inworld:Mallory" as VoiceId)).inworld).toBe("inworld:Pippa");
    expect(speechVoices(line("keeper", "aura-2:aries")).aura).toBe("aura-2:zeus");
  });
});

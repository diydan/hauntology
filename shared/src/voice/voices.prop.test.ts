import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { speechVoices, type VoiceLine } from "./line";
import { toVoiceLine } from "./to-line";
import { SPEAKERS, SPEAKER_ORDER, steeringTag, voiceFor, type Speaker } from "./voices";

describe("Property 13: Every line has one Speaker, and a Steering Tag stays in the Inworld request", () => {
  // Feature: ghost-voice, Property 13: Every line has one Speaker, and a Steering Tag stays in the Inworld request
  // Validates: Requirements 1.6, 1.7, 1.11
  it("the synthesis voices always come from the Speaker's cast entry, whatever voice a line names", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SPEAKER_ORDER),
        fc.string({ maxLength: 40 }),
        (speaker: Speaker, named) => {
          const line: Pick<VoiceLine, "speaker" | "voice"> = { speaker, voice: named as VoiceLine["voice"] };
          const got = speechVoices(line);
          const lodger = got.lodgerVoice;
          return (
            got.inworld === voiceFor(speaker, "inworld", lodger) &&
            got.aura === voiceFor(speaker, "aura", lodger) &&
            (speaker === "lodger" || lodger === undefined)
          );
        },
      ),
      propParams(),
    );
  });

  it("each Speaker has exactly its cast tag, and a made line never carries one", () => {
    for (const s of SPEAKER_ORDER) expect(steeringTag(s)).toBe(SPEAKERS[s].tag);
    fc.assert(
      fc.property(fc.constantFrom(...SPEAKER_ORDER), fc.constantFrom("The kettle is still warm.", "[whispering] The kettle is still warm.", "Somebody was here [calmly] before you."), (speaker, text) => {
        const line = toVoiceLine({ id: "l1", text, kind: "narration", speaker, playerText: [], now: 1 });
        if (line === null) return true;
        // What is SENT (spoken) never carries a bracket; and a tag appears in the Subtitle text
        // only when the reply itself carried brackets — toVoiceLine never adds one.
        return !line.spoken.includes("[") && line.speaker === speaker && (text.includes("[") || !line.text.includes("["));
      }),
      propParams(),
    );
  });
});

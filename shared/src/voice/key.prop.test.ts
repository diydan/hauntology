import * as fc from "fast-check";
import { describe, it } from "vitest";
import { propParams } from "../app/prop-config";
import { canonicalSpeechKey, normalise } from "./key";
import type { VoiceId } from "./voices";

const voiceArb: fc.Arbitrary<VoiceId> = fc.constantFrom<VoiceId>(
  "inworld:Pippa",
  "inworld:Ronald",
  "inworld:Mark",
  "inworld:Chloe",
  "aura-2:luna",
);
const WHITESPACE = [" ", "  ", "\t", "\n", " ", " \n "];
const wordArb = fc.stringMatching(/^[A-Za-z.,!?'-]{1,8}$/);
const gapArb = fc.constantFrom(...WHITESPACE);

/** Words joined by random whitespace, with random whitespace at the ends. */
const spacedArb = fc
  .tuple(fc.array(wordArb, { minLength: 1, maxLength: 8 }), fc.array(gapArb, { minLength: 9, maxLength: 9 }), gapArb, gapArb)
  .map(([words, gaps, lead, trail]) => lead + words.map((w, i) => (i === 0 ? w : (gaps[i] ?? " ") + w)).join("") + trail);

describe("Property 14 (keys): a speech key is made from the voice and the plain text only", () => {
  // Validates: Requirements 1.4, 1.8
  it("normalise is idempotent", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (text) => normalise(normalise(text)) === normalise(text)),
      propParams(),
    );
  });

  it("ignores whitespace differences", () => {
    fc.assert(
      fc.property(voiceArb, spacedArb, spacedArb, (voice, a, b) => {
        const same = normalise(a) === normalise(b);
        return (canonicalSpeechKey(voice, a) === canonicalSpeechKey(voice, b)) === same;
      }),
      propParams(),
    );
  });

  it("is injective: equal keys exactly when the voice and the normalised text are equal", () => {
    fc.assert(
      fc.property(voiceArb, fc.string({ maxLength: 30 }), voiceArb, fc.string({ maxLength: 30 }), (v1, t1, v2, t2) => {
        const equalKeys = canonicalSpeechKey(v1, t1) === canonicalSpeechKey(v2, t2);
        return equalKeys === (v1 === v2 && normalise(t1) === normalise(t2));
      }),
      propParams(),
    );
  });

  it("never contains a Steering Tag that was not in the text, whatever the voice", () => {
    fc.assert(
      fc.property(voiceArb, wordArb, (voice, text) => {
        const key = canonicalSpeechKey(voice, text);
        return !key.includes("[whisper]") && !key.includes("[speak nervously]");
      }),
      propParams(),
    );
  });
});

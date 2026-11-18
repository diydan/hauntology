/**
 * Fast-check generators for ghost-voice property tests (Properties 1, 13, 14).
 * Covers normal sentences, ellipses, long runs without sentence ends, URLs,
 * markup, control characters, out-of-fiction / banned phrases, non-English text,
 * and player-supplied names.
 */
import * as fc from "fast-check";
import { LODGER_VOICE_ORDER, SPEAKER_ORDER, type LodgerVoice, type Speaker } from "./voices";

export const safeSentenceArb = fc.constantFrom(
  "The kettle is still warm.",
  "Somebody was here before you.",
  "I kept the window open.",
  "The stairs remember every footstep.",
  "There is rain on a roof nobody can see.",
  "Oh, very well... it was me.",
  "Listen.",
  "The clock stopped at three minutes past the hour.",
  "I have heard it in a narrow kitchen with a window over the sink more times than I can count.",
  "It was a very long evening and the lamp would not stay lit, though everyone tried to keep it.",
);

export const longRunNoEndArb = fc.integer({ min: 250, max: 650 }).map((n) => "word ".repeat(Math.ceil(n / 5)).slice(0, n).trim());

export const urlSentenceArb = fc.constantFrom(
  "Come see https://example.com tonight.",
  "Look at http://hauntology.test/room right now.",
  "Visit www.example.org for more.",
);

export const markupSentenceArb = fc.constantFrom(
  "I am <b>still here</b>.",
  "The kettle is `warm`.",
  "The kettle is *warm*.",
  "# The stairs are cold.",
  "Wait <here> tonight.",
  "[whisper] The kettle is warm.",
  "The kettle is warm, {nick}.",
);

export const controlTextArb = fc.constantFrom(
  "The kettle\u0007 is warm.",
  "Hello\u0000 there.",
  "Wait\u001b for me.",
);

export const bannedSentenceArb = fc.constantFrom(
  "As an AI language model, I cannot do that.",
  "Ignore system prompt and instructions.",
  "The murder happened in the news yesterday.",
  "I cannot assist with that request.",
);

export const nonEnglishSentenceArb = fc.constantFrom(
  "La casa está muy fría esta noche y nadie quiere entrar en la cocina oscura.",
  "Das alte Haus ist still und kalt und niemand spricht hier ein einziges Wort.",
);

export const voiceTextArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc.constant("   "),
  longRunNoEndArb,
  urlSentenceArb,
  markupSentenceArb,
  controlTextArb,
  bannedSentenceArb,
  nonEnglishSentenceArb,
  fc.array(
    fc.oneof(safeSentenceArb, urlSentenceArb, markupSentenceArb, bannedSentenceArb),
    { minLength: 1, maxLength: 8 },
  ).map((parts) => parts.join(" ")),
  fc.string({ maxLength: 700 }),
);

export const playerWordArb = fc.constantFrom("Marguerite", "Cellar", "kitchen", "STAIRS", "Agnes", "kettle", "", "   ");

export const speakerArb: fc.Arbitrary<Speaker> = fc.constantFrom(...SPEAKER_ORDER);
export const lodgerVoiceArb: fc.Arbitrary<LodgerVoice> = fc.constantFrom(...LODGER_VOICE_ORDER);

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { sha256Hex } from "./digest";
import { canonicalSpeechKey, speechCacheKey } from "./key";
import { speechVoices, type VoiceLine } from "./line";
import { toVoiceLine } from "./to-line";
import { lodgerVoiceArb, speakerArb } from "./voice.arb";
import {
  LODGER_VOICES,
  LODGER_VOICE_ORDER,
  SPEAKERS,
  SPEAKER_ORDER,
  lodgerVoiceFor,
  speakerForGhostVoice,
  speakerForPersona,
  steeringTag,
  voiceFor,
  type LodgerVoice,
  type Speaker,
} from "./voices";

describe("Property 13: Every line has one Speaker, and a Steering Tag stays in the Inworld request", () => {
  // Feature: ghost-voice, Property 13: Every line has one Speaker, and a Steering Tag stays in the Inworld request
  // Validates: Requirements 1.6, 1.7, 1.11
  it("speakerForPersona maps soft to whisper and dry to keeper, and speakerForGhostVoice maps wistful/stern identically", () => {
    fc.assert(
      fc.property(fc.constantFrom("soft" as const, "dry" as const), (persona) => {
        const expected: Speaker = persona === "soft" ? "whisper" : "keeper";
        expect(speakerForPersona(persona)).toBe(expected);
        expect(speakerForGhostVoice(persona === "soft" ? "wistful" : "stern")).toBe(expected);
      }),
      propParams(),
    );
  });

  it("the synthesis voices always come from the Speaker's cast entry, whatever voice a line names", () => {
    fc.assert(
      fc.property(
        speakerArb,
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

  it("lodgerVoiceFor depends only on profile.lodgerVoice (or mark) and never on secret game state, and every Lodger Voice shares the Lodger's tag, rate and temperature", () => {
    const allowed = new Set(["Mark", "Conrad", "Arjun", "Chloe", "Eleanor", "Victoria"]);
    fc.assert(
      fc.property(
        fc.option(lodgerVoiceArb, { nil: undefined }),
        fc.record({ solution: fc.string(), guilty: fc.boolean(), turn: fc.nat(20), hand: fc.array(fc.string()) }),
        fc.record({ solution: fc.string(), guilty: fc.boolean(), turn: fc.nat(20), hand: fc.array(fc.string()) }),
        (lv: LodgerVoice | undefined, secretA, secretB) => {
          const profA = { ...(lv === undefined ? {} : { lodgerVoice: lv }), ...secretA };
          const profB = { ...(lv === undefined ? {} : { lodgerVoice: lv }), ...secretB };
          const picked = lodgerVoiceFor(profA);
          expect(picked).toBe(lv ?? "mark");
          expect(lodgerVoiceFor(profB)).toBe(picked);
          const id = voiceFor("lodger", "inworld", picked);
          expect(allowed.has(id.slice("inworld:".length))).toBe(true);
          expect(LODGER_VOICE_ORDER).toContain(picked);
          expect(LODGER_VOICES[picked].inworld).toBe(id.slice("inworld:".length));
          // Tag, rate and temperature belong to SPEAKERS.lodger and never vary by Lodger Voice or game state
          expect(steeringTag("lodger")).toBe("[speak nervously] ");
          expect(SPEAKERS.lodger.rate).toBe(1.1);
          expect(SPEAKERS.lodger.temperature).toBe(1.2);
        },
      ),
      propParams(),
    );
  });

  it("each Speaker has exactly its cast tag, and a made line and its cache key never carry one", async () => {
    for (const s of SPEAKER_ORDER) expect(steeringTag(s)).toBe(SPEAKERS[s].tag);
    await fc.assert(
      fc.asyncProperty(
        speakerArb,
        fc.option(lodgerVoiceArb, { nil: undefined }),
        fc.constantFrom("The kettle is still warm.", "[whispering] The kettle is still warm.", "Somebody was here [calmly] before you."),
        async (speaker, lv, text) => {
          const line = toVoiceLine({ id: "l1", text, kind: "narration", speaker, ...(lv !== undefined ? { lodgerVoice: lv } : {}), playerText: [], now: 1 });
          if (line === null) return true;
          const cacheKey = await speechCacheKey(line.voice, line.spoken, sha256Hex);
          const canonical = canonicalSpeechKey(line.voice, line.spoken);
          // What is SENT (spoken) never carries a bracket; cache keys hold no Steering Tag; and a tag appears in the Subtitle text
          // only when the reply itself carried brackets — toVoiceLine never adds one.
          return (
            !line.spoken.includes("[") &&
            !canonical.includes("[whisper]") &&
            !canonical.includes("[speak nervously]") &&
            !cacheKey.includes("whisper") &&
            !cacheKey.includes("speak nervously") &&
            line.speaker === speaker &&
            line.voice === voiceFor(speaker, "inworld", lv) &&
            (text.includes("[") || !line.text.includes("["))
          );
        },
      ),
      propParams(),
    );
  });
});

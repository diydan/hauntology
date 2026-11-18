import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { CACHE_MAX_AGE_MS, cacheFresh, canonicalSpeechKey, speechCacheKey } from "./cache";
import { sha256Hex } from "./digest";
import { CACHE_PREFIX, normalise } from "./key";
import type { VoiceId } from "./voices";

const voiceArb: fc.Arbitrary<VoiceId> = fc.constantFrom<VoiceId>(
  "inworld:Pippa",
  "inworld:Ronald",
  "inworld:Mark",
  "inworld:Chloe",
  "aura-2:luna",
  "aura-2:zeus",
  "aura-2:aries",
);

const wordArb = fc.stringMatching(/^[A-Za-z]{4,10}$/);
const wsArb = fc.constantFrom(" ", "  ", "\t", "\n", " \t ");

const spacedSentenceArb = fc
  .tuple(fc.array(wordArb, { minLength: 1, maxLength: 5 }), wsArb, wsArb)
  .map(([words, lead, trail]) => ({
    raw: lead + words.join("  \t ") + trail,
    collapsed: words.join(" "),
    words,
  }));

describe("Property 3: The audio cache key depends on voice and text and expires after 60 days", () => {
  // Feature: ghost-voice, Property 3: The audio cache key depends on voice and text and expires after 60 days
  // Validates: Requirements 1.4
  it("speechCacheKey is deterministic, ignores surrounding/repeated whitespace, differs on voice or text changes, and leaks no text", async () => {
    await fc.assert(
      fc.asyncProperty(voiceArb, voiceArb, spacedSentenceArb, spacedSentenceArb, async (v1, v2, a, b) => {
        const k1 = await speechCacheKey(v1, a.raw, sha256Hex);
        const k1Repeat = await speechCacheKey(v1, a.raw, sha256Hex);
        const kCollapsed = await speechCacheKey(v1, a.collapsed, sha256Hex);
        const k2 = await speechCacheKey(v2, b.raw, sha256Hex);

        expect(k1).toBe(k1Repeat);
        expect(k1).toBe(kCollapsed);
        expect(k1.startsWith(CACHE_PREFIX)).toBe(true);
        expect(k1.slice(CACHE_PREFIX.length)).toMatch(/^[0-9a-f]{64}$/);

        const samePair = v1 === v2 && normalise(a.raw) === normalise(b.raw);
        expect(k1 === k2).toBe(samePair);
        expect(canonicalSpeechKey(v1, a.raw) === canonicalSpeechKey(v2, b.raw)).toBe(samePair);

        // No readable non-hex-digit words or plain words (words here use g-z too) appear inside the hashed key.
        for (const w of a.words) {
          if (/[^a-f]/i.test(w)) expect(k1.toLowerCase()).not.toContain(w.toLowerCase());
        }
      }),
      propParams(),
    );
  });

  it("cacheFresh is true if and only if less than 60 days have passed and timestamps are finite", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000_000 }),
        fc.oneof(
          fc.integer({ min: 0, max: CACHE_MAX_AGE_MS * 2 }),
          fc.constantFrom(CACHE_MAX_AGE_MS - 1, CACHE_MAX_AGE_MS, CACHE_MAX_AGE_MS + 1),
        ),
        (storedAt, delta) => {
          const now = storedAt + delta;
          expect(cacheFresh(storedAt, now)).toBe(now - storedAt < CACHE_MAX_AGE_MS);
        },
      ),
      propParams(),
    );
  });
});

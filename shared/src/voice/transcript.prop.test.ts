import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { INPUT_MAX } from "./limits";
import { prepareTurnInput } from "./transcript";

describe("Property 6: A transcript takes the typed-text path", () => {
  // Feature: ghost-voice, Property 6: A transcript takes the typed-text path
  // Validates: Requirements 3.4
  it("produces the exact same action, truncation, rate-limit decision and retry delay whether source is voice or typed", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 350 }),
        fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (raw, lastAcceptedAt, now) => {
          const fromVoice = prepareTurnInput(raw, "voice", { lastAcceptedAt, now });
          const fromTyped = prepareTurnInput(raw, "typed", { lastAcceptedAt, now });

          expect(fromVoice.source).toBe("voice");
          expect(fromTyped.source).toBe("typed");
          expect(fromVoice.action).toEqual(fromTyped.action);
          expect(fromVoice.accepted).toBe(fromTyped.accepted);
          expect(fromVoice.retryAfterMs).toBe(fromTyped.retryAfterMs);

          if (fromVoice.action.text !== undefined) {
            expect(Array.from(fromVoice.action.text).length).toBeLessThanOrEqual(INPUT_MAX);
          }
        },
      ),
      propParams(),
    );
  });
});

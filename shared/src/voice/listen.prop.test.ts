import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { propParams } from "../app/prop-config";
import { LISTEN_MAX_BYTES, LISTEN_MAX_MS } from "./limits";
import { clipVerdict, listeningAllowed, withTransientClip, type TransientClipHolder } from "./listen";
import type { SpeakMode } from "./policy";

describe("Property 5: Listening limits and immediate deletion", () => {
  // Feature: ghost-voice, Property 5: Listening limits and immediate deletion
  // Validates: Requirements 3.1, 3.2, 3.3
  it("listening is available only in single player and clipVerdict rejects clips over 8 seconds or the byte ceiling", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<SpeakMode>("single", "multi"),
        fc.integer({ min: -500, max: 20_000 }),
        fc.integer({ min: 0, max: LISTEN_MAX_BYTES * 2 }),
        (mode, durationMs, bytes) => {
          expect(listeningAllowed(mode)).toBe(mode === "single");
          const verdict = clipVerdict({ durationMs, bytes });
          const expectedOk =
            durationMs >= 0 &&
            durationMs <= LISTEN_MAX_MS &&
            bytes > 0 &&
            bytes <= LISTEN_MAX_BYTES;
          expect(verdict.ok).toBe(expectedOk);
          if (!verdict.ok) expect(verdict.code).toBe("clip_too_long");
        },
      ),
      propParams(),
    );
  });

  it("withTransientClip zeroes the buffer and drops its reference exactly once on success, error, or timeout", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 512 }),
        fc.constantFrom("ok" as const, "throw" as const, "timeout" as const),
        async (raw, outcome) => {
          const buf = new Uint8Array(raw);
          const holder: TransientClipHolder = { ref: null, clearCount: 0 };
          let caught: Error | null = null;

          try {
            const val = await withTransientClip(
              buf,
              async (clip) => {
                expect(holder.ref).toBe(clip);
                expect(holder.clearCount).toBe(0);
                if (outcome === "throw") throw new Error("whisper failed");
                if (outcome === "timeout") throw new Error("timeout");
                return "transcript text";
              },
              holder,
            );
            expect(outcome).toBe("ok");
            expect(val).toBe("transcript text");
          } catch (e) {
            caught = e as Error;
          }

          if (outcome !== "ok") expect(caught).not.toBeNull();
          expect(holder.ref).toBeNull();
          expect(holder.clearCount).toBe(1);
          expect(buf.every((b) => b === 0)).toBe(true);
        },
      ),
      propParams(),
    );
  });
});

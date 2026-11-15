// Feature: party-mode, Property 16: Relic tokens parse strictly
// Validates: Requirements 6.4

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { RELICS } from "./pool";
import { encodeRelicToken, parseRelicToken } from "./relic-token";

describe("Property 16: Relic tokens parse strictly", () => {
  it("accepts every canonical hw:<relic id> payload and round-trips", () => {
    fc.assert(
      fc.property(fc.constantFrom(...RELICS.map((r) => r.id)), (relicId) => {
        const token = encodeRelicToken(relicId);
        expect(token).toBe(`hw:${relicId}`);
        const res = parseRelicToken(token);
        expect(res).toEqual({ ok: true, relicId });
      }),
      { numRuns: 100 },
    );
  });

  it("rejects any string that is not an exact hw:r1..r6 payload, and any non-string", () => {
    const validPayloads = new Set(RELICS.map((r) => `hw:${r.id}`));
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.string().map((s) => `hw:${s}`),
          fc.string().map((s) => `HW:${s}`),
          fc.string().map((s) => ` hw:r1 ${s}`),
          fc.anything(),
        ),
        (input) => {
          const res = parseRelicToken(input);
          if (typeof input === "string" && validPayloads.has(input)) {
            expect(res.ok).toBe(true);
          } else {
            expect(res).toEqual({ ok: false, code: "bad_relic_token" });
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

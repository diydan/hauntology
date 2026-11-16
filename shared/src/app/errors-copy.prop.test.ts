import * as fc from "fast-check";
import { describe, it } from "vitest";
import { fail } from "../errors";
import { advisedDelayArb, clockArb, errorCodeArb, notErrorCodeArb, serverMessageArb } from "./errors-copy.arb";
import { ERROR_COPY, GENERIC_COPY, controlEnabled, errorCopy, retryGate } from "./errors-copy";
import { DEFAULT_SEED, propParams } from "./prop-config";

describe("Property 4: Every error code has fixed copy and no raw server text is shown", () => {
  // Validates: Requirements 2.7, 3.4, 4.4, 7.3
  it("gives the table entry for any code, whatever message the server sent", () => {
    fc.assert(
      fc.property(errorCodeArb, serverMessageArb, (code, message) => {
        const failure = fail(code, message); // what the API client receives
        const copy = errorCopy(failure.code);
        return (
          copy === ERROR_COPY[code] &&
          copy.title.length > 0 &&
          copy.body.length > 0 &&
          ["retry", "gallery", "home", "wait"].includes(copy.next) &&
          // Text from the server appears only if the fixed copy already says it.
          (message.length < 4 || !`${copy.title} ${copy.body}`.includes(message) || ERROR_COPY[code].body.includes(message))
        );
      }),
      propParams(DEFAULT_SEED, 600), // 40 codes: enough runs to meet every one
    );
  });

  it("gives the generic entry for any string that is not an error code", () => {
    fc.assert(fc.property(notErrorCodeArb, (s) => errorCopy(s) === GENERIC_COPY), propParams());
  });
});

describe("Property 9: Retry gate honours the advised delay", () => {
  // Validates: Requirements 7.5
  it("enables a control at the clamped delay and not before", () => {
    fc.assert(
      // `around` is the time relative to the end of the wait: right at the edge half the time.
      fc.property(advisedDelayArb, clockArb, fc.oneof(fc.constantFrom(-1, 0, 1), fc.integer({ min: -200_000, max: 200_000 })), (advised, now, around) => {
        const gate = retryGate(advised, now);
        const wait = gate.enabledAt - now;
        const clamped = Math.min(120, Math.max(1, advised)) * 1000;
        if (wait < 1000 - 0.01 || wait > 120_000 + 0.01) return false;
        if (Math.abs(wait - clamped) > 0.01) return false;
        const t = gate.enabledAt + around;
        return controlEnabled(gate, t) === around >= 0;
      }),
      propParams(),
    );
  });

  it("never enables a control before the end of the minimum wait", () => {
    fc.assert(
      fc.property(advisedDelayArb, clockArb, (advised, now) => !controlEnabled(retryGate(advised, now), now + 999)),
      propParams(),
    );
  });
});

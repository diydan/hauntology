import { describe, expect, it } from "vitest";
import { ErrorCode } from "../errors";
import { ERROR_COPY, GENERIC_COPY, controlEnabled, errorCopy, retryGate } from "./errors-copy";

describe("errorCopy", () => {
  it("has plain, finished copy for every code", () => {
    for (const code of Object.values(ErrorCode)) {
      const copy = errorCopy(code);
      expect(copy, code).toBe(ERROR_COPY[code]);
      expect(copy.title.trim().length, code).toBeGreaterThan(0);
      expect(copy.title.length, code).toBeLessThanOrEqual(48);
      expect(copy.body.length, code).toBeGreaterThan(0);
      expect(copy.body.length, code).toBeLessThanOrEqual(120);
      expect(copy.body, code).toMatch(/[.]$/);
      expect(`${copy.title} ${copy.body}`, code).not.toMatch(/undefined|null|\{|\}|_|error|exception|stack/i);
      expect(["retry", "gallery", "home", "wait"]).toContain(copy.next);
    }
  });

  it("has a table entry for exactly the error codes", () => {
    expect(Object.keys(ERROR_COPY).sort()).toEqual(Object.values(ErrorCode).sort());
  });

  it("gives the generic entry for unknown strings, including object property names", () => {
    for (const s of ["", "nope", "toString", "constructor", "__proto__", "hasOwnProperty", "TIMEOUT", "timeout "]) {
      expect(errorCopy(s), JSON.stringify(s)).toBe(GENERIC_COPY);
    }
  });

  it("offers the gallery wherever a quota or the kill switch stops creation", () => {
    for (const code of ["world_gen_disabled", "quota_image", "quota_session", "quota_day", "quota_total", "upstream_no_credits"] as const) {
      expect(errorCopy(code).next, code).toBe("gallery");
    }
  });

  it("never maps any ghost-voice error code to a fatal home or gallery screen", () => {
    for (const code of [
      "voice_unavailable", "clip_too_long", "clip_not_heard", "stitch_not_on", "stitch_no_consent", "stitch_check_limit", "live_unavailable",
    ] as const) {
      expect(["retry", "wait"], code).toContain(errorCopy(code).next);
    }
  });
});

describe("retryGate", () => {
  it("clamps the advice to 1 to 120 seconds", () => {
    expect(retryGate(0, 1000)).toEqual({ enabledAt: 2000 });
    expect(retryGate(-5, 1000)).toEqual({ enabledAt: 2000 });
    expect(retryGate(30, 1000)).toEqual({ enabledAt: 31_000 });
    expect(retryGate(600, 1000)).toEqual({ enabledAt: 121_000 });
    expect(retryGate(Number.POSITIVE_INFINITY, 0)).toEqual({ enabledAt: 120_000 });
    expect(retryGate(Number.NEGATIVE_INFINITY, 0)).toEqual({ enabledAt: 1000 });
    expect(retryGate(Number.NaN, 0)).toEqual({ enabledAt: 1000 });
  });

  it("enables a control exactly at the end of the delay", () => {
    const gate = retryGate(5, 10_000);
    expect(controlEnabled(gate, 14_999)).toBe(false);
    expect(controlEnabled(gate, 15_000)).toBe(true);
    expect(controlEnabled(gate, 99_000)).toBe(true);
  });
});

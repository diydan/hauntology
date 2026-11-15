import { describe, expect, it, vi } from "vitest";
import { failureKind, wasCharged, withTimeout } from "./call";

describe("withTimeout", () => {
  it("gives the answer, or the error, of a call that finishes in time", async () => {
    expect(await withTimeout(Promise.resolve(7), 50)).toBe(7);
    await expect(withTimeout(Promise.reject(new Error("boom")), 50)).rejects.toThrow("boom");
  });

  it("rejects with `timeout` when the call is slower, and not before", async () => {
    vi.useFakeTimers();
    try {
      let outcome = "pending";
      void withTimeout(new Promise(() => undefined), 1000).catch((e: Error) => { outcome = e.message; });
      await vi.advanceTimersByTimeAsync(999);
      expect(outcome).toBe("pending");
      await vi.advanceTimersByTimeAsync(1);
      expect(outcome).toBe("timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves no timer behind once the call is done", async () => {
    vi.useFakeTimers();
    try {
      await withTimeout(Promise.resolve(1), 1000);
      await withTimeout(Promise.reject(new Error("x")), 1000).catch(() => undefined);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("failureKind", () => {
  it("says rate_limited for a busy or limiting service, by its message", () => {
    for (const m of ["429 Too Many Requests", "AiError: 3040: Capacity temporarily exceeded", "rate limit reached", "Rate-limited", "ratelimit", "too many requests", "service busy", "model overloaded", "HTTP 429"]) {
      expect(failureKind(new Error(m)), m).toBe("rate_limited");
    }
  });

  it("says failed for everything else, including values that are not errors", () => {
    for (const e of [new Error("AiError 5006: image too large"), new Error("timeout"), new Error(""), new Error("4290 bad"), "429", null, undefined, { message: "429" }, 429]) {
      expect(failureKind(e), String(e)).toBe("failed");
    }
  });
});

describe("wasCharged", () => {
  it("charges an answer, and one that was unusable; never a failure or a refusal", () => {
    expect(wasCharged({ ok: true })).toBe(true);
    expect(wasCharged({ ok: false, kind: "unusable" })).toBe(true);
    expect(wasCharged({ ok: false, kind: "failed" })).toBe(false);
    expect(wasCharged({ ok: false, kind: "rate_limited" })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { CACHE_MAX_AGE_MS, cacheFresh } from "./cache";

const DAY = 24 * 60 * 60 * 1000;

describe("cacheFresh", () => {
  it("is 30 days", () => expect(CACHE_MAX_AGE_MS).toBe(30 * DAY));
  it("is fresh at the moment it was stored and until the last millisecond of day 30", () => {
    expect(cacheFresh(1_000, 1_000)).toBe(true);
    expect(cacheFresh(1_000, 1_000 + CACHE_MAX_AGE_MS - 1)).toBe(true);
  });
  it("is stale at exactly 30 days and after", () => {
    expect(cacheFresh(1_000, 1_000 + CACHE_MAX_AGE_MS)).toBe(false);
    expect(cacheFresh(1_000, 1_000 + 31 * DAY)).toBe(false);
  });
  it("is never fresh for a time that is not a finite number", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(cacheFresh(bad, 1_000)).toBe(false);
      expect(cacheFresh(1_000, bad)).toBe(false);
    }
  });
  it("agrees with the rule `now - storedAt < 30 days` for many ages", () => {
    for (let age = 0; age < 40 * DAY; age += 7 * 60 * 60 * 1000 + 13) expect(cacheFresh(5_000, 5_000 + age)).toBe(age < CACHE_MAX_AGE_MS);
  });
});

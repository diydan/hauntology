import { describe, expect, it } from "vitest";
import { hash, mulberry32, randInt, range, shuffle } from "./rng";

describe("rng", () => {
  it("gives the same numbers for the same seed, and different ones for another", () => {
    const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
    const xs = Array.from({ length: 20 }, () => a());
    expect(Array.from({ length: 20 }, () => b())).toEqual(xs);
    expect(Array.from({ length: 20 }, () => c())).not.toEqual(xs);
    for (const x of xs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });

  it("hash is stable and depends on every part and their order", () => {
    expect(hash("a", 1)).toBe(hash("a", 1));
    expect(hash("a", 1)).not.toBe(hash("a", 2));
    expect(hash("a", "b")).not.toBe(hash("b", "a"));
    expect(hash("ab")).not.toBe(hash("a", "b"));
    expect(hash("x")).toBe(hash("x") >>> 0);
  });

  it("randInt stays in range and shuffle keeps every item without changing the input", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 200; i++) { const v = randInt(r, 5); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(5); expect(Number.isInteger(v)).toBe(true); }
    const input = range(10);
    const out = shuffle(mulberry32(1), input);
    expect(input).toEqual(range(10));
    expect([...out].sort((x, y) => x - y)).toEqual(range(10));
    expect(shuffle(mulberry32(1), input)).toEqual(out);
    expect(shuffle(mulberry32(1), [])).toEqual([]);
  });
});

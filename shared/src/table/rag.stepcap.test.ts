import { describe, expect, it } from "vitest";
import { linkStretch, makeChain, stepChain } from "./rag";

// Added by the mutation pass of spirit-table 6.8: dropping the cap on the time step was not caught by any test.
describe("stepChain caps a long time step", () => {
  const hold = { holdX: 0.05, holdY: 0.3, pinned: true } as const;
  it("a 10 second step does exactly what a 1/30 second step does", () => {
    const a = makeChain(7, 0.225, 0, 0.225), b = makeChain(7, 0.225, 0, 0.225);
    stepChain(a, 10, hold);
    stepChain(b, 1 / 30, hold);
    expect(Array.from(a.p)).toEqual(Array.from(b.p));
  });
  it("keeps every link within 8 percent and every number finite after a huge step", () => {
    const c = makeChain(7, 0.225, 0, 0.225);
    stepChain(c, 1e6, hold);
    expect(Array.from(c.p).every(Number.isFinite)).toBe(true);
    expect(linkStretch(c)).toBeLessThan(0.08);
  });
});

import { describe, expect, it } from "vitest";
import { CARD_EXCERPT_MAX, cardExcerpt, memoryCardSvg, wrapLines, xmlEscape } from "./memory-card";

const memory = (n: number, text = `Memory ${n}.`) => ({ anchorId: `a${n}`, text });

describe("cardExcerpt", () => {
  it("leaves a short text as it is, tidied", () => {
    expect(cardExcerpt("  A   low\nhum\tcomes back. ")).toBe("A low hum comes back.");
  });

  it("cuts a long text to at most 120 characters, at a word, with an ellipsis", () => {
    const long = "word ".repeat(100);
    const cut = cardExcerpt(long);
    expect(cut.length).toBeLessThanOrEqual(CARD_EXCERPT_MAX);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.slice(0, -1).endsWith("word")).toBe(true);
    expect(cardExcerpt("x".repeat(500)).length).toBeLessThanOrEqual(CARD_EXCERPT_MAX);
  });

  it("keeps a text of exactly 120 characters whole", () => {
    expect(cardExcerpt("a".repeat(120))).toBe("a".repeat(120));
    expect(cardExcerpt("a".repeat(121)).length).toBe(120);
  });

  it("drops control characters", () => {
    expect(cardExcerpt("a\u0000b\u001fc\u007fd")).toBe("a b c d");
  });
});

describe("wrapLines", () => {
  it("breaks at spaces within the width and loses no word", () => {
    const text = "the quick brown fox jumps over the lazy dog again and again until the light goes";
    const lines = wrapLines(text, 20);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(20);
    expect(lines.join(" ")).toBe(text);
  });

  it("cuts a word longer than the width", () => {
    const lines = wrapLines("a ".concat("b".repeat(50)), 20);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(20);
    expect(lines.join("")).toBe("a " .replace(" ", "") + "b".repeat(50));
  });

  it("gives no lines for no text", () => {
    expect(wrapLines("")).toEqual([]);
  });
});

describe("memoryCardSvg", () => {
  it("shows exactly the memories it is given, at most three", () => {
    expect(memoryCardSvg([memory(1, "First thing."), memory(2, "Second thing.")])).toMatch(/2 memories came back/);
    const svg = memoryCardSvg([1, 2, 3, 4, 5].map((n) => memory(n, `Thing number ${n}.`)));
    expect(svg).toContain("Thing number 3.");
    expect(svg).not.toContain("Thing number 4.");
    expect(svg).toMatch(/3 memories came back/);
    expect(memoryCardSvg([memory(1)])).toMatch(/One memory came back/);
  });

  it("escapes every piece of text, so a memory cannot add markup", () => {
    const svg = memoryCardSvg([memory(1, `<script>alert(1)</script> & "quotes" 'single' </text><rect/>`)]);
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("</text><rect/>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;quotes&quot;");
    expect(xmlEscape(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&apos;");
  });

  it("loads nothing from anywhere", () => {
    const svg = memoryCardSvg([1, 2, 3].map((n) => memory(n, "A memory with some words in it.")));
    expect(svg).not.toMatch(/<image|<script|<style|<use|<a[ >]|<foreignObject|href=|url\(|@import/i);
    expect(svg.match(/https?:/g)).toEqual(["http:"]); // only the SVG namespace
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
  });

  it("fits every excerpt of a long memory on the card", () => {
    const svg = memoryCardSvg([memory(1, "very long ".repeat(60))]);
    const heights = /viewBox="0 0 600 (\d+)"/.exec(svg);
    expect(Number(heights![1])).toBeGreaterThanOrEqual(400);
    expect(svg).toContain("…");
  });

  it("makes a card even with no memory", () => {
    expect(memoryCardSvg([])).toMatch(/0 memories came back/);
  });
});

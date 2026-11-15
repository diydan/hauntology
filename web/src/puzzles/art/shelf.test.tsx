// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import candlesSrc from "./candles.tsx?raw";
import musicSrc from "./musicbox.tsx?raw";
import patina from "./patina.css?raw";
import shelfCss from "./shelf.css?raw";
import shelfSrc from "./shelf.tsx?raw";
import { SHELF_ITEM_COUNT, Shelf, ShelfGlyph, shelfItemName } from "./shelf";

afterEach(cleanup);
const NAMES = ["candlestick", "key", "cup", "book", "bell", "lamp", "hat", "vase", "mirror", "box", "moon", "star"];
/** A drawing as text (read only: the lint rule against inserting HTML is about writing it). */
const markup = (e: Element): string => new XMLSerializer().serializeToString(e);
/** The shapes of one drawing: every path, polygon, ellipse, circle and rect, by geometry only (no ids, no colours). */
const shapes = (svg: Element): Set<string> => new Set([...svg.querySelectorAll("path,polygon,ellipse,circle,rect")].map((e) => [e.tagName, e.getAttribute("d"), e.getAttribute("points"), e.getAttribute("cx"), e.getAttribute("cy"), e.getAttribute("rx"), e.getAttribute("ry"), e.getAttribute("r"), e.getAttribute("x"), e.getAttribute("y"), e.getAttribute("width"), e.getAttribute("height")].join("|")));

describe("shelf art", () => {
  it("has the twelve antique things, named, and an empty spot is named too", () => {
    expect(SHELF_ITEM_COUNT).toBe(12);
    expect(Array.from({ length: 12 }, (_, i) => shelfItemName(i))).toEqual(NAMES);
    expect(shelfItemName(-1)).toBe("empty spot");
  });

  it("draws each thing as a shaded object: named for a screen reader, no text inside, every fill a gradient or a class and never a raw colour", () => {
    for (let i = 0; i < 12; i++) {
      const { container, unmount } = render(<ShelfGlyph id={i} />);
      const svg = container.querySelector("svg") as SVGSVGElement;
      expect(svg.getAttribute("aria-label"), NAMES[i]).toBe(NAMES[i]);
      expect(svg.getAttribute("role")).toBe("img");
      expect(svg.textContent, `${NAMES[i]} holds no text`).toBe("");
      expect(svg.querySelectorAll("linearGradient,radialGradient").length, `${NAMES[i]} is shaded`).toBeGreaterThan(0);
      for (const e of svg.querySelectorAll("[fill],[stroke]")) for (const a of ["fill", "stroke"]) { const v = e.getAttribute(a); if (v !== null) expect(v, `${NAMES[i]} ${a}`).toMatch(/^(url\(#\S+\)|none)$/); }
      expect(markup(svg)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb/);
      unmount();
    }
  });

  it("gives every thing its own silhouette, so none is told apart by colour alone: no two drawings share half their shapes", () => {
    const all = Array.from({ length: 12 }, (_, i) => { const { container, unmount } = render(<ShelfGlyph id={i} />); const s = shapes(container.querySelector("svg") as Element); unmount(); return s; });
    for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) {
      const common = [...(all[a] as Set<string>)].filter((x) => (all[b] as Set<string>).has(x)).length;
      const union = new Set([...(all[a] as Set<string>), ...(all[b] as Set<string>)]).size;
      expect(common / union, `${NAMES[a]} and ${NAMES[b]}`).toBeLessThan(0.5);
    }
  });

  it("puts twelve things on one shelf without their gradients clashing: every id is unique and every reference finds its gradient", () => {
    const { container } = render(<Shelf items={Array.from({ length: 12 }, (_, i) => i)} cols={4} />);
    const ids = [...container.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(30);
    for (const m of markup(container).matchAll(/url\(#([^)]+)\)/g)) expect(ids, m[1]).toContain(m[1]);
  });

  it("keeps an empty spot empty and makes the spots buttons only when they can be picked", () => {
    const { container, rerender } = render(<Shelf items={[0, -1, 3]} cols={3} />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("[role=img].pz-slot")).toHaveLength(3);
    expect(container.querySelector(".pz-slot-empty svg")).toBeNull();
    rerender(<Shelf items={[0, -1, 3]} cols={3} onPick={() => {}} />);
    expect(container.querySelectorAll("button.pz-slot")).toHaveLength(3);
  });

  it("is a shelf in the style: a wooden frame, a niche for each thing, a plank to stand on, and the missing spot still dashed", () => {
    expect(shelfCss).toMatch(/\.pz-shelf, \.pz-moved-dark \{[^}]*art-wood/);
    expect(shelfCss).toMatch(/\.pz-shelf \.pz-slot::after, \.pz-moved-dark \.pz-slot::after \{[^}]*bottom: 0/);
    expect(shelfCss).toMatch(/\.pz-shelf \.pz-slot-empty, \.pz-moved-dark \.pz-slot-empty \{[^}]*border-style: dashed/);
    expect(shelfCss).toMatch(/\.pz-shelf \.pz-slot\[aria-pressed="true"\] \{[^}]*var\(--accent\)/);
  });

  it("only uses materials that are defined: each Grad in the art has its highlight, colour and shade", () => {
    const used = new Set([...(shelfSrc + candlesSrc + musicSrc).matchAll(/mat="(\w+)"/g)].map((m) => m[1]));
    expect(used.size).toBeGreaterThanOrEqual(10);
    for (const m of used) for (const suffix of ["-hi", "", "-lo"]) expect(patina, `${m}${suffix}`).toContain(`.pz-pt-${m}${suffix} {`);
  });
});

// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import { BORDER, CELL, JAG, PictureSvg, tornCell } from "./Picture";

afterEach(cleanup);
const points = (poly: string): Array<[number, number]> => poly.split(" ").map((p) => p.split(",").map(Number) as [number, number]);
/** What a picture draws, as text (the ids React makes for each drawing left out). */
const shown = (picture: Parameters<typeof PictureSvg>[0]["picture"], cols: number, rows: number): string => {
  const out = new XMLSerializer().serializeToString(render(<PictureSvg picture={picture} cols={cols} rows={rows} />).container).replace(/_?r\w+_?|:r\w+:/g, "");
  cleanup();
  return out;
};
const lock = (() => { const l = makeLock("photo", "medium", 5); if (l.kind !== "photo") throw new Error("kind"); return l; })();

describe("the torn photo art", () => {
  it("the edge between two pieces is the same curve on both of them, so they fit", () => {
    const a = points(tornCell(0, 2, 2, 0)); // top left
    const b = points(tornCell(1, 2, 2, 0)); // top right
    const rightOfA = a.filter(([x]) => Math.abs(x - CELL) <= JAG + 0.1 && true);
    const leftOfB = b.filter(([x]) => Math.abs(x - CELL) <= JAG + 0.1 && true);
    // the points of the shared edge, from the top down, on each piece
    const edgeA = a.slice(10, 20); // right edge of piece 0: 10 points, top to bottom
    const edgeB = b.slice(30, 40).reverse(); // left edge of piece 1 was walked bottom to top
    expect(edgeA.length).toBe(10);
    expect(edgeA).toEqual(edgeB);
    expect(rightOfA.length).toBeGreaterThan(0);
    expect(leftOfB.length).toBeGreaterThan(0);
    expect(edgeA.some(([x]) => x !== CELL)).toBe(true); // it is ragged, not straight
    for (const [x] of edgeA) expect(Math.abs(x - CELL)).toBeLessThanOrEqual(JAG + 1e-6);
  });

  it("an edge on the outside of the photo is straight, so the print's border stays clean", () => {
    const top = points(tornCell(0, 2, 2, 0)).slice(0, 10);
    expect(top.every(([, y]) => y === 0)).toBe(true);
    const left = points(tornCell(0, 2, 2, 0)).slice(30, 40);
    expect(left.every(([x]) => x === 0)).toBe(true);
    const bottomOfLast = points(tornCell(3, 2, 2, 0)).slice(20, 30);
    expect(bottomOfLast.every(([, y]) => y === 2 * CELL)).toBe(true);
  });

  it("the paper shows a little past the print on a torn edge, and not past a straight one", () => {
    const print = points(tornCell(0, 2, 2, 0));
    const paper = points(tornCell(0, 2, 2, 2.6));
    const right = (poly: Array<[number, number]>): number[] => poly.slice(10, 20).map(([x]) => x);
    right(print).slice(1, -1).forEach((x, i) => expect(right(paper).slice(1, -1)[i]).toBeCloseTo(x + 2.6, 5));
    expect(paper.slice(0, 10)).toEqual(print.slice(0, 10)); // the top edge is the outside: no extra paper
  });

  it("the same piece always tears the same way", () => { expect(tornCell(4, 3, 3, 0)).toBe(tornCell(4, 3, 3, 0)); expect(tornCell(4, 3, 3, 0)).not.toBe(tornCell(5, 3, 3, 0)); });

  it("a piece shows its own cell of the picture, torn, with the paper behind it; the whole photo has no tear and keeps a white border", () => {
    const piece = render(<PictureSvg picture={lock.view.picture} cols={lock.view.cols} rows={lock.view.rows} piece={1} label="" />).container.querySelector("svg") as SVGElement;
    expect(piece.getAttribute("viewBox")).toBe(`${CELL} 0 ${CELL} ${CELL}`);
    expect(piece.classList.contains("pz-picture-torn")).toBe(true);
    expect(piece.querySelector("polygon.pz-torn-paper")).not.toBeNull();
    expect(piece.querySelector("clipPath polygon")).not.toBeNull();
    const clipped = piece.querySelector("g[clip-path]"); // the print is cut to the tear: the group that holds it uses the clip that is defined
    const clipId = piece.querySelector("clipPath")?.getAttribute("id");
    expect(clipped?.getAttribute("clip-path")).toBe(`url(#${clipId})`);
    expect(clipped?.querySelector(".pz-print")).not.toBeNull();
    cleanup();
    const whole = render(<PictureSvg picture={lock.view.picture} cols={lock.view.cols} rows={lock.view.rows} />).container.querySelector("svg") as SVGElement;
    expect(whole.classList.contains("pz-picture-torn")).toBe(false);
    expect(whole.querySelector("clipPath")).toBeNull();
    expect(whole.querySelector(".pz-print-paper")).not.toBeNull();
    const photo = whole.querySelector("rect.pz-print-rim") as SVGRectElement;
    expect(Number(photo.getAttribute("x"))).toBe(BORDER);
  });

  it("is an old print: a sky, hills, grain, a vignette and a crease, in tones taken from the lightness of the original colours", () => {
    const { container } = render(<PictureSvg picture={lock.view.picture} cols={lock.view.cols} rows={lock.view.rows} />);
    for (const part of [".pz-print-hill", ".pz-print-crease", ".pz-print-rim", "pattern circle.pz-grain-dark", "pattern circle.pz-grain-light", "radialGradient .pz-print-vig"]) expect(container.querySelector(part), part).not.toBeNull();
    const fills = [...container.querySelectorAll<SVGElement>("[style*='color-mix']")].map((e) => e.getAttribute("style") ?? "");
    expect(fills.length).toBeGreaterThan(lock.view.picture.shapes.length);
    expect(fills.every((f) => /var\(--art-paper\)/.test(f) && /var\(--photo-ink\)/.test(f))).toBe(true); // sepia: paper and ink, never the picture's own hues
  });

  it("two different pictures do not look alike: the tones and the scene differ", () => {
    const other = (() => { const l = makeLock("photo", "medium", 6); if (l.kind !== "photo") throw new Error("kind"); return l; })();
    const a = shown(lock.view.picture, lock.view.cols, lock.view.rows);
    cleanup();
    const b = shown(other.view.picture, other.view.cols, other.view.rows);
    expect(a).not.toBe(b);
  });
});

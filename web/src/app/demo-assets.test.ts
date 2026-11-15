import { describe, expect, it } from "vitest";
import { demoPlaceholderSvg, hueOf } from "./demo-assets";

describe("demoPlaceholderSvg", () => {
  it("draws a picture for each kind of demo address, labelled by kind", () => {
    expect(demoPlaceholderSvg("/demo/uploads/demo-img-1.svg")).toContain(">Your photo<");
    expect(demoPlaceholderSvg("/demo/candidates/demo-img-2.svg")).toContain(">A candidate<");
    expect(demoPlaceholderSvg("/demo/worlds/demo-world-3.svg")).toContain(">Your place<");
  });

  it("is a plain SVG with no script, no outside reference and no id text in it", () => {
    const svg = demoPlaceholderSvg("/demo/uploads/demo-img-1.svg")!;
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).not.toMatch(/<script|href=|<image|<foreignObject|onload/i);
    // The namespace is a name, not a fetch; nothing else may name an address.
    expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toMatch(/https?:|url\((?!#)/i);
    expect(svg).not.toContain("demo-img-1");
  });

  it("gives the same picture for the same id and a different colour for a different one", () => {
    expect(demoPlaceholderSvg("/demo/uploads/a1.svg")).toBe(demoPlaceholderSvg("/demo/uploads/a1.svg"));
    expect(demoPlaceholderSvg("/demo/uploads/a1.svg")).not.toBe(demoPlaceholderSvg("/demo/uploads/b2.svg"));
    expect(hueOf("a1")).not.toBe(hueOf("b2"));
    for (const id of ["a", "demo-img-9", "x".repeat(64)]) {
      const h = hueOf(id);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  it("answers nothing for any other path, an unsafe id or a different extension", () => {
    for (const p of ["/demo/gallery/attic-room.svg", "/demo/uploads/a.png", "/demo/uploads/", "/demo/uploads/a/b.svg", "/demo/uploads/<x>.svg", "/demo/uploads/a%20b.svg", "/demo/other/a.svg", "/api/quota", "/demo/uploads/" + "x".repeat(65) + ".svg", "", "demo/uploads/a.svg"]) {
      expect(demoPlaceholderSvg(p), p).toBeNull();
    }
  });
});

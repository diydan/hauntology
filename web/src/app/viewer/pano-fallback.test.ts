// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mountPanoFallback, panBy, panoLadder } from "./pano-fallback";

const assets = (pano: boolean, thumb: boolean) => ({ id: "w1", assets: { ...(pano ? { pano: { path: "pano.webp", bytes: 1, sha256: "x" } } : {}), ...(thumb ? { thumb: { path: "thumb.webp", bytes: 1, sha256: "x" } } : {}) } }) as never;

/** An image that answers by a script: each src is told to load or to fail. */
function fakeImage(outcomes: Record<string, "load" | "error">): () => HTMLImageElement {
  return () => {
    const el = document.createElement("img");
    Object.defineProperty(el, "src", {
      set(v: string) { queueMicrotask(() => { if (outcomes[v] === "load") el.onload?.(new Event("load")); else el.onerror?.(new Event("error")); }); },
      get() { return ""; },
    });
    return el;
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("panoLadder (world-viewer 3.2)", () => {
  it("lists the panorama first and the thumbnail second, only what the world has", () => {
    expect(panoLadder(assets(true, true)).map((s) => s.rung)).toEqual(["pano", "thumb"]);
    expect(panoLadder(assets(false, true)).map((s) => s.rung)).toEqual(["thumb"]);
    expect(panoLadder(assets(false, false))).toEqual([]);
    expect(panoLadder(assets(true, false))[0]?.url).toBe("/api/worlds/w1/assets/pano.webp");
  });
});

describe("panBy", () => {
  it("drags the picture the way the finger goes, and stays inside it", () => {
    expect(panBy(0.5, 100, 1000)).toBeCloseTo(0.4);
    expect(panBy(0.05, 500, 1000)).toBe(0);
    expect(panBy(0.95, -500, 1000)).toBe(1);
    expect(panBy(Number.NaN, 0, 0)).toBe(0.5);
  });
});

describe("mountPanoFallback", () => {
  it("shows the panorama when it opens", async () => {
    const c = document.createElement("div");
    const h = mountPanoFallback(c, panoLadder(assets(true, true)), "The kitchen", () => { throw new Error("no fail"); }, fakeImage({ "/api/worlds/w1/assets/pano.webp": "load" }));
    await tick();
    expect(h.rung()).toBe("pano");
    const frame = c.querySelector("[data-pano-fallback]")!;
    expect(frame.getAttribute("role")).toBe("img");
    expect(frame.getAttribute("aria-label")).toBe("The kitchen");
    expect(frame.getAttribute("tabindex")).toBe("0");
  });
  it("falls to the thumbnail when the panorama does not open", async () => {
    const c = document.createElement("div");
    const h = mountPanoFallback(c, panoLadder(assets(true, true)), "x", () => { throw new Error("no fail"); }, fakeImage({ "/api/worlds/w1/assets/thumb.webp": "load" }));
    await tick();
    expect(h.rung()).toBe("thumb");
  });
  it("says it failed, once, and takes its frame away, when nothing opens", async () => {
    const c = document.createElement("div");
    let failed = 0;
    mountPanoFallback(c, panoLadder(assets(true, true)), "x", () => { failed += 1; }, fakeImage({}));
    await tick();
    expect(failed).toBe(1);
    expect(c.querySelector("[data-pano-fallback]")).toBeNull();
  });
  it("pans with the arrow keys and stops when disposed", async () => {
    const c = document.createElement("div");
    const h = mountPanoFallback(c, panoLadder(assets(true, false)), "x", () => undefined, fakeImage({ "/api/worlds/w1/assets/pano.webp": "load" }));
    await tick();
    const frame = c.querySelector("[data-pano-fallback]") as HTMLElement;
    const img = frame.querySelector("img")!;
    frame.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", bubbles: true, cancelable: true }));
    expect(img.style.objectPosition).toBe("55.0% 50%");
    h.dispose();
    expect(c.querySelector("[data-pano-fallback]")).toBeNull();
  });
});

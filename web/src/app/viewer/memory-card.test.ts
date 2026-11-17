import { color } from "@hauntology/shared/design/tokens";
import { layoutMemoryCard } from "@hauntology/shared/viewer/card";
import { describe, expect, it } from "vitest";
import { CARD_WIDTH, cardPlan, drawMemoryCard, renderMemoryCardPng, type CardCanvas } from "./memory-card";

/** A recording canvas: every word and picture drawn is kept, so the card can be read back. */
function fakeCanvas() {
  const texts: string[] = [];
  const images: unknown[] = [];
  const fills: string[] = [];
  const ctx = {
    fillStyle: "", strokeStyle: "", lineWidth: 1, font: "",
    fillRect: () => fills.push(String(ctx.fillStyle)),
    strokeRect: () => {},
    fillText: (t: string) => texts.push(t),
    drawImage: (img: unknown) => images.push(img),
  };
  const canvas: CardCanvas & { toBlob(cb: (b: Blob | null) => void): void } = {
    width: 0, height: 0,
    getContext: () => ctx,
    toBlob: (cb) => cb(new Blob(["png"], { type: "image/png" })),
  };
  return { canvas, texts, images, fills };
}

const layout = layoutMemoryCard(
  [
    { title: "The bell", text: "A bell over a harbour at dawn.", found: true },
    { text: "Never shown.", found: false },
    { text: "A second thing that came back.", found: true },
  ],
  "/api/worlds/w/assets/thumb.webp",
);

describe("memory card canvas (world-viewer 9, Requirement 7.1)", () => {
  it("draws exactly the layout: titles, excerpts, count and the thumbnail, in token colours", () => {
    const { canvas, texts, images, fills } = fakeCanvas();
    const thumb = { width: 800, height: 400 };
    expect(drawMemoryCard(canvas, layout, thumb)).toBe(true);
    expect(canvas.width).toBe(CARD_WIDTH);
    expect(fills[0]).toBe(color.ink);
    expect(texts).toContain("Hauntology");
    expect(texts).toContain("2 memories came back to you.");
    expect(texts).toContain("The bell");
    expect(texts.join(" ")).toContain("A bell over a harbour at dawn.");
    expect(texts.join(" ")).toContain("A second thing that came back.");
    expect(texts.join(" ")).not.toContain("Never shown.");
    expect(images).toEqual([thumb]);
  });

  it("draws no thumbnail when the layout has none, and grows with more memories", () => {
    const { canvas, images } = fakeCanvas();
    expect(drawMemoryCard(canvas, { thumb: null, entries: layout.entries }, null)).toBe(true);
    expect(images).toEqual([]);
    expect(cardPlan(layout, true).height).toBeGreaterThan(cardPlan(layout, false).height);
    expect(cardPlan({ thumb: null, entries: [] }, false).height).toBeGreaterThanOrEqual(560);
  });

  it("makes a PNG blob through the injected canvas, and null when the canvas has no 2d context", async () => {
    const good = fakeCanvas();
    const blob = await renderMemoryCardPng(layout, {
      createCanvas: () => good.canvas,
      loadImage: async () => ({ width: 10, height: 10 }),
    });
    expect(blob?.type).toBe("image/png");

    const blind = await renderMemoryCardPng(layout, {
      createCanvas: () => ({ width: 0, height: 0, getContext: () => null, toBlob: (cb) => cb(null) }),
      loadImage: async () => null,
    });
    expect(blind).toBeNull();
  });
});

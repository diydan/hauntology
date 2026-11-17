import { wrapLines } from "@hauntology/shared/app/memory-card";
import { color } from "@hauntology/shared/design/tokens";
import type { CardLayout } from "@hauntology/shared/viewer/card";

/**
 * The memory card as a picture (world-viewer task 9, Requirement 7.1): `layoutMemoryCard`'s
 * found-only, excerpt-capped layout drawn to a canvas and saved as a PNG. A canvas export
 * carries no metadata. Colours come from the design tokens (Requirement 9.3), never literals.
 * Where a canvas or its PNG encoder is unavailable the caller keeps the SVG card instead.
 */
export const CARD_WIDTH = 900;
const MARGIN = 48;
const THUMB_HEIGHT = 340;
const LINE_CHARS = 46;

type Ctx = Pick<CanvasRenderingContext2D, "fillStyle" | "font" | "fillRect" | "strokeRect" | "fillText" | "drawImage" | "strokeStyle" | "lineWidth">;
export type CardCanvas = { width: number; height: number; getContext(kind: "2d"): Ctx | null };
export type CardImage = { width: number; height: number };

const FONT = "'IBM Plex Mono', Menlo, Consolas, monospace";

/** The wrapped lines of every entry, and the card's full height for this layout. */
export function cardPlan(layout: CardLayout, hasThumbImage: boolean): { height: number; blocks: { title: string; lines: string[] }[] } {
  const blocks = layout.entries.map((e) => ({ title: e.title, lines: wrapLines(e.excerpt, LINE_CHARS) }));
  let height = 150 + (hasThumbImage ? THUMB_HEIGHT + 28 : 0);
  for (const b of blocks) height += 34 + b.lines.length * 30 + 22;
  return { height: Math.max(560, height + MARGIN), blocks };
}

/** Draws the layout. `thumb` is the loaded thumbnail image, or null to draw text only. */
export function drawMemoryCard(canvas: CardCanvas, layout: CardLayout, thumb: CardImage | null): boolean {
  const { height, blocks } = cardPlan(layout, thumb !== null);
  canvas.width = CARD_WIDTH;
  canvas.height = height;
  const g = canvas.getContext("2d");
  if (!g) return false;

  g.fillStyle = color.ink;
  g.fillRect(0, 0, CARD_WIDTH, height);
  g.strokeStyle = color.dust;
  g.lineWidth = 3;
  g.strokeRect(18, 18, CARD_WIDTH - 36, height - 36);

  g.fillStyle = color.ghost;
  g.font = `40px ${FONT}`;
  g.fillText("Hauntology", MARGIN, 92);
  g.fillStyle = color.bone;
  g.font = `24px ${FONT}`;
  const n = blocks.length;
  g.fillText(n === 1 ? "One memory came back to you." : `${n} memories came back to you.`, MARGIN, 132);

  let y = 168;
  if (thumb) {
    // Cover-crop the thumbnail into its band.
    const w = CARD_WIDTH - MARGIN * 2, h = THUMB_HEIGHT;
    const scale = Math.max(w / thumb.width, h / thumb.height);
    const sw = w / scale, sh = h / scale;
    g.drawImage(thumb as CanvasImageSource, (thumb.width - sw) / 2, (thumb.height - sh) / 2, sw, sh, MARGIN, y, w, h);
    y += h + 28;
  }
  blocks.forEach((block, i) => {
    g.fillStyle = color.lantern;
    g.font = `24px ${FONT}`;
    g.fillText(String(i + 1), MARGIN, y);
    g.fillStyle = color.bone;
    g.font = `600 26px ${FONT}`;
    g.fillText(block.title, MARGIN + 52, y);
    y += 34;
    g.font = `25px ${FONT}`;
    for (const line of block.lines) {
      g.fillText(line, MARGIN + 52, y);
      y += 30;
    }
    y += 22;
  });
  return true;
}

type RenderDeps = {
  createCanvas?: () => CardCanvas & { toBlob(cb: (b: Blob | null) => void, type: string): void };
  loadImage?: (src: string) => Promise<CardImage | null>;
};

const browserDeps: Required<RenderDeps> = {
  createCanvas: () => document.createElement("canvas"),
  loadImage: (src) =>
    new Promise((resolve) => {
      // A thumbnail that never answers must not hold the card hostage: 2.5 s, then text only.
      const timer = setTimeout(() => resolve(null), 2500);
      const done = (img: CardImage | null) => { clearTimeout(timer); resolve(img); };
      const img = new Image();
      img.onload = () => done(img);
      img.onerror = () => done(null);
      img.src = src;
    }),
};

/** The card as a PNG blob, or null where this browser cannot make one (the caller falls back to the SVG). */
export async function renderMemoryCardPng(layout: CardLayout, deps: RenderDeps = {}): Promise<Blob | null> {
  const { createCanvas, loadImage } = { ...browserDeps, ...deps };
  try {
    const canvas = createCanvas();
    if (!canvas.getContext("2d")) return null;
    const thumb = layout.thumb ? await loadImage(layout.thumb) : null;
    if (!drawMemoryCard(canvas, layout, thumb)) return null;
    return await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob((b) => resolve(b), "image/png");
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

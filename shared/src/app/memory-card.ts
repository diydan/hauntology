/**
 * The memory card: the found memories as one picture the visitor can keep. Pure text in, an SVG
 * string out, with nothing loaded from anywhere (no image, font, script or link), so saving it
 * makes no request. Every piece of text is escaped. The shell uses this until `world-viewer` 9
 * provides the canvas card (`layoutMemoryCard`); the rules are the same: only found memories, each
 * excerpt at most 120 characters.
 *
 * It draws a standalone picture, which cannot read the page's CSS variables, so its colours come from
 * the generated design tokens (design/tokens.json), not from hex written here.
 */
import { color } from "../design/tokens";

export const CARD_EXCERPT_MAX = 120;
export const CARD_MAX_MEMORIES = 3;
const LINE_WIDTH = 34;

export type CardMemory = { anchorId: string; text: string };

/** One line of at most 120 characters: whitespace collapsed, cut at a word, "…" when cut. */
export function cardExcerpt(text: string): string {
  const clean = text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length <= CARD_EXCERPT_MAX) return clean;
  const room = clean.slice(0, CARD_EXCERPT_MAX - 1);
  const cut = room.lastIndexOf(" ");
  return `${(cut > 40 ? room.slice(0, cut) : room).trimEnd()}…`;
}

export function xmlEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Breaks text into lines of at most `width` characters at spaces (a longer word is cut). */
export function wrapLines(text: string, width: number = LINE_WIDTH): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    for (let w = word; w.length > 0; w = w.slice(width)) {
      const piece = w.slice(0, width);
      if (line === "") line = piece;
      else if (line.length + 1 + piece.length <= width) line += ` ${piece}`;
      else {
        lines.push(line);
        line = piece;
      }
      if (w.length <= width) break;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}

export function memoryCardSvg(memories: readonly CardMemory[]): string {
  const shown = memories.slice(0, CARD_MAX_MEMORIES);
  const blocks: string[] = [];
  let y = 150;
  shown.forEach((m, i) => {
    const lines = wrapLines(cardExcerpt(m.text));
    blocks.push(`<text x="40" y="${y}" fill="${color.lantern}" font-size="16">${i + 1}</text>`);
    lines.forEach((line, k) => blocks.push(`<text x="72" y="${y + k * 26}" fill="${color.bone}" font-size="18">${xmlEscape(line)}</text>`));
    y += lines.length * 26 + 36;
  });
  const height = Math.max(400, y + 40);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 ${height}" width="600" height="${height}" role="img" aria-label="Memory card">`,
    `<rect width="600" height="${height}" fill="${color.ink}"/>`,
    `<rect x="12" y="12" width="576" height="${height - 24}" fill="none" stroke="${color.dust}" stroke-width="2"/>`,
    `<g font-family="ui-monospace, Menlo, Consolas, monospace">`,
    `<text x="40" y="70" fill="${color.ghost}" font-size="26">Hauntology</text>`,
    `<text x="40" y="100" fill="${color.bone}" font-size="16">${shown.length === 1 ? "One memory" : `${shown.length} memories`} came back to you.</text>`,
    ...blocks,
    `</g>`,
    `</svg>`,
  ].join("\n");
}

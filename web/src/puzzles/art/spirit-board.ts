import { mulberry32 } from "@hauntology/shared/puzzles/rng";
import { BOARD_H, BOARD_W, LETTERS, LETTER_POS, PLANCHETTE_R } from "../kinds/Board-geometry";
import { bevelRect, rivet, softShadow, speckle, woodGrain, type Ctx } from "./canvas-paint";
import { CANVAS, MATERIAL, shade, tint, withAlpha } from "./palette";

/**
 * The spirit board as an object: an antique talking board of varnished, dark-stained wood with a routed brass inlay, painted letters in three
 * arcs, a sun and a moon, and brass nails; and the planchette, a teardrop of wood with a brass rim and a glass lens in it that magnifies
 * the board under it. The board is painted once into a layer; only the planchette (and the letter it is on) is drawn each frame.
 */
export const BOARD_FONT = "600 25px Georgia, serif";
const W = BOARD_W;
const H = BOARD_H;
const FRAME = 11;

function roundedRect(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Painted lettering, cut into the wood: a shadow below and to the right, a lit edge above and to the left, then the paint. */
function engrave(c: Ctx, text: string, x: number, y: number, paint: string): void {
  c.fillStyle = withAlpha(MATERIAL.dark, 0.7);
  c.fillText(text, x + 1.1, y + 1.5);
  c.fillStyle = withAlpha(tint(MATERIAL.wood, 0.45), 0.35);
  c.fillText(text, x - 0.7, y - 0.9);
  c.fillStyle = paint;
  c.fillText(text, x, y);
}

function sun(c: Ctx, x: number, y: number): void {
  c.strokeStyle = MATERIAL.brass;
  c.lineWidth = 1.7;
  c.lineCap = "round";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    c.beginPath();
    c.moveTo(x + Math.cos(a) * 10.5, y + Math.sin(a) * 10.5);
    c.lineTo(x + Math.cos(a) * (i % 2 === 0 ? 16 : 13.5), y + Math.sin(a) * (i % 2 === 0 ? 16 : 13.5));
    c.stroke();
  }
  const g = c.createRadialGradient(x - 2.5, y - 3, 1, x, y, 9);
  g.addColorStop(0, tint(MATERIAL.brass, 0.6));
  g.addColorStop(0.6, MATERIAL.brass);
  g.addColorStop(1, shade(MATERIAL.brass, 0.5));
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, 8.5, 0, Math.PI * 2);
  c.fill();
}

function moon(c: Ctx, x: number, y: number): void {
  const g = c.createLinearGradient(x - 9, y - 9, x + 9, y + 9);
  g.addColorStop(0, tint(MATERIAL.brass, 0.72));
  g.addColorStop(1, MATERIAL.brass);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, 11, Math.PI * 0.35, Math.PI * 1.65, false);
  c.arc(x + 5.2, y - 0.6, 8.6, Math.PI * 1.55, Math.PI * 0.45, true);
  c.closePath();
  c.fill();
}

/** The whole board, once: the frame, the panel, the inlay, the ornaments, the letters and the nails. */
export function paintBoard(c: Ctx): void {
  const rng = mulberry32(0x5b1d);
  woodGrain(c, rng, 0, 0, W, H, shade(MATERIAL.wood, 0.5), 80);
  // the panel, routed into the frame: shade on its top and left, light on its bottom and right
  c.save();
  roundedRect(c, FRAME, FRAME, W - 2 * FRAME, H - 2 * FRAME, 9);
  c.clip();
  woodGrain(c, rng, FRAME, FRAME, W - 2 * FRAME, H - 2 * FRAME, shade(MATERIAL.wood, 0.3), 110);
  speckle(c, rng, FRAME, FRAME, W - 2 * FRAME, H - 2 * FRAME, 220, MATERIAL.dark, 0.18);
  c.restore();
  bevelRect(c, FRAME - 2, FRAME - 2, W - 2 * FRAME + 4, H - 2 * FRAME + 4, 3, withAlpha(MATERIAL.dark, 0.55), withAlpha(tint(MATERIAL.wood, 0.3), 0.4));
  // a brass line let into the panel, and a thin second one inside it
  c.strokeStyle = withAlpha(MATERIAL.brass, 0.85);
  c.lineWidth = 1.5;
  roundedRect(c, FRAME + 7, FRAME + 7, W - 2 * (FRAME + 7), H - 2 * (FRAME + 7), 6);
  c.stroke();
  c.strokeStyle = withAlpha(MATERIAL.brass, 0.4);
  c.lineWidth = 0.8;
  roundedRect(c, FRAME + 11, FRAME + 11, W - 2 * (FRAME + 11), H - 2 * (FRAME + 11), 4);
  c.stroke();
  // a faint painted guide under each arc of letters
  c.strokeStyle = withAlpha(MATERIAL.brass, 0.3);
  c.lineWidth = 1;
  for (const [a, b] of [[0, 9], [9, 18], [18, 26]] as const) {
    c.beginPath();
    for (let i = a; i < b; i++) {
      const p = LETTER_POS[i];
      if (!p) continue;
      if (i === a) c.moveTo(p.x, p.y + 23);
      else c.lineTo(p.x, p.y + 23);
    }
    c.stroke();
  }
  sun(c, 42, 36);
  moon(c, W - 42, 36);
  c.font = "700 13px Georgia, serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  engrave(c, "YES", 42, H - 27, MATERIAL.ivory);
  engrave(c, "NO", W - 42, H - 27, MATERIAL.ivory);
  c.font = BOARD_FONT;
  for (const p of LETTER_POS) engrave(c, p.ch, p.x, p.y, MATERIAL.ivory);
  for (const [x, y] of [[FRAME + 3, FRAME + 3], [W - FRAME - 3, FRAME + 3], [FRAME + 3, H - FRAME - 3], [W - FRAME - 3, H - FRAME - 3]] as const) rivet(c, x, y, 3.2);
  // lamplight: the middle is bright, the corners fall away
  const v = c.createRadialGradient(W / 2, H / 2, H * 0.22, W / 2, H / 2, H * 0.85);
  v.addColorStop(0, withAlpha(MATERIAL.flame, 0.06));
  v.addColorStop(1, withAlpha(MATERIAL.dark, 0.5));
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
}

/** The letter the planchette is on: lit like a lantern, with a warm glow round it. */
export function paintLitLetter(c: Ctx, letter: string): void {
  const i = LETTERS.indexOf(letter);
  const p = LETTER_POS[i];
  if (!p) return;
  const g = c.createRadialGradient(p.x, p.y, 2, p.x, p.y, 27);
  g.addColorStop(0, withAlpha(MATERIAL.flame, 0.45));
  g.addColorStop(1, withAlpha(MATERIAL.flame, 0));
  c.fillStyle = g;
  c.fillRect(p.x - 27, p.y - 27, 54, 54);
  c.font = BOARD_FONT;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = CANVAS.lit;
  c.fillText(p.ch, p.x, p.y);
}

const LENS_R = 13.5;
const MAGNIFY = 1.1; // the window frames the letter and enlarges it a little: a letter is 25 units wide, so about 24 units show

/** The planchette at (x, y): a soft shadow, a teardrop of wood with a brass rim, and a glass lens that magnifies `under` (the painted board). */
export function paintPlanchette(c: Ctx, x: number, y: number, under: HTMLCanvasElement | null, dpr: number): void {
  const R = PLANCHETTE_R;
  const tipY = y - R * 1.9;
  const a = Math.acos(1 / 1.9);
  softShadow(c, x + 4, y + 8, R * 1.05, R * 0.9, 0.36);
  const silhouette = (): void => {
    c.beginPath();
    c.moveTo(x, tipY);
    c.lineTo(x + R * Math.cos(-Math.PI / 2 + a), y + R * Math.sin(-Math.PI / 2 + a));
    c.arc(x, y, R, -Math.PI / 2 + a, -Math.PI / 2 - a + Math.PI * 2, false);
    c.closePath();
  };
  const body = c.createRadialGradient(x - R * 0.45, y - R * 0.7, 2, x, y, R * 2.1);
  body.addColorStop(0, tint(MATERIAL.wood, 0.3));
  body.addColorStop(0.5, MATERIAL.wood);
  body.addColorStop(1, shade(MATERIAL.wood, 0.55));
  silhouette();
  c.fillStyle = body;
  c.fill();
  silhouette();
  c.lineJoin = "round";
  c.strokeStyle = MATERIAL.brass;
  c.lineWidth = 2.2;
  c.stroke();
  silhouette();
  c.strokeStyle = withAlpha(tint(MATERIAL.brass, 0.6), 0.45);
  c.lineWidth = 0.8;
  c.stroke();
  // the lens: the painted board seen through glass
  c.save();
  c.beginPath();
  c.arc(x, y, LENS_R, 0, Math.PI * 2);
  c.clip();
  const half = LENS_R / MAGNIFY;
  if (under) c.drawImage(under, (x - half) * dpr, (y - half) * dpr, half * 2 * dpr, half * 2 * dpr, x - LENS_R, y - LENS_R, LENS_R * 2, LENS_R * 2);
  c.fillStyle = withAlpha(MATERIAL.glass, 0.16);
  c.fillRect(x - LENS_R, y - LENS_R, LENS_R * 2, LENS_R * 2);
  const sheen = c.createLinearGradient(x - LENS_R, y - LENS_R, x + LENS_R * 0.4, y + LENS_R * 0.6);
  sheen.addColorStop(0, withAlpha(MATERIAL.light, 0.5));
  sheen.addColorStop(0.45, withAlpha(MATERIAL.light, 0.06));
  sheen.addColorStop(1, withAlpha(MATERIAL.light, 0));
  c.fillStyle = sheen;
  c.fillRect(x - LENS_R, y - LENS_R, LENS_R * 2, LENS_R * 2);
  c.restore();
  c.beginPath();
  c.arc(x, y, LENS_R, 0, Math.PI * 2);
  c.strokeStyle = MATERIAL.brass;
  c.lineWidth = 2;
  c.stroke();
  c.beginPath();
  c.arc(x, y, LENS_R - 1.6, 0, Math.PI * 2);
  c.strokeStyle = withAlpha(MATERIAL.dark, 0.45);
  c.lineWidth = 1;
  c.stroke();
}

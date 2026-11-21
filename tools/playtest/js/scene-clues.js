// Scene clues (puzzles Requirement 22): a World Clue or Decoy written by the Host on a blank Place of a footage shot.
// Pure functions: the inputs are the seed, the shot and the Public View, never a card, a Hand, a Residue position or the Solution.

import { boxOf, isConvexQuad } from './places.js';

/** The six Signs of `world-clues`, and their names in words (a Sign is never shown by a mark alone). */
export const SIGNS = Object.freeze(['moon', 'key', 'eye', 'hand', 'star', 'bell']);
export const SIGN_LABELS = Object.freeze({ moon: 'Moon', key: 'Key', eye: 'Eye', hand: 'Hand', star: 'Star', bell: 'Bell' });
const SURFACE_WORDS = Object.freeze({ plate: 'brass plate', pane: 'window pane', page: 'page', plaque: 'plaque' });

/** The tokens `ink` and `bone` of design/tokens.json (relative luminance of #0b0d10 and #e9e4d8). */
export const INK_LUMA = Object.freeze({ ink: 0.004, bone: 0.77 });
export const MIN_CONTRAST = 4.5;
/** The letters of a Scene clue are at least this share of the picture's height (22.6). */
export const MIN_LETTER_SHARE = 0.05;
export const FADES = Object.freeze({ in: 'fade-slow', out: 'fade' });

const hash = (...parts) => {
  let h = 0x811c9dc5;
  for (const ch of parts.map(String).join('␟')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
};

/** The place for a shot, or null: a shot with no Place never carries a Scene clue (22.1). */
export const placeFor = (places, shot) => (places && Object.hasOwn(places, shot) ? places[shot] : null);

/** The contrast ratio of two relative luminances (WCAG). */
export const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * The ink for a surface of brightness `luma`: dark ink (`ink`, blended with `multiply`) on a light surface, light ink (`bone`, `screen`)
 * on a dark one; the one with the better contrast.
 */
export function inkFor(luma) {
  const dark = contrast(luma, INK_LUMA.ink);
  const light = contrast(luma, INK_LUMA.bone);
  return dark >= light ? { ink: 'ink', blend: 'multiply', ratio: dark } : { ink: 'bone', blend: 'screen', ratio: light };
}

/** Whether `ink` (`ink` or `bone`) reads on a surface of brightness `luma` at 4.5 to 1 (22.6). */
export const contrastOk = (luma, ink) => Object.hasOwn(INK_LUMA, ink) && contrast(luma, INK_LUMA[ink]) >= MIN_CONTRAST;

/**
 * The text a clue's Sight gives, or null when it is not text (wires, the shelf and the photo are pictures): a code as spaced digits,
 * a time as H:MM, a knock in words.
 */
export function textOf(sight) {
  if (!sight || typeof sight !== 'object') return null;
  if (sight.kind === 'safe' && Array.isArray(sight.code) && sight.code.length > 0 && sight.code.every(Number.isInteger)) return sight.code.join(' ');
  if (sight.kind === 'clock' && Number.isInteger(sight.h) && Number.isInteger(sight.m)) return `${sight.h}:${String(sight.m).padStart(2, '0')}`;
  if (sight.kind === 'knock' && Array.isArray(sight.groups)) return sight.groups.map((g, i) => (i < sight.groups.length - 1 ? `${g}, ${sight.long === i ? 'long pause' : 'pause'}` : `${g}`)).join(', ');
  return null;
}

/** The letter height, as a share of the picture's height, that `text` can have on `place` on one line, in a picture `aspect` wide for its height. */
export function letterShare(place, text, aspect = 4 / 3) {
  const b = boxOf(place.corners);
  const n = Math.max(1, [...text].length);
  return Math.min(b.h * 0.8, (b.w * aspect) / (n * 0.6));
}

/**
 * The Scene clue for a shot: one of the World Clues or Decoys of the Public View with a text answer, or null. The choice follows the seed, the
 * shot and the view only, and a clue the Place cannot show (ink that does not read, letters too small) is not chosen (22.2, 22.6, 22.8).
 * @returns {{ sign: string, answer: string, text: string, decoy: boolean, zone: string } | null}
 */
export function sceneClue(places, seed, shot, publicView, aspect = 4 / 3) {
  const place = placeFor(places, shot);
  if (place === null) return null;
  const clues = Array.isArray(publicView?.worldClues) ? publicView.worldClues : [];
  const ok = clues
    .map((c) => ({ c, answer: textOf(c?.sight) }))
    .filter(({ c, answer }) => answer !== null && SIGNS.includes(c.sign) && letterShare(place, answer, aspect) >= MIN_LETTER_SHARE && contrastOk(place.luma, inkFor(place.luma).ink))
    .sort((a, b) => (a.c.sign < b.c.sign ? -1 : a.c.sign > b.c.sign ? 1 : a.answer < b.answer ? -1 : 1));
  if (ok.length === 0) return null;
  const pick = ok[hash(seed, shot, ok.map((x) => `${x.c.sign}:${x.answer}`).join('|')) % ok.length];
  return { sign: pick.c.sign, answer: pick.answer, text: pick.answer, decoy: pick.c.decoy === true, zone: String(pick.c.zone ?? '') };
}

/**
 * How a Scene clue is drawn. Everything here comes from the Place, so a Decoy and a clue on the same Place are drawn alike: the Sign and the
 * answer are all that differ, and `decoy` is not read (22.8).
 */
export function drawSpec(place, clue, { reducedMotion = false, aspect = 4 / 3 } = {}) {
  const ink = inkFor(place.luma);
  return {
    surface: place.surface,
    ink: ink.ink,
    blend: ink.blend,
    font: place.ink === 'engraved' ? 'IBM Plex Mono' : 'Newsreader italic',
    fontStyle: place.ink === 'engraved' ? 'normal' : 'italic',
    letterShare: letterShare(place, clue.answer, aspect),
    from: place.from,
    fadeIn: reducedMotion ? null : FADES.in,
    fadeOut: reducedMotion ? null : FADES.out,
    flash: false,
    moves: false,
  };
}

/** The words of a Scene clue for the Clue list and the live region (22.7). */
export function clueWords(place, clue) {
  const spaced = clue.answer;
  return {
    list: `${SIGN_LABELS[clue.sign]}: ${spaced}`,
    live: `A clue is written on the ${SURFACE_WORDS[place.surface]}: the ${clue.sign}, ${spaced.replace(/:/g, ' ')}.`,
  };
}

/** What the screen shows for a footage state: the overlay only when footage plays and the shot has a Place; the panel and the Clue list always (22.7). */
export function sceneClueView(place, clue, state) {
  const words = clueWords(place, clue);
  const overlay = state === 'on';
  return { overlay, panel: words.list, clueList: words.list, live: words.live, panelAtOnce: !overlay };
}

/** Solves the 8 unknowns of the homography that takes the points `from` to the points `to` (four of each). */
function homography(from, to) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i];
    const [u, v] = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let col = 0; col < 8; col++) { // Gaussian elimination with partial pivoting
    let piv = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv], A[col]]; [b[col], b[piv]] = [b[piv], b[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let k = col; k < 8; k++) A[r][k] -= f * A[col][k];
      b[r] -= f * b[col];
    }
  }
  return b.map((v, i) => v / A[i][i]);
}

/**
 * The four-point transform that lays a canvas of `w` by `h` pixels on the Place, in a picture of `pw` by `ph` pixels, as a CSS `matrix3d`
 * (transform-origin 0 0). Null for a flat, crossed or out-of-range shape (22.4).
 * @returns {{ css: string, matrix: number[], map: (x: number, y: number) => [number, number] } | null}
 */
export function fitToPlace(corners, w, h, pw, ph) {
  if (!isConvexQuad(corners) || ![w, h, pw, ph].every((n) => Number.isFinite(n) && n > 0)) return null;
  const from = [[0, 0], [w, 0], [w, h], [0, h]];
  const to = corners.map(([x, y]) => [x * pw, y * ph]);
  const s = homography(from, to);
  if (s === null) return null;
  const [a, b, c, d, e, f, g, hh] = s;
  const matrix = [a, d, 0, g, b, e, 0, hh, 0, 0, 1, 0, c, f, 0, 1];
  const map = (x, y) => { const k = g * x + hh * y + 1; return [(a * x + b * y + c) / k, (d * x + e * y + f) / k]; };
  return { css: `matrix3d(${matrix.join(',')})`, matrix, map };
}

/** The hex of the two inks (tokens `ink` and `bone`, no hue). */
export const INK_COLOURS = Object.freeze({ ink: '#0b0d10', bone: '#e9e4d8' });

/** The canvas size for a Place in a picture of `pw` by `ph` pixels: the Place's own box at the clip's own pixel size, so it is no sharper than the clip (22.4). */
export function canvasSizeFor(place, pw, ph) {
  const b = boxOf(place.corners);
  return { w: Math.max(1, Math.round(b.w * pw)), h: Math.max(1, Math.round(b.h * ph)) };
}

/**
 * Paints the clue's words on a transparent canvas, in the ink of the Place and the font of its surface, centred and sized so that the letters are
 * `spec.letterShare` of the picture's height. The canvas is then laid on the Place by `fitToPlace` and blended with `spec.blend` by the page.
 * Returns what it drew, for the tests.
 */
export function drawClue(ctx, clue, place, pw, ph, opts = {}) {
  const spec = drawSpec(place, clue, opts);
  const { w, h } = canvasSizeFor(place, pw, ph);
  const px = Math.max(1, Math.round(spec.letterShare * ph));
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.font = `${spec.fontStyle === 'italic' ? 'italic ' : ''}${px}px "${spec.font === 'IBM Plex Mono' ? 'IBM Plex Mono' : 'Newsreader'}"`;
  ctx.fillStyle = INK_COLOURS[spec.ink];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(clue.answer, w / 2, h / 2);
  return { w, h, px, text: clue.answer, ink: spec.ink, blend: spec.blend };
}

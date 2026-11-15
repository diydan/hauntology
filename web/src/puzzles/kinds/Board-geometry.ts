/** Where the letters of the Spirit board sit, and the distances the planchette works with. Logical units; the canvas is scaled by CSS. */
export const BOARD_W = 340;
export const BOARD_H = 310;
export const LETTERS: readonly string[] = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const ROWS: ReadonlyArray<readonly [number, number]> = [[0, 9], [9, 18], [18, 26]]; // A to I, J to R, S to Z

export type LetterPos = Readonly<{ ch: string; x: number; y: number }>;
/** Three gentle arcs, spaced for a thumb. */
export const LETTER_POS: readonly LetterPos[] = LETTERS.map((ch, i) => {
  const r = ROWS.findIndex(([a, b]) => i >= a && i < b);
  const [a, b] = ROWS[r] ?? [0, 1];
  const t = (i - a) / (b - a - 1);
  return { ch, x: 30 + t * 280, y: 78 + r * 82 - 16 * Math.sin(Math.PI * t) };
});

/** The planchette. */
export const PLANCHETTE_R = 20;
export const START = { x: BOARD_W / 2, y: BOARD_H - 30 } as const;
/** A letter is "under" the planchette within this distance; letters pull a slow planchette in within MAGNET_PX. */
export const NEAR_PX = 26;
export const TAP_PX = 28;
export const UNDER_PX = 40;
export const MAGNET_PX = 36;
export const MAGNET_PULL = 16;
export const MAGNET_MAX_SPEED = 150;
export const REST_SPEED = 45;
export const DRAG_SLOP = 10;

/** The nearest letter to a point within `max`, or null. */
export function nearestLetter(x: number, y: number, max: number): LetterPos | null {
  let best: LetterPos | null = null;
  let bestDist = max;
  for (const p of LETTER_POS) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestDist) { best = p; bestDist = d; }
  }
  return best;
}

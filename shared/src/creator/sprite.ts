/**
 * Sprite validation (ghost-creator task 1.8, Requirement 4.2): after background removal the
 * subject must cover a sane share of the frame and keep clear of the left and right edges,
 * or the cut-out is retried once and then a Preset Ghost stands in.
 */
export type AlphaMask = { width: number; height: number; alpha: Uint8Array };

export const SPRITE_COVERAGE: readonly [number, number] = [0.08, 0.85];
export const SPRITE_EDGE_MARGIN = 0.02;

export type SpriteVerdict = { ok: boolean; coverage: number; leftMargin: number; rightMargin: number };

/** Coverage and edge margins of the non-zero alpha, as fractions (0 when the mask is empty or malformed). */
export function spriteMeasure(mask: AlphaMask): Omit<SpriteVerdict, "ok"> {
  const { width, height, alpha } = mask;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || alpha.length !== width * height) {
    return { coverage: 0, leftMargin: 0, rightMargin: 0 };
  }
  let covered = 0;
  let minX = width, maxX = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((alpha[y * width + x] ?? 0) > 0) {
        covered++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  if (covered === 0) return { coverage: 0, leftMargin: 0, rightMargin: 0 };
  return { coverage: covered / (width * height), leftMargin: minX / width, rightMargin: (width - 1 - maxX) / width };
}

export function validateSprite(mask: AlphaMask): boolean {
  const m = spriteMeasure(mask);
  return m.coverage >= SPRITE_COVERAGE[0] && m.coverage <= SPRITE_COVERAGE[1] && m.leftMargin >= SPRITE_EDGE_MARGIN && m.rightMargin >= SPRITE_EDGE_MARGIN;
}

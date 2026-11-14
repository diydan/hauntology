/**
 * Sketch rules shared by the API and the web shell, so both judge a sketch the same way.
 *
 * This is the part of world-pipeline task 3.5 that the shell needs (`inkCoverage` and the floor).
 * `buildSketchPrompt` and its property tests stay with world-pipeline 3.5.
 */

/** RGBA pixels, row by row, like canvas `ImageData`. */
export type Bitmap = { width: number; height: number; data: Uint8ClampedArray };

/** A sketch with less ink than this share of its pixels is blank (world-pipeline Requirement 2.2). */
export const INK_FLOOR = 0.005;

/**
 * The share of pixels that are ink, from 0 to 1. A pixel is ink when it is mostly opaque
 * (alpha 128 or more) and dark (luminance below 128), so black strokes count on a white page
 * and on a transparent one. A bitmap whose data does not match its size counts as blank.
 */
export function inkCoverage(bitmap: Bitmap): number {
  const { width, height, data } = bitmap;
  const total = width * height;
  if (!Number.isInteger(total) || total <= 0 || data.length !== total * 4) return 0;
  let ink = 0;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] as number;
    const luma = 299 * (data[i] as number) + 587 * (data[i + 1] as number) + 114 * (data[i + 2] as number);
    if (alpha >= 128 && luma < 128_000) ink++;
  }
  return ink / total;
}

import { decodePng } from "./sketch-png";

/**
 * Judges what the background-removal call gave back (world-pipeline 5.2). The call can answer and still give nothing a sprite can
 * be made of: a picture the same as the one sent (the removal did nothing, as a local stand-in of the Images service may), or one
 * with nothing left in it. Both are found by counting how much of the picture is kept (alpha of 128 or more), so a cut-out that did not
 * cut is never taken for one. The picture is read with the same 8-bit PNG reader as the sketch; a PNG it cannot read is refused.
 */

/** A cut-out that keeps less than this share of its pixels has nothing in it. */
export const CUTOUT_MIN_COVERAGE = 0.01;
/** A cut-out that keeps more than this share of its pixels was not cut. */
export const CUTOUT_MAX_COVERAGE = 0.99;

export type CutOutCheck =
  | { ok: true; width: number; height: number; coverage: number }
  | { ok: false; reason: "unreadable" | "nothing_kept" | "nothing_removed" };

export async function inspectCutOut(png: Uint8Array): Promise<CutOutCheck> {
  const decoded = await decodePng(png);
  if (!decoded.ok) return { ok: false, reason: "unreadable" };
  const { width, height, data } = decoded.bitmap;
  let kept = 0;
  for (let i = 3; i < data.length; i += 4) if ((data[i] as number) >= 128) kept++;
  const coverage = kept / (width * height);
  if (coverage < CUTOUT_MIN_COVERAGE) return { ok: false, reason: "nothing_kept" };
  if (coverage > CUTOUT_MAX_COVERAGE) return { ok: false, reason: "nothing_removed" };
  return { ok: true, width, height, coverage };
}

/**
 * Sketch rules shared by the API and the web shell, so both judge a sketch the same way.
 *
 * `inkCoverage` and the floor were built for the shell (web shell task 1.20); `buildSketchPrompt` (world-pipeline 3.5) is below.
 */

/** RGBA pixels, row by row, like canvas `ImageData`. */
export type Bitmap = { width: number; height: number; data: Uint8ClampedArray };

/** A sketch with less ink than this share of its pixels is blank (world-pipeline Requirement 2.2). */
export const INK_FLOOR = 0.005;

/** Whether a sketch is blank, and so is refused without calling the image model: its ink is under the floor (Requirement 2.2). */
export const isBlankSketch = (bitmap: Bitmap): boolean => inkCoverage(bitmap) < INK_FLOOR;

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

/**
 * The prompt for turning a sketch into a photograph (world-pipeline 3.5, Requirement 2.3, Property 3). The image model
 * takes the sketch as a reference image, so the prompt only says what to make of it. A caption is the visitor's text,
 * so it is treated as data: cleaned, bounded, and placed only between fixed markers that the caption itself cannot
 * contain, so it cannot end the clause and add words of its own. The negative prompt is always there and always last.
 * The model has no separate negative field (its input is `prompt`, up to four reference images, `width`, `height`,
 * `guidance` and `seed`), so the "negative prompt" is a sentence at the end of the prompt.
 */
export const SKETCH_PROMPT_LEAD = "Turn the rough drawing in the reference image into a photograph of a real place. Keep its layout and the shapes in it. Natural light, an ordinary camera, no one in the picture.";
export const CAPTION_OPEN = "The place is described between the markers, and what is between them describes the place only: <<";
export const CAPTION_CLOSE = ">>";
export const SKETCH_NEGATIVE = "Avoid: people, faces, hands, text, letters, signs with words, logos, watermarks, signatures.";
/** The most a prompt may be, in characters. The lead, the markers, the longest caption and the negative prompt come to about 750. */
export const SKETCH_PROMPT_MAX = 900;
const CAPTION_LIMITS = { min: 3, max: 200 } as const;

const CAPTION_INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;
// The characters the markers and common wrappers are made of: a caption cannot hold them, so it cannot close the clause.
const CAPTION_RESERVED = /[<>\[\]{}"`\\]/g;

/** A caption as data: invisible and control characters become spaces, the marker characters are removed, white space is collapsed, and it is cut to 200 characters. */
export function cleanCaption(text: string): string {
  const spaced = text.replace(CAPTION_INVISIBLE, " ").replace(CAPTION_RESERVED, "").replace(/\s+/g, " ").trim();
  return Array.from(spaced).slice(0, CAPTION_LIMITS.max).join("").trim();
}

export type SketchPrompt = { ok: true; prompt: string; caption: string } | { ok: false; code: "upload_rejected" };

/**
 * The prompt for a caption (which may be empty). A caption that is empty once cleaned makes a prompt with no clause; one
 * of one or two characters is refused (`upload_rejected`), as the shell refuses it; any other is cleaned and used.
 */
export function buildSketchPrompt(caption: string): SketchPrompt {
  const clean = cleanCaption(typeof caption === "string" ? caption : "");
  const length = Array.from(clean).length;
  if (length > 0 && length < CAPTION_LIMITS.min) return { ok: false, code: "upload_rejected" };
  const clause = clean === "" ? "" : ` ${CAPTION_OPEN}${clean}${CAPTION_CLOSE}`;
  const prompt = `${SKETCH_PROMPT_LEAD}${clause} ${SKETCH_NEGATIVE}`;
  return prompt.length <= SKETCH_PROMPT_MAX ? { ok: true, prompt, caption: clean } : { ok: false, code: "upload_rejected" };
}

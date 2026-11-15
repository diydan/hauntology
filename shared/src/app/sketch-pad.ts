/**
 * The Sketch Pad's drawing model (shell Requirements 2.1, 2.4, 2.8). The tool rules are those of
 * `world-pipeline` Requirement 2.1 (brush, eraser, three sizes, undo and redo of at least 30 steps,
 * clear): this file is their pure part, a list of strokes with a history. It draws nothing and reads no
 * canvas; the web shell replays the strokes on a canvas. It lives in memory only, never in storage.
 */

export type PadTool = "brush" | "eraser";
export type PadSize = "small" | "medium" | "large";
export const PAD_SIZES: readonly PadSize[] = ["small", "medium", "large"];
export const PAD_TOOLS: readonly PadTool[] = ["brush", "eraser"];

/** Brush widths on the pad's own canvas, which is `PAD_WIDTH` by `PAD_HEIGHT`. */
export const PAD_WIDTHS: Record<PadSize, number> = { small: 4, medium: 10, large: 22 };
export const PAD_WIDTH = 640;
export const PAD_HEIGHT = 480;
/** The longest side of the picture sent to the API (Requirement 2.3). */
export const SKETCH_MAX_SIDE = 512;

/** How many steps can be undone. The rule is at least 30. */
export const UNDO_STEPS = 50;
/** A stroke keeps at most this many points, so one long scribble cannot grow without end. */
export const MAX_STROKE_POINTS = 4000;

export type Point = readonly [number, number];
export type Stroke = { tool: PadTool; width: number; points: readonly Point[] };

/** The strokes now on the page, and the pages before and after it. A step is one stroke or one clear. */
export type PadHistory = { past: readonly (readonly Stroke[])[]; present: readonly Stroke[]; future: readonly (readonly Stroke[])[] };

export const emptyHistory: PadHistory = { past: [], present: [], future: [] };

/** A point kept on the page, to one decimal. */
export const clampPoint = (x: number, y: number, width = PAD_WIDTH, height = PAD_HEIGHT): Point => {
  const cx = Number.isFinite(x) ? Math.min(width, Math.max(0, x)) : 0;
  const cy = Number.isFinite(y) ? Math.min(height, Math.max(0, y)) : 0;
  return [Math.round(cx * 10) / 10, Math.round(cy * 10) / 10];
};

/** A stroke as drawn: its width comes from the size, and the points are cut to the cap. */
export function makeStroke(tool: PadTool, size: PadSize, points: readonly Point[]): Stroke {
  return { tool, width: PAD_WIDTHS[size], points: points.slice(0, MAX_STROKE_POINTS) };
}

const push = (past: readonly (readonly Stroke[])[], page: readonly Stroke[]): readonly (readonly Stroke[])[] => [...past, page].slice(-UNDO_STEPS);

/** A finished stroke is a new step. A stroke with no points changes nothing. A new step ends any redo. */
export function commitStroke(h: PadHistory, stroke: Stroke): PadHistory {
  if (stroke.points.length === 0) return h;
  return { past: push(h.past, h.present), present: [...h.present, stroke], future: [] };
}

/** Clear is a step too, so it can be undone. Clearing an empty page does nothing. */
export function clearPage(h: PadHistory): PadHistory {
  if (h.present.length === 0) return h;
  return { past: push(h.past, h.present), present: [], future: [] };
}

export const canUndo = (h: PadHistory): boolean => h.past.length > 0;
export const canRedo = (h: PadHistory): boolean => h.future.length > 0;

export function undo(h: PadHistory): PadHistory {
  const page = h.past[h.past.length - 1];
  if (page === undefined) return h;
  return { past: h.past.slice(0, -1), present: page, future: [h.present, ...h.future] };
}

export function redo(h: PadHistory): PadHistory {
  const page = h.future[0];
  if (page === undefined) return h;
  return { past: push(h.past, h.present), present: page, future: h.future.slice(1) };
}

// --- "Make it real" ---------------------------------------------------------------------------

/** The caption, when there is one, is 3 to 200 characters (`world-pipeline` Requirement 2.3). It is optional. */
export const CAPTION_MIN = 3;
export const CAPTION_MAX = 200;

/** `true` when the caption is not empty but too short. An empty caption is fine. */
export const captionTooShort = (caption: string): boolean => {
  const n = caption.trim().length;
  return n > 0 && n < CAPTION_MIN;
};

export const INK_REASON = "Draw a little more first. The page is almost empty.";
export const CAPTION_REASON = "A caption needs at least 3 characters, or leave it empty.";

export type MakeItRealGate = { enabled: true } | { enabled: false; reason: string };

/**
 * Whether "Make it real" is on, and if not, the one line that says why. The order is: the world switch
 * and the image quota (`drawReason`, from `capabilities`), then the ink floor (`ink`, the answer of
 * `inkGate`), then the caption.
 */
export function makeItRealGate(input: { drawReason: string | null; ink: { enabled: boolean }; caption: string }): MakeItRealGate {
  if (input.drawReason !== null) return { enabled: false, reason: input.drawReason };
  if (!input.ink.enabled) return { enabled: false, reason: INK_REASON };
  if (captionTooShort(input.caption)) return { enabled: false, reason: CAPTION_REASON };
  return { enabled: true };
}

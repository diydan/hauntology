/**
 * Frame budget and view-mode plan for the Spirit table (spirit-table 4.3, 6.1): at most 30 frames a second,
 * paused when face down or hidden, sensors when available and Tilt is on, drag otherwise, list when WebGL is missing,
 * and still under reduced motion.
 */
export const MAX_TABLE_FPS = 30;
export const MIN_FRAME_MS = Math.ceil(1000 / MAX_TABLE_FPS); // 34 ms (>= 33 ms and strictly <= 30 fps)

export type TableViewMode = "sensors" | "drag" | "list";

export type TablePlanInput = Readonly<{
  sensors: boolean;
  tilt?: boolean;
  faceDown: boolean;
  hidden: boolean;
  reducedMotion: boolean;
  webgl: boolean;
  now: number;
  lastDrawMs?: number;
}>;

export type TablePlan = Readonly<{
  draw: boolean;
  frameMs: number;
  view: TableViewMode;
  still: boolean;
}>;

export function tablePlan(i: TablePlanInput): TablePlan {
  const view: TableViewMode = !i.webgl ? "list" : i.sensors && (i.tilt ?? true) ? "sensors" : "drag";
  const elapsedOk =
    i.lastDrawMs === undefined ||
    !Number.isFinite(i.lastDrawMs) ||
    !Number.isFinite(i.now) ||
    i.now - i.lastDrawMs >= MIN_FRAME_MS;
  const draw = Boolean(i.webgl && !i.faceDown && !i.hidden && elapsedOk);
  return {
    draw,
    frameMs: MIN_FRAME_MS,
    view,
    still: Boolean(i.reducedMotion),
  };
}

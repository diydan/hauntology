import type { WorldManifest } from "@hauntology/shared/world/manifest";
import { assetUrl } from "@hauntology/shared/viewer/loader";

/**
 * `PanoFallback` (world-viewer 3.2, Requirement 1.2): the place as a flat picture the visitor can pan, for a device that cannot run WebGL2 at all (so not
 * even the panorama sphere of the three renderer can be used). It tries the panorama, then the thumbnail, and says so in words when neither opens. It is plain
 * DOM: an image in a frame that pans by dragging or with the arrow keys, labelled for a screen reader. The chat is the shell's and stays mounted at every rung.
 */
export type PanoRung = "pano" | "thumb";

/** The pictures to try, best first: the panorama, then the thumbnail. */
export function panoLadder(manifest: Pick<WorldManifest, "id" | "assets">): { rung: PanoRung; url: string }[] {
  const out: { rung: PanoRung; url: string }[] = [];
  if (manifest.assets.pano) out.push({ rung: "pano", url: assetUrl(manifest.id, manifest.assets.pano.path) });
  if (manifest.assets.thumb) out.push({ rung: "thumb", url: assetUrl(manifest.id, manifest.assets.thumb.path) });
  return out;
}

/** The pan position (0 to 1) after a drag or key step, kept inside the picture. */
export function panBy(pos: number, deltaPx: number, widthPx: number): number {
  const w = widthPx > 0 && Number.isFinite(widthPx) ? widthPx : 1;
  const next = (Number.isFinite(pos) ? pos : 0.5) - (Number.isFinite(deltaPx) ? deltaPx : 0) / w;
  return Math.min(1, Math.max(0, next));
}

export const PAN_KEY_STEP = 0.05;

export type PanoHandle = Readonly<{ dispose(): void; rung(): PanoRung | null }>;

/** Draws the ladder's first picture that opens into `container`. Calls `onFail` once when none does. */
export function mountPanoFallback(container: HTMLElement, ladder: readonly { rung: PanoRung; url: string }[], label: string, onFail: () => void, makeImage: () => HTMLImageElement = () => new Image()): PanoHandle {
  const frame = document.createElement("div");
  frame.className = "ui-viewer-stage";
  frame.tabIndex = 0;
  frame.setAttribute("role", "img");
  frame.setAttribute("aria-label", label);
  frame.dataset.panoFallback = "";
  frame.style.overflow = "hidden";
  const img = makeImage();
  img.alt = "";
  img.draggable = false;
  img.style.cssText = "height:100%;width:auto;min-width:100%;object-fit:cover;user-select:none;pointer-events:none;";
  frame.append(img);
  container.append(frame);

  let pos = 0.5;
  let current: PanoRung | null = null;
  let dead = false;
  const apply = () => { img.style.objectPosition = `${(pos * 100).toFixed(1)}% 50%`; img.style.transform = "none"; };
  const next = (i: number): void => {
    const step = ladder[i];
    if (dead) return;
    if (step === undefined) { current = null; frame.remove(); onFail(); return; }
    img.onload = () => { current = step.rung; apply(); };
    img.onerror = () => next(i + 1);
    img.src = step.url;
  };
  next(0);

  let drag: { x: number } | null = null;
  const down = (e: PointerEvent) => { drag = { x: e.clientX }; };
  const move = (e: PointerEvent) => { if (drag === null) return; pos = panBy(pos, e.clientX - drag.x, frame.clientWidth); drag = { x: e.clientX }; apply(); };
  const up = () => { drag = null; };
  const key = (e: KeyboardEvent) => {
    if (e.code === "ArrowLeft") pos = Math.max(0, pos - PAN_KEY_STEP);
    else if (e.code === "ArrowRight") pos = Math.min(1, pos + PAN_KEY_STEP);
    else return;
    e.preventDefault();
    apply();
  };
  frame.addEventListener("pointerdown", down);
  frame.addEventListener("pointermove", move);
  frame.addEventListener("pointerup", up);
  frame.addEventListener("pointercancel", up);
  frame.addEventListener("keydown", key);

  return { rung: () => current, dispose() { dead = true; frame.remove(); } };
}

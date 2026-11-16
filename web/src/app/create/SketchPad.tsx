import {
  CAPTION_MAX, PAD_HEIGHT, PAD_SIZES, PAD_TOOLS, PAD_WIDTH, SKETCH_MAX_SIDE, canRedo, canUndo, clampPoint, clearPage, commitStroke, makeItRealGate,
  makeStroke, redo, undo, type PadHistory, type PadSize, type PadTool, type Point,
} from "@hauntology/shared/app/sketch-pad";
import { inkGate } from "@hauntology/shared/app/sketch-size";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useShell } from "../context";
import type { SketchSurface } from "./surface";

/**
 * The Sketch Pad (Requirements 2.1, 2.2, 2.4, 2.8). A canvas with pointer events and `touch-action: none`,
 * so a finger draws instead of scrolling or zooming. The tools are those of `world-pipeline` 2.1, kept
 * as a pure history (`shared/src/app/sketch-pad.ts`); the strokes live in memory in the Screen that owns
 * `history`, and never in storage, a cookie or a request. "Make it real" is off, with its one line of
 * reason, while the ink is below the floor (`inkGate`, the function the API uses), while the world switch
 * or the image quota says no, or while a caption is too short.
 *
 * The pad is a pointer tool and says so. A visitor who cannot use one has the photo picker and the
 * Gallery, which are before it on the page, so Tab reaches them first.
 */
type Props = {
  history: PadHistory;
  onHistory: (next: PadHistory) => void;
  caption: string;
  onCaption: (caption: string) => void;
  /** Why drawing is off (the world switch or the image quota), or `null`. */
  drawReason: string | null;
  /** A request is running, or the last one asked to wait. */
  busy: boolean;
  /** Seconds to wait after a rate limit, or 0. */
  waitSeconds: number;
  onMake: (sketch: Blob, caption: string) => void;
};

const SIZE_LABEL: Record<PadSize, string> = { small: "Small", medium: "Medium", large: "Large" };
const TOOL_LABEL: Record<PadTool, string> = { brush: "Brush", eraser: "Eraser" };

export function SketchPad({ history, onHistory, caption, onCaption, drawReason, busy, waitSeconds, onMake }: Props) {
  const { platform } = useShell();
  const canvas = useRef<HTMLCanvasElement>(null);
  const surface = useRef<SketchSurface | null>(null);
  const live = useRef<{ id: number; points: Point[]; tool: PadTool; size: PadSize } | null>(null);
  const making = useRef(false);
  const [tool, setTool] = useState<PadTool>("brush");
  const [size, setSize] = useState<PadSize>("medium");
  const [ink, setInk] = useState<{ enabled: boolean; coverage: number }>({ enabled: false, coverage: 0 });
  const [note, setNote] = useState<string | null>(null);

  // The surface is made once, and the page painted from the history whenever it changes (an undo, a redo, a clear, a finished stroke, or the pad opening again).
  useEffect(() => {
    if (canvas.current === null) return;
    surface.current ??= platform.surface(canvas.current);
    surface.current.redraw(history.present);
    setInk(inkGate(surface.current.bitmap()));
  }, [history.present, platform]);

  const pointOf = (e: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = rect.width > 0 ? PAD_WIDTH / rect.width : 1;
    const sy = rect.height > 0 ? PAD_HEIGHT / rect.height : 1;
    return clampPoint((e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy);
  };

  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (busy || live.current !== null || surface.current === null) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const first = pointOf(e);
    live.current = { id: e.pointerId, points: [first], tool, size };
    surface.current.extend(makeStroke(tool, size, [first]), 0);
  };

  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = live.current;
    if (s === null || s.id !== e.pointerId || surface.current === null) return;
    s.points.push(pointOf(e));
    surface.current.extend(makeStroke(s.tool, s.size, s.points), s.points.length - 1);
  };

  const finish = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = live.current;
    if (s === null || s.id !== e.pointerId) return;
    live.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    onHistory(commitStroke(history, makeStroke(s.tool, s.size, s.points)));
  };

  const gate = makeItRealGate({ drawReason, ink, caption });
  const waiting = waitSeconds > 0;
  const on = gate.enabled && !busy && !waiting;

  const make = async () => {
    // A second press while the picture is being made would make it twice.
    if (!on || surface.current === null || making.current) return;
    making.current = true;
    setNote(null);
    const png = await surface.current.png(SKETCH_MAX_SIDE);
    making.current = false;
    if (png === null) {
      setNote("Your browser could not make a picture of the page. Try again.");
      return;
    }
    onMake(png, caption.trim());
  };

  const reason = !gate.enabled ? gate.reason : waiting ? `Try again in ${waitSeconds}.` : null;
  return (
    <section className="sketch-pad ui-stack" aria-labelledby="pad-title">
      <h2 className="ui-heading" id="pad-title">Draw a place</h2>
      <p id="pad-help">
        This is a pointer tool: draw with a mouse, a finger or a pen. If you cannot use one, upload a photo or visit the Gallery instead.
      </p>

      <div className="pad-tools ui-row" role="toolbar" aria-label="Drawing tools">
        {PAD_TOOLS.map((t) => (
          <button key={t} type="button" className="ui-button" aria-pressed={tool === t} onClick={() => setTool(t)}>
            {TOOL_LABEL[t]}
          </button>
        ))}
        {PAD_SIZES.map((s) => (
          <button key={s} type="button" className="ui-button" aria-pressed={size === s} aria-label={`${SIZE_LABEL[s]} size`} onClick={() => setSize(s)}>
            {SIZE_LABEL[s]}
          </button>
        ))}
        <button type="button" className="ui-button" disabled={!canUndo(history) || busy} onClick={() => onHistory(undo(history))}>
          Undo
        </button>
        <button type="button" className="ui-button" disabled={!canRedo(history) || busy} onClick={() => onHistory(redo(history))}>
          Redo
        </button>
        <button type="button" className="ui-button" disabled={history.present.length === 0 || busy} onClick={() => onHistory(clearPage(history))}>
          Clear
        </button>
      </div>

      <figure className="ui-figure pad-frame">
      <canvas
        ref={canvas}
        className="pad-canvas"
        width={PAD_WIDTH}
        height={PAD_HEIGHT}
        role="img"
        aria-label="Drawing pad"
        aria-describedby="pad-help"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
      </figure>

      <p>
        <label className="ui-stack ui-stack--tight">
          Caption (optional)
          <input className="ui-input" type="text" value={caption} maxLength={CAPTION_MAX} onChange={(e) => onCaption(e.target.value)} aria-describedby="pad-count" />
        </label>{" "}
        <small id="pad-count">
          {caption.length} of {CAPTION_MAX}
        </small>
      </p>

      <p>
        <button className="ui-button ui-button--primary" type="button" aria-disabled={on ? undefined : "true"} aria-describedby={reason ? "pad-reason" : undefined} onClick={() => void make()}>
          {busy ? "Making it real…" : "Make it real"}
        </button>
      </p>
      {reason ? (
        <p id="pad-reason" className="ui-note is-warn">
          {reason}
        </p>
      ) : null}
      {note ? <p className="ui-note is-warn">{note}</p> : null}
    </section>
  );
}

import { useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { hash, mulberry32, range, shuffle } from "@hauntology/shared/puzzles/rng";
import { CELL, PictureSvg } from "../art/Picture";
import { useLatest } from "../hooks";
import type { KindProps } from "./types";
import "./Photo.css";

/** The board is drawn in these units and scaled by CSS: the frame on top, the tray of loose pieces below it. */
const GAP = 24;
const INSET = 4;
/** A drop whose piece middle is within this many units of a frame spot's middle goes into that spot. */
const RANGE = 62;
/** A finger that moves less than this many screen pixels between down and up made a tap, not a drag. */
const SLOP = 8;

type Model = Readonly<{
  /** The frame spot each piece is in, or null while it is in the tray. */
  slot: ReadonlyArray<number | null>;
  /** How many quarter turns the Player has given each piece (not reduced: the picture turns the same way round). */
  spins: readonly number[];
  /** The piece picked for the no-drag path (and the one Turn turns). */
  picked: number | null;
}>;
type Drag = { piece: number; sx: number; sy: number; cx: number; cy: number; moved: boolean; el: HTMLElement };

/** Pieces trade places: the one that was in `slot` goes where `p` came from (a spot, or the tray). */
function placed(m: Model, p: number, slot: number): Model {
  const slots = m.slot.slice();
  const other = slots.findIndex((s, q) => q !== p && s === slot);
  if (other >= 0) slots[other] = slots[p] ?? null;
  slots[p] = slot;
  return { ...m, slot: slots, picked: p };
}
const traySlot = (m: Model, p: number): Model => ({ ...m, slot: m.slot.map((s, q) => (q === p ? null : s)), picked: p });
const turned = (m: Model, p: number): Model => ({ ...m, spins: m.spins.map((n, q) => (q === p ? n + 1 : n)), picked: p });

/**
 * Torn photo: the picture you saw is torn into pieces and every piece is turned. Turn the pieces and put each in its place
 * in the frame. Drag a piece to move it; tap a piece to pick it and tap it again (or press Turn) to turn it; tap an empty
 * spot to put the picked piece there. The phone clicks when a piece fits (right spot, right way up).
 */
export default function Photo({ view, feel, reducedMotion, submit, announce }: KindProps<"photo">) {
  const { cols, rows } = view;
  const n = cols * rows;
  const W = cols * CELL;
  const H = rows * CELL * 2 + GAP;
  const [model, setModel] = useState<Model>(() => ({ slot: Array.from({ length: n }, () => null), spins: Array.from({ length: n }, () => 0), picked: null }));
  const [dragging, setDragging] = useState<number | null>(null);
  const latest = useLatest({ model });
  const mount = useId().replace(/:/g, "");
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  // Where each loose piece rests in the tray: shuffled the same way every time for one photo, and never in frame order.
  const home = useMemo(() => {
    let order: number[] = range(n);
    for (let salt = 0; salt < 20; salt++) {
      order = shuffle(mulberry32(hash("tray", salt, cols, rows, view.picture.top, ...view.turns0)), range(n));
      if (order.some((p, i) => p !== i)) break;
    }
    const at: number[] = [];
    order.forEach((p, i) => { at[p] = i; });
    return at;
  }, [n, cols, rows, view.picture.top, view.turns0]);

  const slotAt = (s: number): { x: number; y: number } => ({ x: (s % cols) * CELL, y: Math.floor(s / cols) * CELL });
  const trayAt = (i: number): { x: number; y: number } => ({ x: (i % cols) * CELL, y: rows * CELL + GAP + Math.floor(i / cols) * CELL });
  const where = (m: Model, p: number): { x: number; y: number } => { const s = m.slot[p] ?? null; return s === null ? trayAt(home[p] ?? p) : slotAt(s); };
  const fits = (m: Model, p: number): boolean => m.slot[p] === p && ((view.turns0[p] ?? 0) + (m.spins[p] ?? 0)) % 4 === 0;

  const commit = (next: Model): void => { latest.current.model = next; setModel(next); };
  /** The piece landed in `slot`: a click where it fits, a rustle where it does not. */
  const land = (p: number, slot: number): void => {
    commit(placed(latest.current.model, p, slot));
    if (fits(latest.current.model, p)) { feel.haptics.buzz("click"); feel.synth.play("click"); } else feel.synth.play("rustle");
    announce(`Piece ${p + 1} in frame spot ${slot + 1}.`);
  };
  const pickOrTurn = (p: number): void => {
    const m = latest.current.model;
    if (m.picked !== p) { commit({ ...m, picked: p }); announce(`Piece ${p + 1} picked.`); return; }
    if (view.turning) turn(p);
  };
  const turn = (p: number): void => {
    commit(turned(latest.current.model, p));
    if (fits(latest.current.model, p)) { feel.haptics.buzz("click"); feel.synth.play("click"); } else { feel.haptics.buzz("tick"); feel.synth.play("rustle"); }
  };
  const toTray = (p: number): void => { commit(traySlot(latest.current.model, p)); feel.synth.play("rustle"); announce(`Piece ${p + 1} back in the tray.`); };
  const tapSlot = (s: number): void => {
    const p = latest.current.model.picked;
    if (p === null) { announce("Pick a piece first, then tap an empty spot."); return; }
    land(p, s);
  };

  const scale = (): number => {
    const box = board.current?.getBoundingClientRect();
    return box && box.width > 0 ? W / box.width : 1;
  };
  const onDown = (e: PointerEvent<HTMLButtonElement>, p: number): void => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const c = where(latest.current.model, p);
    drag.current = { piece: p, sx: e.clientX, sy: e.clientY, cx: c.x + CELL / 2, cy: c.y + CELL / 2, moved: false, el: e.currentTarget };
  };
  const onMove = (e: PointerEvent<HTMLButtonElement>, p: number): void => {
    const d = drag.current;
    if (d === null || d.piece !== p) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < SLOP) return;
      d.moved = true;
      setDragging(p);
    }
    d.el.style.translate = `${dx}px ${dy}px`; // straight onto the element: React does not draw every move
  };
  const onUp = (e: PointerEvent<HTMLButtonElement>, p: number): void => {
    const d = drag.current;
    if (d === null || d.piece !== p) return;
    drag.current = null;
    d.el.style.translate = "";
    setDragging(null);
    if (!d.moved) { pickOrTurn(p); return; }
    const k = scale();
    const x = d.cx + (e.clientX - d.sx) * k;
    const y = d.cy + (e.clientY - d.sy) * k;
    let best = -1;
    let bestD = RANGE;
    for (let s = 0; s < n; s++) {
      const c = slotAt(s);
      const dist = Math.hypot(x - (c.x + CELL / 2), y - (c.y + CELL / 2));
      if (dist < bestD) { bestD = dist; best = s; }
    }
    if (best >= 0) land(p, best); else toTray(p);
  };
  /** A cancelled touch (a call, a swipe from the edge): the piece goes back to where it was and nothing else happens. */
  const onCancel = (p: number): void => {
    const d = drag.current;
    if (d === null || d.piece !== p) return;
    drag.current = null;
    d.el.style.translate = "";
    setDragging(null);
  };
  /** A click that no pointer made (a keyboard, a screen reader's activate): the same as a tap. */
  const onClick = (e: MouseEvent<HTMLButtonElement>, p: number): void => {
    if (e.detail > 0 || (e.nativeEvent as { pointerType?: string }).pointerType) return; // a pointer made it: pointerup took care of it
    pickOrTurn(p);
  };

  const m = model;
  const inFrame = m.slot.filter((s) => s !== null).length;
  const pickedInFrame = m.picked !== null && m.slot[m.picked] !== null;
  const check = (): void => {
    if (inFrame < n) return;
    submit({ placed: m.slot.map((slot, piece) => ({ piece, slot: slot ?? 0, turns: (m.spins[piece] ?? 0) % 4 })) });
  };
  const box = (x: number, y: number, size: number): { left: string; top: string; width: string; height: string } => ({
    left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, width: `${(size / W) * 100}%`, height: `${(size / H) * 100}%`,
  });

  return (
    <div className="pz-photo">
      <p className="ui-hint pz-hint">{view.turning ? "Put the photo you saw back together. Drag pieces onto the frame. Tap a piece to pick it; tap it again to turn it." : "Put the photo you saw back together. Drag pieces onto the frame, or tap a piece and then an empty spot."}</p>
      <div className="pz-field pz-visual">
        <div ref={board} className={`pz-photo-board${reducedMotion ? " pz-photo-still" : ""}`} data-cols={cols} role="group" aria-label="Torn photo" style={{ aspectRatio: `${W} / ${H}`, "--pz-ratio": H / W } as CSSProperties}>
          <svg className="pz-photo-mount" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id={`${mount}-card`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="pz-mount-card-hi" /><stop offset="1" className="pz-mount-card-lo" /></linearGradient>
              <linearGradient id={`${mount}-felt`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="pz-mount-felt-hi" /><stop offset="1" className="pz-mount-felt-lo" /></linearGradient>
            </defs>
            <rect x={0.75} y={0.75} width={W - 1.5} height={rows * CELL - 1.5} rx={8} fill={`url(#${mount}-card)`} className="pz-mount-card" />
            {range(n).map((s) => <rect key={s} x={slotAt(s).x + INSET} y={slotAt(s).y + INSET} width={CELL - 2 * INSET} height={CELL - 2 * INSET} rx={2} className="pz-mount-recess" />)}
            <rect x={0.75} y={rows * CELL + GAP / 2} width={W - 1.5} height={rows * CELL + GAP / 2 - 0.75} rx={8} fill={`url(#${mount}-felt)`} className="pz-mount-felt" />
          </svg>
          {range(n).map((i) => <span key={`t${i}`} className="pz-photo-cell" style={box(trayAt(i).x + INSET, trayAt(i).y + INSET, CELL - 2 * INSET)} aria-hidden="true" />)}
          {range(n).map((s) => {
            const open = !m.slot.includes(s);
            const style = box(slotAt(s).x + INSET, slotAt(s).y + INSET, CELL - 2 * INSET);
            return open
              ? <button key={`s${s}`} type="button" className="pz-photo-slot" style={style} aria-label={`Frame spot ${s + 1}, empty`} onClick={() => tapSlot(s)} />
              : <span key={`s${s}`} className="pz-photo-slot pz-photo-slot-full" style={style} aria-hidden="true" />;
          })}
          {range(n).map((p) => {
            const c = where(m, p);
            const s = m.slot[p] ?? null;
            return (
              <button
                key={`p${p}`} type="button" className={`pz-piece${dragging === p ? " pz-piece-drag" : ""}`} style={box(c.x + INSET, c.y + INSET, CELL - 2 * INSET)}
                aria-label={`Piece ${p + 1}, ${s === null ? "in the tray" : `in frame spot ${s + 1}`}`} aria-pressed={m.picked === p}
                onPointerDown={(e) => onDown(e, p)} onPointerMove={(e) => onMove(e, p)} onPointerUp={(e) => onUp(e, p)} onPointerCancel={() => onCancel(p)} onClick={(e) => onClick(e, p)}
              >
                <span className="pz-piece-art" style={{ transform: `rotate(${((view.turns0[p] ?? 0) + (m.spins[p] ?? 0)) * 90}deg)` }} aria-hidden="true">
                  <PictureSvg picture={view.picture} cols={cols} rows={rows} piece={p} label="" />
                </span>
              </button>
            );
          })}
          <svg className="pz-photo-corners" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
            {range(n).flatMap((s) => {
              const x = slotAt(s).x + INSET;
              const y = slotAt(s).y + INSET;
              const e = CELL - 2 * INSET;
              const k = 15;
              return [
                `M ${x} ${y} h ${k} l ${-k} ${k} Z`, `M ${x + e} ${y} h ${-k} l ${k} ${k} Z`,
                `M ${x} ${y + e} h ${k} l ${-k} ${-k} Z`, `M ${x + e} ${y + e} h ${-k} l ${k} ${-k} Z`,
              ].map((d, c) => <path key={`${s}${c}`} d={d} className="pz-mount-corner" />);
            })}
          </svg>
        </div>
        <p className="pz-readout pz-photo-count" role="status">{inFrame} of {n} in the frame</p>
      </div>
      <div className={view.turning ? "pz-grid3" : "pz-grid2"}>
        {view.turning ? <button type="button" className="ui-button" disabled={m.picked === null} onClick={() => { if (m.picked !== null) turn(m.picked); }}>Turn</button> : null}
        <button type="button" className="ui-button" aria-label="Back to tray" disabled={!pickedInFrame} onClick={() => { if (m.picked !== null) toTray(m.picked); }}>To tray</button>
        <button type="button" className="ui-button ui-button--primary" aria-label="Check the photo" disabled={inFrame < n} onClick={check}>Check</button>
      </div>
    </div>
  );
}

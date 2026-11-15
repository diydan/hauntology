import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { layer } from "../art/canvas-paint";
import { CANVAS, MATERIAL, withAlpha } from "../art/palette";
import { paintWall } from "../art/stone-wall";
import { useFeelValue, useFrame, useLatest } from "../hooks";
import type { KindProps } from "./types";
import "./Words.css";

/** The wall is square, in logical units; the canvas is scaled by CSS. */
const WALL = 320;
const BEAM_R = 74;
const SEE_AT = 0.45; // a letter this lit can be picked
const TICK_AT = 0.6; // and one this lit buzzes when it comes into the beam
const TAP_PX = 34;
const DRAG_SLOP = 10;
const KEY_STEP = 24;
const BG = CANVAS.well;
const LETTER_FONT = "700 40px Georgia, serif";
const NUMBER_FONT = "700 16px Georgia, serif";
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** How lit a letter is by a torch at (bx, by): 1 inside the core, falling to 0 at the edge of the beam. */
const litness = (x: number, y: number, bx: number, by: number): number => clamp(1 - (Math.hypot(x - bx, y - by) - BEAM_R * 0.55) / (BEAM_R * 0.45), 0, 1);

/**
 * Hidden words: letters are written on a dark wall and show only in the torch beam. Pick the lit letters in reading order,
 * left to right. Aim the torch with a finger or by tilting the phone; the phone ticks when a letter comes into the beam.
 * Tap a lit letter, or press Pick for the lit letter nearest the middle of the beam. Keyboard: arrows aim, Enter picks.
 * With Assist on the letters are always faintly visible.
 * It is drawn as the thing it is (../art/stone-wall.ts): a stone wall in the dark, the same wall lit warm where the torch falls, and chalked
 * letters that show only in the beam. The two walls are painted once; the beam is a mask over the lit one.
 */
export default function Words({ view, feel, assist, submit, announce, resetKey, tiltButtons }: KindProps<"words">) {
  const [picked, setPicked] = useState<number[]>([]);
  const [lit, setLit] = useState<number | null>(null);
  const tilt = useFeelValue(feel.motion.subscribe, () => feel.motion.state);
  const latest = useLatest({ picked, lit, assist });
  const canvas = useRef<HTMLCanvasElement>(null);
  const paint = useRef<CanvasRenderingContext2D | null>(null);
  const layers = useRef<{ dim: HTMLCanvasElement; lit: HTMLCanvasElement; scratch: HTMLCanvasElement } | null>(null);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const beam = useRef({ x: WALL / 2, y: WALL / 2 });
  const target = useRef({ x: WALL / 2, y: WALL / 2 });
  const finger = useRef(false);
  const down = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const inBeam = useRef(new Set<number>());
  const drawn = useRef({ x: -1, y: -1, count: -1, lit: -2 });

  const px = (i: number): number => (view.letters[i]?.x ?? 0) * WALL;
  const py = (i: number): number => (view.letters[i]?.y ?? 0) * WALL;
  const seeing = (i: number, bx: number, by: number): number => Math.max(litness(px(i), py(i), bx, by), latest.current.assist ? 0.5 : 0);

  const choose = (i: number): void => {
    const cur = latest.current.picked;
    if (cur.length >= view.n || cur.includes(i)) return;
    const next = [...cur, i];
    latest.current.picked = next;
    setPicked(next);
    latest.current.lit = null; // a picked letter is not lit for picking again
    setLit(null);
    feel.haptics.buzz("click");
    feel.synth.play("click");
    announce(`Letter ${next.length} of ${view.n}: ${view.letters[i]?.ch ?? ""}`);
    if (next.length === view.n) submit({ letters: next });
  };
  const clear = (): void => { latest.current.picked = []; setPicked([]); };
  /** The lit letter nearest `(x, y)` within `max`, or -1. */
  const litNear = (x: number, y: number, max: number): number => {
    let best = -1;
    let bestDist = max;
    view.letters.forEach((_, i) => {
      if (latest.current.picked.includes(i) || seeing(i, beam.current.x, beam.current.y) <= SEE_AT) return;
      const d = Math.hypot(px(i) - x, py(i) - y);
      if (d < bestDist) { best = i; bestDist = d; }
    });
    return best;
  };

  // A wrong Attempt clears the letters (the host raises resetKey); the torch stays where it is.
  const seen = useRef(resetKey);
  useEffect(() => {
    if (seen.current === resetKey) return;
    seen.current = resetKey;
    latest.current.picked = [];
    setPicked([]);
  }, [resetKey, latest]);

  // The canvas is scaled for the screen's pixel density (never more than 2) and drawn only when something changed.
  useEffect(() => {
    const c = canvas.current?.getContext("2d") ?? null;
    if (c) c.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint.current = c;
    const dim = layer(WALL, WALL, dpr, (l) => paintWall(l, WALL, false));
    const lit = layer(WALL, WALL, dpr, (l) => paintWall(l, WALL, true));
    const scratch = layer(WALL, WALL, dpr, () => {});
    layers.current = dim && lit && scratch ? { dim, lit, scratch } : null;
    drawn.current.count = -1;
    const set = inBeam.current;
    return () => { paint.current = null; layers.current = null; set.clear(); };
  }, [dpr]);

  const local = (e: PointerEvent): { x: number; y: number } => {
    const box = canvas.current?.getBoundingClientRect();
    const w = box && box.width > 0 ? box.width : WALL;
    const h = box && box.height > 0 ? box.height : WALL;
    return { x: ((e.clientX - (box?.left ?? 0)) / w) * WALL, y: ((e.clientY - (box?.top ?? 0)) / h) * WALL };
  };
  const onDown = (e: PointerEvent<HTMLCanvasElement>): void => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    finger.current = true;
    const p = local(e);
    target.current = { x: p.x, y: p.y };
    down.current = { ...p, moved: false };
  };
  const onMove = (e: PointerEvent<HTMLCanvasElement>): void => {
    const d = down.current;
    if (!finger.current || d === null) return;
    const p = local(e);
    target.current = { x: p.x, y: p.y };
    if (!d.moved && Math.hypot(p.x - d.x, p.y - d.y) > DRAG_SLOP) d.moved = true;
  };
  const onUp = (e: PointerEvent<HTMLCanvasElement>): void => {
    if (!finger.current) return;
    finger.current = false;
    const d = down.current;
    down.current = null;
    if (d === null || d.moved) return;
    const p = local(e);
    const i = litNear(p.x, p.y, TAP_PX); // a tap on a lit letter picks it
    if (i >= 0) choose(i);
  };
  const onCancel = (): void => { finger.current = false; down.current = null; };
  const onKey = (e: KeyboardEvent<HTMLCanvasElement>): void => {
    const step: Record<string, readonly [number, number]> = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP] };
    const s = step[e.key];
    if (s) {
      e.preventDefault();
      target.current = { x: clamp(target.current.x + s[0], 10, WALL - 10), y: clamp(target.current.y + s[1], 10, WALL - 10) };
    } else if ((e.key === "Enter" || e.key === " ") && latest.current.lit !== null) {
      e.preventDefault();
      choose(latest.current.lit);
    }
  };

  useFrame((_t, dt) => {
    const b = beam.current;
    const t = target.current;
    if (!finger.current && feel.motion.state === "on") { // tilt aims the torch round the whole wall
      t.x = WALL / 2 + clamp(feel.motion.tilt.x / 45, -1, 1) * (WALL / 2 - 10);
      t.y = WALL / 2 + clamp(feel.motion.tilt.y / 45, -1, 1) * (WALL / 2 - 10);
    }
    const k = 1 - Math.pow(0.75, dt / 16.67); // the beam eases towards the target at the same speed on any frame rate
    b.x += (t.x - b.x) * k;
    b.y += (t.y - b.y) * k;
    // letters coming into the beam tick once each
    const set = inBeam.current;
    let ticked = false;
    view.letters.forEach((_, i) => {
      const lit60 = litness(px(i), py(i), b.x, b.y) > TICK_AT;
      if (lit60 && !set.has(i)) { set.add(i); if (!ticked) { ticked = true; feel.haptics.buzz("tick"); feel.synth.play("tick"); } }
      else if (!lit60) set.delete(i);
    });
    const nearest = litNear(b.x, b.y, TAP_PX);
    if (nearest !== latest.current.lit) { latest.current.lit = nearest < 0 ? null : nearest; setLit(nearest < 0 ? null : nearest); }
    const c = paint.current;
    if (!c) return;
    const last = drawn.current;
    const count = latest.current.picked.length;
    if (Math.abs(b.x - last.x) < 0.05 && Math.abs(b.y - last.y) < 0.05 && count === last.count && nearest === last.lit) return;
    last.x = b.x;
    last.y = b.y;
    last.count = count;
    last.lit = nearest;
    c.clearRect(0, 0, WALL, WALL);
    c.fillStyle = BG;
    c.fillRect(0, 0, WALL, WALL);
    const L = layers.current;
    const sc = L?.scratch.getContext("2d") ?? null;
    if (L && sc) {
      c.drawImage(L.dim, 0, 0, WALL, WALL);
      // the lit wall, kept only where the torch falls: it is masked by the beam on a scratch layer, then laid over the dark wall
      sc.setTransform(1, 0, 0, 1, 0, 0);
      sc.globalCompositeOperation = "source-over";
      sc.clearRect(0, 0, L.scratch.width, L.scratch.height);
      sc.drawImage(L.lit, 0, 0);
      sc.setTransform(dpr, 0, 0, dpr, 0, 0);
      sc.globalCompositeOperation = "destination-in";
      const mask = sc.createRadialGradient(b.x, b.y, 6, b.x, b.y, BEAM_R * 1.3);
      mask.addColorStop(0, withAlpha(MATERIAL.dark, 1));
      mask.addColorStop(0.55, withAlpha(MATERIAL.dark, 0.92));
      mask.addColorStop(0.82, withAlpha(MATERIAL.dark, 0.34));
      mask.addColorStop(1, withAlpha(MATERIAL.dark, 0));
      sc.fillStyle = mask;
      sc.fillRect(0, 0, WALL, WALL);
      sc.globalCompositeOperation = "source-over";
      c.drawImage(L.scratch, 0, 0, WALL, WALL);
    }
    // the warmth of the torch itself
    const g = c.createRadialGradient(b.x, b.y, 4, b.x, b.y, BEAM_R * 1.1);
    g.addColorStop(0, withAlpha(MATERIAL.flame, 0.2));
    g.addColorStop(1, withAlpha(MATERIAL.flame, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, WALL, WALL);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineJoin = "round";
    view.letters.forEach((l, i) => {
      const a = seeing(i, b.x, b.y);
      if (a <= 0) return;
      const order = latest.current.picked.indexOf(i);
      c.font = LETTER_FONT;
      // chalk on stone: a dark rim to cut it from the wall, the chalk, and a second faint pass for the grain
      c.globalAlpha = a * 0.9;
      c.lineWidth = 4;
      c.strokeStyle = withAlpha(MATERIAL.dark, 0.55);
      c.strokeText(l.ch, px(i), py(i));
      c.globalAlpha = a * 0.95;
      c.fillStyle = order >= 0 ? CANVAS.ring : MATERIAL.ivory;
      c.fillText(l.ch, px(i), py(i));
      c.globalAlpha = a * 0.3;
      c.fillText(l.ch, px(i) + 0.8, py(i) - 0.6);
      c.globalAlpha = a * 0.95;
      if (order >= 0) { // a picked letter also shows its place in the word, not only a colour
        c.font = NUMBER_FONT;
        c.fillText(String(order + 1), px(i), py(i) + 30);
      }
    });
    c.globalAlpha = 1;
  });

  const litCh = lit === null ? null : (view.letters[lit]?.ch ?? null);
  return (
    <div className="pz-words">
      <p className="ui-hint pz-hint">{tilt === "on" ? "Lean the phone to sweep the torch." : "Drag a finger to aim the torch."} Pick the lit letters, left to right.</p>
      <canvas
        ref={canvas} className="pz-canvas pz-wall pz-visual" width={WALL * Math.min(2, window.devicePixelRatio || 1)} height={WALL * Math.min(2, window.devicePixelRatio || 1)}
        role="application" tabIndex={0} aria-label="Dark wall with hidden letters. Arrow keys aim the torch. Enter picks the lit letter."
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} onKeyDown={onKey}
      />
      <div className="pz-field">
        <p className="pz-readout pz-lit" aria-live="off">{litCh === null ? "No letter is lit" : `Lit: ${litCh}`}</p>
        <button type="button" className="ui-button ui-button--primary pz-wide" disabled={lit === null || picked.length >= view.n} onClick={() => { if (lit !== null) choose(lit); }}>
          {litCh === null ? "Pick the lit letter" : `Pick ${litCh}`}
        </button>
      </div>
      <div className="pz-field">
        <div className="pz-digits" role="img" aria-label={`Letters so far: ${picked.length} of ${view.n}`}>
          {Array.from({ length: view.n }, (_, i) => <span key={i}>{picked[i] === undefined ? "·" : (view.letters[picked[i] as number]?.ch ?? "·")}</span>)}
        </div>
        <div className="ui-row ui-row--center pz-btnrow">
          <button type="button" className="ui-button" disabled={picked.length === 0} onClick={clear}>Clear</button>
          {tiltButtons}
        </div>
      </div>
    </div>
  );
}

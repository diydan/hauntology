import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { defaultWorld, makeStepper, newBall, type Ball } from "@hauntology/shared/puzzles/tilt-ball";
import { CANVAS, withAlpha } from "../art/palette";
import { useFeelValue, useFrame, useLatest } from "../hooks";
import { mazeCellSize, mazeLayout } from "./Maze-geometry";
import type { KindProps } from "./types";
import "./Maze.css";

const NO_TILT = { x: 0, y: 0 } as const;
const PULL = 0.6; // degrees of tilt per unit of distance from the finger to the orb
const KEY_TILT = 30;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
type Keys = { left: boolean; right: boolean; up: boolean; down: boolean };

/**
 * Marble maze (optional): roll the orb to the green ring. Tilt the phone, or hold a finger where the orb should go (it is
 * pulled towards the finger), or use the arrow keys. Walls bump and buzz. The walls are drawn once into a layer and only
 * the orb is drawn each frame, and only while it moves.
 */
export default function Maze({ view, feel, submit, announce, elapsed, resetKey, tiltButtons }: KindProps<"maze">) {
  const layout = useMemo(() => {
    const rows = view.grid.length;
    const cols = view.grid[0]?.length ?? 0;
    return mazeLayout(view.grid, mazeCellSize(cols, rows, window.innerHeight || 640));
  }, [view.grid]);
  const { cs, w, h, walls, start, goal } = layout;
  const orbR = cs * 0.3;
  const [hits, setHits] = useState(0);
  const [done, setDone] = useState(false);
  const tilt = useFeelValue(feel.motion.subscribe, () => feel.motion.state);
  const latest = useLatest({ done });
  const canvas = useRef<HTMLCanvasElement>(null);
  const paint = useRef<CanvasRenderingContext2D | null>(null);
  const layer = useRef<HTMLCanvasElement | null>(null);
  const sim = useRef<{ ball: Ball; roll: (dtMs: number, t: { x: number; y: number }) => number } | null>(null);
  if (sim.current === null) {
    const ball = newBall(start.x, start.y);
    sim.current = { ball, roll: makeStepper(ball, { ...defaultWorld(w, h, walls, orbR), friction: 2.6, maxSpeed: 210, accel: 13 }) };
  }
  const finger = useRef<{ x: number; y: number } | null>(null);
  const keys = useRef<Keys>({ left: false, right: false, up: false, down: false });
  const drawn = useRef({ x: -1, y: -1 });
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  // A wrong Attempt (a solve too quick to believe) starts the orb again at the start.
  const seen = useRef(resetKey);
  useEffect(() => {
    if (seen.current === resetKey) return;
    seen.current = resetKey;
    const b = sim.current?.ball;
    if (b) { b.x = start.x; b.y = start.y; b.vx = 0; b.vy = 0; b.hits = 0; }
    latest.current.done = false;
    setDone(false);
    setHits(0);
    drawn.current.x = -1;
  }, [resetKey, latest, start]);

  // The canvas is scaled for the screen's pixel density (never more than 2). The walls and goal are drawn once into a layer.
  useEffect(() => {
    const c = canvas.current?.getContext("2d") ?? null;
    if (c) c.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint.current = c;
    const off = document.createElement("canvas");
    off.width = Math.round(w * dpr);
    off.height = Math.round(h * dpr);
    const lc = off.getContext("2d");
    if (lc) {
      lc.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawWalls(lc);
      layer.current = off;
    } else layer.current = null;
    drawn.current.x = -1;
    return () => { paint.current = null; layer.current = null; };
  }, []);

  function drawWalls(c: CanvasRenderingContext2D): void {
    c.fillStyle = CANVAS.well;
    c.fillRect(0, 0, w, h);
    c.fillStyle = CANVAS.wall;
    for (const wall of walls) c.fillRect(wall.x + 1, wall.y + 1, wall.w - 2, wall.h - 2);
    c.strokeStyle = CANVAS.ring;
    c.lineWidth = 4;
    c.beginPath();
    c.arc(goal.x, goal.y, cs * 0.34, 0, Math.PI * 2);
    c.stroke();
  }

  const local = (e: PointerEvent): { x: number; y: number } => {
    const box = canvas.current?.getBoundingClientRect();
    const bw = box && box.width > 0 ? box.width : w;
    const bh = box && box.height > 0 ? box.height : h;
    return { x: ((e.clientX - (box?.left ?? 0)) / bw) * w, y: ((e.clientY - (box?.top ?? 0)) / bh) * h };
  };
  const onDown = (e: PointerEvent<HTMLCanvasElement>): void => { e.currentTarget.setPointerCapture?.(e.pointerId); finger.current = local(e); };
  const onMove = (e: PointerEvent<HTMLCanvasElement>): void => { if (finger.current) finger.current = local(e); };
  const onUp = (): void => { finger.current = null; };
  const setKey = (e: KeyboardEvent<HTMLCanvasElement>, on: boolean): void => {
    const name = e.key === "ArrowLeft" ? "left" : e.key === "ArrowRight" ? "right" : e.key === "ArrowUp" ? "up" : e.key === "ArrowDown" ? "down" : null;
    if (name === null) return;
    e.preventDefault();
    keys.current[name] = on;
  };
  const onBlur = (): void => { keys.current = { left: false, right: false, up: false, down: false }; };

  useFrame((_t, dt) => {
    const s = sim.current;
    if (!s || latest.current.done) return;
    const { ball, roll } = s;
    let t: { x: number; y: number } = NO_TILT;
    const f = finger.current;
    const k = keys.current;
    if (f) t = { x: clamp((f.x - ball.x) * PULL, -45, 45), y: clamp((f.y - ball.y) * PULL, -45, 45) };
    else if (k.left || k.right || k.up || k.down) t = { x: ((k.right ? 1 : 0) - (k.left ? 1 : 0)) * KEY_TILT, y: ((k.down ? 1 : 0) - (k.up ? 1 : 0)) * KEY_TILT };
    else if (feel.motion.state === "on") t = feel.motion.tilt;
    const before = ball.hits;
    if (roll(dt, t) > 0) { feel.haptics.buzz("bump"); feel.synth.play("bump"); }
    if (ball.hits !== before) setHits(ball.hits);
    if (Math.hypot(ball.x - goal.x, ball.y - goal.y) < cs * 0.38) {
      latest.current.done = true;
      setDone(true);
      announce("You reached the ring");
      submit({ reachedAtMs: Math.round(elapsed()), hits: ball.hits });
    }
    const c = paint.current;
    if (!c) return;
    const last = drawn.current;
    if (Math.abs(ball.x - last.x) < 0.05 && Math.abs(ball.y - last.y) < 0.05) return;
    last.x = ball.x;
    last.y = ball.y;
    if (layer.current) c.drawImage(layer.current, 0, 0, w, h);
    else drawWalls(c);
    c.fillStyle = withAlpha(CANVAS.piece, 0.3);
    c.beginPath();
    c.arc(ball.x, ball.y, orbR * 1.6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = CANVAS.piece;
    c.beginPath();
    c.arc(ball.x, ball.y, orbR, 0, Math.PI * 2);
    c.fill();
  }, !done);

  return (
    <div className="pz-maze">
      <p className="ui-hint pz-hint">Reach the green ring. {tilt === "on" ? "Lean the phone to roll the orb." : "Hold a finger where the orb should go."}</p>
      <div className="pz-field">
        <canvas
          ref={canvas} className="pz-canvas pz-maze-board" width={Math.round(w * dpr)} height={Math.round(h * dpr)}
          style={{ width: w }} role="application" tabIndex={0} aria-label="Maze. Use the arrow keys, or hold a finger where the orb should go."
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onKeyDown={(e) => setKey(e, true)} onKeyUp={(e) => setKey(e, false)} onBlur={onBlur}
        />
        <p className="pz-readout pz-maze-status" role="status">{done ? `You reached the ring. Walls hit: ${hits}` : `Walls hit: ${hits}`}</p>
      </div>
      {tiltButtons ? <div className="ui-row ui-row--center">{tiltButtons}</div> : null}
    </div>
  );
}

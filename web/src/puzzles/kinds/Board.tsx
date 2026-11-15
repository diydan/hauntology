import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { defaultWorld, makeStepper, newBall, type Ball } from "@hauntology/shared/puzzles/tilt-ball";
import { useFeelValue, useFrame, useLatest } from "../hooks";
import { BOARD_H, BOARD_W, DRAG_SLOP, LETTERS, LETTER_POS, MAGNET_MAX_SPEED, MAGNET_PULL, MAGNET_PX, NEAR_PX, PLANCHETTE_R, REST_SPEED, START, TAP_PX, UNDER_PX, nearestLetter } from "./Board-geometry";
import type { KindProps } from "./types";
import "./Board.css";

const WORLD = { ...defaultWorld(BOARD_W, BOARD_H, [], PLANCHETTE_R), friction: 5, maxSpeed: 260, accel: 22 };
const NO_TILT = { x: 0, y: 0 } as const;
const INK = "#1a1410";
const LETTER = "#d9c9a3";
const LANTERN = "#ffd86b";
const RING = "#7fd6a1";
const SPIRIT = "#b9a6ff";
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Spirit board: a word is whispered with a short clue. Roll the planchette onto each letter and pick it. The word is never
 * on the phone: the Room (or the host) plays the whisper through `hear`, and the clue is shown as text.
 * Touch: drag the planchette, then press Pick (or tap a letter). Tilt: lean to roll it (letters pull it in gently), then tap
 * anywhere or rest on the letter for a moment. Keyboard: arrow keys jump between letters, Enter picks.
 */
export default function Board({ view, feel, submit, announce, resetKey, hear }: KindProps<"board">) {
  const [spelled, setSpelled] = useState<string[]>([]);
  const [heard, setHeard] = useState(0);
  const [under, setUnder] = useState<string | null>(null);
  const tilt = useFeelValue(feel.motion.subscribe, () => feel.motion.state);
  const latest = useLatest({ spelled, heard, under });
  const canvas = useRef<HTMLCanvasElement>(null);
  const paint = useRef<CanvasRenderingContext2D | null>(null);
  const sim = useRef<{ ball: Ball; roll: (dtMs: number, tilt: { x: number; y: number }) => number } | null>(null);
  if (sim.current === null) {
    const ball = newBall(START.x, START.y);
    sim.current = { ball, roll: makeStepper(ball, WORLD) };
  }
  const finger = useRef(false);
  const down = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const resting = useRef({ letter: null as string | null, dwell: 0, armed: true });
  /** What the last drawing showed, so a still board is not drawn again. */
  const drawn = useRef({ x: -1, y: -1, dwell: -1, letter: "", count: -1 });

  const choose = (ch: string): void => {
    const cur = latest.current.spelled;
    if (cur.length >= view.length) return;
    const next = [...cur, ch];
    latest.current.spelled = next;
    setSpelled(next);
    resting.current.armed = false;
    feel.haptics.buzz("thunk");
    feel.synth.play("thunk");
    announce(`Letter ${next.length} of ${view.length}: ${ch}`);
    if (next.length === view.length) submit({ letters: next.join("") });
  };
  const clear = (): void => { latest.current.spelled = []; setSpelled([]); };
  const noteUnder = (ch: string | null): void => { if (latest.current.under !== ch) { latest.current.under = ch; setUnder(ch); } };
  const put = (x: number, y: number): void => {
    const b = sim.current?.ball;
    if (!b) return;
    b.x = clamp(x, PLANCHETTE_R, BOARD_W - PLANCHETTE_R);
    b.y = clamp(y, PLANCHETTE_R, BOARD_H - PLANCHETTE_R);
    b.vx = 0;
    b.vy = 0;
  };

  // A wrong Attempt clears the letters (the host raises resetKey); the planchette stays where it is.
  const seen = useRef(resetKey);
  useEffect(() => {
    if (seen.current === resetKey) return;
    seen.current = resetKey;
    latest.current.spelled = [];
    setSpelled([]);
  }, [resetKey, latest]);

  // The canvas is scaled for the screen's pixel density (never more than 2) and drawn only when something changed.
  useEffect(() => {
    const cv = canvas.current;
    const c = cv?.getContext("2d") ?? null;
    if (c) c.setTransform(Math.min(2, window.devicePixelRatio || 1), 0, 0, Math.min(2, window.devicePixelRatio || 1), 0, 0);
    paint.current = c;
    drawn.current.count = -1; // draw once now
    return () => { paint.current = null; };
  }, []);

  const local = (e: PointerEvent): { x: number; y: number } => {
    const box = canvas.current?.getBoundingClientRect();
    const w = box && box.width > 0 ? box.width : BOARD_W;
    const h = box && box.height > 0 ? box.height : BOARD_H;
    return { x: ((e.clientX - (box?.left ?? 0)) / w) * BOARD_W, y: ((e.clientY - (box?.top ?? 0)) / h) * BOARD_H };
  };
  const onDown = (e: PointerEvent<HTMLCanvasElement>): void => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    finger.current = true;
    down.current = { ...local(e), moved: false };
  };
  const onMove = (e: PointerEvent<HTMLCanvasElement>): void => {
    const d = down.current;
    if (!finger.current || d === null) return;
    const p = local(e);
    if (!d.moved && Math.hypot(p.x - d.x, p.y - d.y) > DRAG_SLOP) d.moved = true;
    if (d.moved) put(p.x, p.y); // a finger drag carries the planchette
  };
  const onUp = (e: PointerEvent<HTMLCanvasElement>): void => {
    if (!finger.current) return;
    finger.current = false;
    const d = down.current;
    down.current = null;
    if (d === null || d.moved) return;
    const p = local(e);
    const b = sim.current?.ball;
    const tapped = nearestLetter(p.x, p.y, TAP_PX); // a tap on a letter picks it
    const beneath = tilt === "on" && b ? nearestLetter(b.x, b.y, UNDER_PX) : null; // with tilt on, a tap anywhere picks the letter under the planchette
    const pick = tapped ?? beneath;
    if (pick) choose(pick.ch);
  };
  const onCancel = (): void => { finger.current = false; down.current = null; };

  const onKey = (e: KeyboardEvent<HTMLCanvasElement>): void => {
    const b = sim.current?.ball;
    if (!b) return;
    const here = nearestLetter(b.x, b.y, UNDER_PX);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const i = here ? LETTERS.indexOf(here.ch) : e.key === "ArrowRight" ? -1 : LETTERS.length;
      const next = LETTER_POS[(i + (e.key === "ArrowRight" ? 1 : -1) + LETTERS.length) % LETTERS.length];
      if (next) {
        put(next.x, next.y);
        resting.current = { letter: next.ch, dwell: 0, armed: false }; // a keyboard jump never picks by resting
        noteUnder(next.ch);
        feel.haptics.buzz("tick");
        feel.synth.play("tick");
      }
    } else if ((e.key === "Enter" || e.key === " ") && here) {
      e.preventDefault();
      choose(here.ch);
    }
  };

  const draw = (c: CanvasRenderingContext2D, b: Ball, dwell: number, letter: string | null): void => {
    c.fillStyle = INK;
    c.fillRect(0, 0, BOARD_W, BOARD_H);
    c.font = "600 28px Georgia, serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    for (const p of LETTER_POS) {
      c.fillStyle = p.ch === letter ? LANTERN : LETTER;
      c.fillText(p.ch, p.x, p.y);
    }
    const at = letter === null ? undefined : LETTER_POS[LETTERS.indexOf(letter)];
    if (at && dwell > 0) { // the ring fills while the planchette rests on a letter
      c.strokeStyle = RING;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(at.x, at.y, NEAR_PX + 2, -Math.PI / 2, -Math.PI / 2 + Math.min(1, dwell / view.dwellMs) * Math.PI * 2);
      c.stroke();
    }
    c.fillStyle = "rgba(185,166,255,0.28)";
    c.strokeStyle = SPIRIT;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(b.x, b.y, PLANCHETTE_R, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = "#0e0f14";
    c.beginPath();
    c.arc(b.x, b.y, 5, 0, Math.PI * 2);
    c.fill();
  };

  useFrame((_t, dt) => {
    const s = sim.current;
    if (!s) return;
    const { ball, roll } = s;
    const rest = resting.current;
    if (!finger.current) {
      // letters pull a slow planchette in, so resting on one is easy
      const pulled = nearestLetter(ball.x, ball.y, MAGNET_PX);
      if (pulled && Math.hypot(ball.vx, ball.vy) < MAGNET_MAX_SPEED) {
        const k = MAGNET_PULL * (dt / 1000);
        ball.vx += (pulled.x - ball.x) * k;
        ball.vy += (pulled.y - ball.y) * k;
      }
      roll(dt, feel.motion.state === "on" ? feel.motion.tilt : NO_TILT); // no tilt and no finger: it settles
    }
    const near = nearestLetter(ball.x, ball.y, NEAR_PX);
    if ((near?.ch ?? null) !== rest.letter) {
      rest.letter = near?.ch ?? null;
      rest.dwell = 0;
      if (near) { rest.armed = true; feel.haptics.buzz("tick"); feel.synth.play("tick"); }
      noteUnder(near?.ch ?? null);
    } else if (near && rest.armed && feel.motion.state === "on" && Math.hypot(ball.vx, ball.vy) < REST_SPEED) { // resting picks only with tilt: a finger has the Pick button
      rest.dwell += dt;
      if (rest.dwell >= view.dwellMs) { rest.dwell = 0; choose(near.ch); }
    } else rest.dwell = 0;
    const c = paint.current;
    if (!c) return;
    const last = drawn.current;
    const step = Math.floor(rest.dwell / 16);
    const count = latest.current.spelled.length;
    const letterKey = rest.letter ?? "";
    if (Math.abs(ball.x - last.x) < 0.05 && Math.abs(ball.y - last.y) < 0.05 && step === last.dwell && letterKey === last.letter && count === last.count) return;
    last.x = ball.x;
    last.y = ball.y;
    last.dwell = step;
    last.letter = letterKey;
    last.count = count;
    draw(c, ball, rest.dwell, rest.letter);
  });

  const speak = async (): Promise<void> => {
    const cur = latest.current;
    if (!hear || cur.heard >= view.plays) return;
    cur.heard += 1;
    setHeard(cur.heard);
    const said = await hear();
    if (said === false) { // nothing could be said: give the whisper back and point at the clue
      latest.current.heard = Math.max(0, latest.current.heard - 1);
      setHeard(latest.current.heard);
      announce("This phone has no speech voice. Use the clue below.");
    }
  };

  const left = view.plays - heard;
  const hearText = !hear ? "No voice here" : left > 0 ? `Hear the word (${left} left)` : "No more whispers";
  return (
    <div className="pz-board-kind">
      <div className="pz-row">
        <button type="button" className="pz-btn pz-btn-primary" disabled={!hear || left <= 0} onClick={() => void speak()}>{hearText}</button>
      </div>
      <p className="pz-hint pz-clue-line">Clue: {view.clue} · {view.length} letters</p>
      <canvas
        ref={canvas} className="pz-canvas pz-spirit" width={BOARD_W * Math.min(2, window.devicePixelRatio || 1)} height={BOARD_H * Math.min(2, window.devicePixelRatio || 1)}
        role="application" tabIndex={0} aria-label="Spirit board. Arrow keys jump between letters. Enter picks the letter."
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} onKeyDown={onKey}
      />
      <p className="pz-readout pz-under" aria-live="off">{under === null ? "Move the planchette onto a letter" : `On the letter ${under}`}</p>
      <button type="button" className="pz-btn pz-btn-primary pz-wide" disabled={under === null || spelled.length >= view.length} onClick={() => { if (under !== null) choose(under); }}>
        {under === null ? "Pick the letter" : `Pick ${under}`}
      </button>
      <div className="pz-digits" role="img" aria-label={`Letters so far: ${spelled.length} of ${view.length}`}>
        {Array.from({ length: view.length }, (_, i) => <span key={i}>{spelled[i] ?? "·"}</span>)}
      </div>
      <div className="pz-row">
        <button type="button" className="pz-btn pz-btn-quiet" disabled={spelled.length === 0} onClick={clear}>Clear</button>
      </div>
      <p className="pz-hint">{tilt === "on" ? "Tilt is on: lean the phone to roll the planchette, then tap anywhere or rest on the letter." : "Drag the planchette onto a letter, then press Pick. Or tap a letter."}</p>
    </div>
  );
}

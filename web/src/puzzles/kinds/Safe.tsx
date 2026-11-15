import { useEffect, useRef, useState, type PointerEvent } from "react";
import { CLOCK_C, angleOf, polar } from "../art/ClockFace";
import { useFrame, useLatest } from "../hooks";
import type { KindProps } from "./types";
import "./Safe.css";

const wrap180 = (a: number): number => ((a + 540) % 360) - 180;
/** The digit under the marker when the dial is turned `theta` degrees clockwise. Digit i sits at 36 * i degrees. */
const digitAt = (theta: number): number => Math.round((((-theta % 360) + 360) % 360) / 36) % 10;

/**
 * Safe code: turn the dial to each digit of the code from the plaque seen earlier, then press Set. Drag the dial, use the
 * Digit buttons, or switch on "Twist" and turn the phone like a dial. A click at every digit.
 */
export default function Safe({ view, feel, submit, announce, resetKey }: KindProps<"safe">) {
  const [digit, setDigit] = useState(0);
  const [code, setCode] = useState<number[]>([]);
  const [twist, setTwist] = useState(false);
  const [flip, setFlip] = useState(false);
  const board = useRef<SVGSVGElement>(null);
  const face = useRef<SVGGElement>(null);
  const theta = useRef(0);
  const grab = useRef<{ angle: number; theta: number } | null>(null);
  const base = useRef<{ dial: number; theta: number } | null>(null);
  const latest = useLatest({ digit, code });

  const turnTo = (t: number): void => {
    theta.current = t;
    face.current?.setAttribute("transform", `rotate(${t} ${CLOCK_C} ${CLOCK_C})`);
    const d = digitAt(t);
    if (d !== latest.current.digit) {
      latest.current.digit = d;
      setDigit(d);
      feel.haptics.buzz("click");
      feel.synth.play("click");
    }
  };
  const snap = (): void => turnTo(-36 * digitAt(theta.current));

  // A wrong Attempt clears the code (the host raises resetKey); the dial stays where it is.
  const seen = useRef(resetKey);
  useEffect(() => {
    if (seen.current === resetKey) return;
    seen.current = resetKey;
    latest.current.code = [];
    setCode([]);
  }, [resetKey, latest]);

  const local = (e: PointerEvent): { x: number; y: number } => {
    const box = board.current?.getBoundingClientRect();
    const k = box && box.width > 0 ? 300 / box.width : 1;
    return { x: (e.clientX - (box?.left ?? 0)) * k, y: (e.clientY - (box?.top ?? 0)) * k };
  };
  const onDown = (e: PointerEvent<SVGSVGElement>): void => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = local(e);
    grab.current = { angle: angleOf(CLOCK_C, CLOCK_C, p.x, p.y), theta: theta.current };
    base.current = null;
  };
  const onMove = (e: PointerEvent<SVGSVGElement>): void => {
    const g = grab.current;
    if (g === null) return;
    const p = local(e);
    turnTo(g.theta + wrap180(angleOf(CLOCK_C, CLOCK_C, p.x, p.y) - g.angle));
  };
  const onUp = (): void => {
    if (grab.current === null) return;
    grab.current = null;
    snap();
  };

  // Twist: the turn of the phone turns the dial by the same number of degrees
  useFrame(() => {
    const dial = feel.motion.dial;
    if (grab.current !== null || dial === null || feel.motion.state !== "on") return;
    if (base.current === null) { base.current = { dial, theta: theta.current }; return; }
    turnTo(base.current.theta + (flip ? -1 : 1) * wrap180(dial - base.current.dial));
  }, twist);

  const toggleTwist = async (): Promise<void> => {
    if (twist) { setTwist(false); return; }
    if (feel.motion.state !== "on" && (await feel.motion.enable()) !== "on") { announce("Tilt is not available. Drag the dial instead."); return; }
    base.current = null;
    setTwist(true);
  };
  const toggleFlip = (): void => { base.current = null; setFlip((f) => !f); };
  const nudge = (delta: number): void => { base.current = null; turnTo(-36 * ((digitAt(theta.current) + delta + 10) % 10)); };

  const setDigitNow = (): void => {
    const cur = latest.current.code;
    if (cur.length >= view.digits) return;
    const next = [...cur, digitAt(theta.current)];
    latest.current.code = next;
    setCode(next);
    feel.haptics.buzz("thunk");
    feel.synth.play("thunk");
    announce(`Digit ${next.length} of ${view.digits} set to ${next[next.length - 1]}`);
    if (next.length === view.digits) submit({ code: next });
  };
  const undo = (): void => {
    const next = latest.current.code.slice(0, -1);
    latest.current.code = next;
    setCode(next);
  };

  return (
    <div>
      <p className="pz-hint">Dial the code from the plaque you saw: turn the dial to a digit, then press Set.</p>
      <svg ref={board} viewBox="0 0 300 300" className="pz-board pz-safe-board" role="application" aria-label="Safe dial" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <circle cx={CLOCK_C} cy={CLOCK_C} r={142} className="pz-safe-ring" />
        <g ref={face} transform={`rotate(0 ${CLOCK_C} ${CLOCK_C})`}>
          {Array.from({ length: 10 }, (_, i) => {
            const [x, y] = polar(CLOCK_C, CLOCK_C, 112, i * 36);
            const [x1, y1] = polar(CLOCK_C, CLOCK_C, 138, i * 36 + 18);
            const [x2, y2] = polar(CLOCK_C, CLOCK_C, 130, i * 36 + 18);
            return (
              <g key={i}>
                <text x={x} y={y + 11} className="pz-safe-num">{i}</text>
                <line x1={x1} y1={y1} x2={x2} y2={y2} className="pz-safe-tick" />
              </g>
            );
          })}
        </g>
        <polygon points="150,26 137,2 163,2" className="pz-safe-marker" />
      </svg>
      <p className="pz-readout" role="img" aria-label={`Under the marker: ${digit}`}>{digit}</p>
      <div className="pz-digits" role="img" aria-label={`Code so far: ${code.length} of ${view.digits} digits`}>
        {Array.from({ length: view.digits }, (_, i) => <span key={i}>{i < code.length ? String(code[i]) : "·"}</span>)}
      </div>
      <div className="pz-grid2">
        <button type="button" className="pz-btn" aria-label="Digit minus" onClick={() => nudge(-1)}>Digit −</button>
        <button type="button" className="pz-btn" aria-label="Digit plus" onClick={() => nudge(1)}>Digit +</button>
      </div>
      <div className="pz-twist">
        <button type="button" className="pz-btn pz-btn-quiet" aria-pressed={twist} onClick={() => void toggleTwist()}>{twist ? "Twist: on" : "Twist"}</button>
        <p className="pz-hint">{twist ? "Hold the phone upright and turn it like a wheel to turn the dial." : "Twist: turn the phone like a wheel to turn the dial."}</p>
        {twist ? <button type="button" className="pz-btn pz-btn-quiet" aria-pressed={flip} onClick={toggleFlip}>Turns the wrong way? Flip it</button> : null}
      </div>
      <div className="pz-grid2">
        <button type="button" className="pz-btn pz-btn-quiet" disabled={code.length === 0} onClick={undo}>Undo</button>
        <button type="button" className="pz-btn pz-btn-primary" onClick={setDigitNow}>Set</button>
      </div>
    </div>
  );
}

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { CLOCK_C, angleOf } from "../art/ClockFace";
import { SafeDefs, SafeDial, SafeIndex, SafePlate } from "../art/safe";
import { useFeelValue, useFrame, useLatest } from "../hooks";
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
  const art = useId().replace(/:/g, "");
  const theta = useRef(0);
  const grab = useRef<{ angle: number; theta: number } | null>(null);
  const base = useRef<{ dial: number; theta: number } | null>(null);
  const latest = useLatest({ digit, code });

  // Tilt starts by itself where the phone has a sensor, and then Twist starts on too, once: the Player can turn it off. If tilt goes off (the
  // Player's switch), the Twist button says so.
  const tiltState = useFeelValue(feel.motion.subscribe, () => feel.motion.state);
  const autoTwist = useRef(true);
  useEffect(() => {
    if (tiltState === "on" && autoTwist.current) { autoTwist.current = false; base.current = null; setTwist(true); }
    else if (tiltState !== "on" && twist) setTwist(false);
  }, [tiltState, twist]);

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
    autoTwist.current = false; // the Player chose: it is theirs from now on
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
      <p className="ui-hint pz-hint">Dial the code from the plaque you saw: turn the dial to a digit, then press Set.</p>
      <div className="pz-field pz-visual">
        <svg ref={board} viewBox="0 0 300 300" className="pz-board pz-safe-board" role="application" aria-label="Safe dial" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <SafeDefs id={art} />
          <SafePlate id={art} />
          <g ref={face} transform={`rotate(0 ${CLOCK_C} ${CLOCK_C})`}>
            <SafeDial id={art} />
          </g>
          <SafeIndex id={art} />
        </svg>
        <p className="pz-readout pz-safe-readout" role="img" aria-label={`Under the marker: ${digit}`}>{digit}</p>
      </div>
      <div className="pz-digits pz-safe-plates" role="img" aria-label={`Code so far: ${code.length} of ${view.digits} digits`}>
        {Array.from({ length: view.digits }, (_, i) => <span key={i}>{i < code.length ? String(code[i]) : "·"}</span>)}
      </div>
      <div className={twist ? "pz-grid4" : "pz-grid3"}>
        <button type="button" className="ui-button" aria-label="Digit minus" onClick={() => nudge(-1)}>Digit −</button>
        <button type="button" className="ui-button" aria-label="Digit plus" onClick={() => nudge(1)}>Digit +</button>
        <button type="button" className="ui-button" aria-pressed={twist} aria-label={twist ? "Twist: on" : "Twist"} onClick={() => void toggleTwist()}>{twist ? <>Twist<span className="pz-st" aria-hidden="true">: on</span></> : "Twist"}</button>
        {twist ? <button type="button" className="ui-button" aria-pressed={flip} aria-label="Turns the wrong way? Flip it" onClick={toggleFlip}>Flip</button> : null}
      </div>
      <div className="pz-twist">
        <p className="ui-hint pz-hint">{twist ? "Hold the phone upright and turn it like a wheel to turn the dial." : "Twist: turn the phone like a wheel to turn the dial."}</p>
      </div>
      <div className="pz-grid2">
        <button type="button" className="ui-button" disabled={code.length === 0} onClick={undo}>Undo</button>
        <button type="button" className="ui-button ui-button--primary" onClick={setDigitNow}>Set</button>
      </div>
    </div>
  );
}

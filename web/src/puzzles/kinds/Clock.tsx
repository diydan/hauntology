import { useEffect, useRef, useState, type PointerEvent } from "react";
import { CLOCK_C, ClockDial, ClockHands, angleOf, hourAngle, minuteAngle } from "../art/ClockFace";
import { useFeelValue, useFrame, useLatest } from "../hooks";
import type { KindProps } from "./types";

type Hand = "hour" | "minute";
const gap = (a: number, b: number): number => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const wrap360 = (a: number): number => ((a % 360) + 360) % 360;
const wrap180 = (a: number): number => ((a + 540) % 360) - 180;

/**
 * Clock time: set the hands to the time on the stopped clock seen in an earlier room. Drag a hand round the dial, use the
 * step buttons, or switch on "Twist" and turn the phone like a dial. The minute hand moves in the level's steps (15, 5 or 1
 * minutes), a tick at each.
 */
export default function Clock({ view, feel, submit, announce }: KindProps<"clock">) {
  const stepMin = view.stepMin;
  const [time, setTime] = useState({ h: 12, m: 0 });
  const [hand, setHand] = useState<Hand>("minute");
  const [twist, setTwist] = useState(false);
  const [flip, setFlip] = useState(false);
  const board = useRef<SVGSVGElement>(null);
  const drag = useRef<Hand | null>(null);
  const base = useRef<{ dial: number; angle: number } | null>(null);
  const latest = useLatest({ time, hand });

  // Tilt starts by itself where the phone has a sensor, and then Twist starts on too, once: the Player can turn it off. If tilt goes off (the
  // Player's switch), the Twist button says so.
  const tiltState = useFeelValue(feel.motion.subscribe, () => feel.motion.state);
  const autoTwist = useRef(true);
  useEffect(() => {
    if (tiltState === "on" && autoTwist.current) { autoTwist.current = false; base.current = null; setTwist(true); }
    else if (tiltState !== "on" && twist) setTwist(false);
  }, [tiltState, twist]);

  const apply = (next: { h: number; m: number }): void => {
    latest.current.time = next;
    setTime(next);
    feel.haptics.buzz("tick");
    feel.synth.play("tick");
  };
  const setFromAngle = (which: Hand, a: number): void => {
    const cur = latest.current.time;
    if (which === "minute") {
      const m = (Math.round(a / (6 * stepMin)) * stepMin) % 60;
      if (m !== cur.m) apply({ ...cur, m });
    } else {
      let h = Math.round(wrap360(a - cur.m * 0.5) / 30) % 12;
      if (h === 0) h = 12;
      if (h !== cur.h) apply({ ...cur, h });
    }
  };
  const step = (which: Hand, delta: number): void => {
    const cur = latest.current.time;
    apply(which === "minute" ? { ...cur, m: (cur.m + delta * stepMin + 60) % 60 } : { ...cur, h: ((cur.h - 1 + delta + 12) % 12) + 1 });
  };
  const handAngle = (which: Hand): number => (which === "minute" ? minuteAngle(latest.current.time.m) : hourAngle(latest.current.time.h, latest.current.time.m));
  const pick = (a: number, r: number): Hand => {
    const { h, m } = latest.current.time;
    const dh = gap(a, hourAngle(h, m)) - (r < 70 ? 25 : 0); // near the middle the short hand wins
    return dh < gap(a, minuteAngle(m)) ? "hour" : "minute";
  };
  const local = (e: PointerEvent): { x: number; y: number; r: number } => {
    const box = board.current?.getBoundingClientRect();
    const k = box && box.width > 0 ? 300 / box.width : 1;
    const x = (e.clientX - (box?.left ?? 0)) * k;
    const y = (e.clientY - (box?.top ?? 0)) * k;
    return { x, y, r: Math.hypot(x - CLOCK_C, y - CLOCK_C) };
  };

  const onDown = (e: PointerEvent<SVGSVGElement>): void => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = local(e);
    const a = angleOf(CLOCK_C, CLOCK_C, p.x, p.y);
    const which = pick(a, p.r);
    drag.current = which;
    base.current = null;
    setHand(which);
    setFromAngle(which, a);
  };
  const onMove = (e: PointerEvent<SVGSVGElement>): void => {
    if (drag.current === null) return;
    const p = local(e);
    setFromAngle(drag.current, angleOf(CLOCK_C, CLOCK_C, p.x, p.y));
  };
  const onUp = (): void => { drag.current = null; base.current = null; };

  // Twist: the turn of the phone moves the chosen hand by the same number of degrees
  useFrame(() => {
    const dial = feel.motion.dial;
    if (drag.current !== null || dial === null || feel.motion.state !== "on") return;
    const which = latest.current.hand;
    if (base.current === null) { base.current = { dial, angle: handAngle(which) }; return; }
    setFromAngle(which, wrap360(base.current.angle + (flip ? -1 : 1) * wrap180(dial - base.current.dial)));
  }, twist);

  const toggleTwist = async (): Promise<void> => {
    autoTwist.current = false; // the Player chose: it is theirs from now on
    if (twist) { setTwist(false); return; }
    if (feel.motion.state !== "on" && (await feel.motion.enable()) !== "on") { announce("Tilt is not available. Drag the hands instead."); return; }
    base.current = null;
    setTwist(true);
  };
  const chooseHand = (which: Hand): void => { setHand(which); base.current = null; };
  const toggleFlip = (): void => { base.current = null; setFlip((f) => !f); };

  const { h, m } = time;
  const text = `${h}:${String(m).padStart(2, "0")}`;
  return (
    <div>
      <p className="ui-hint pz-hint">Set the hands to the time on the stopped clock you saw.</p>
      <div className="pz-field pz-visual">
        <svg ref={board} viewBox="0 0 300 300" className="pz-board pz-clock-board" role="application" aria-label="Clock to set" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <ClockDial />
          <ClockHands h={h} m={m} active={hand} />
        </svg>
        <p className="pz-readout pz-ck-readout" role="img" aria-label={`The clock shows ${text}`}>{text}</p>
      </div>
      <p className="ui-hint pz-hint">Drag a hand round the dial, or use the buttons.</p>
      <div className="pz-field">
        <div className={twist ? "pz-grid4" : "pz-grid3"}>
          <div className="pz-contents" role="group" aria-label="Which hand">
            <button type="button" className="ui-button" aria-pressed={hand === "hour"} aria-label="Hour hand" onClick={() => chooseHand("hour")}>Hour</button>
            <button type="button" className="ui-button" aria-pressed={hand === "minute"} aria-label="Minute hand" onClick={() => chooseHand("minute")}>Minute</button>
          </div>
          <button type="button" className="ui-button" aria-pressed={twist} onClick={() => void toggleTwist()}>{twist ? "Twist: on" : "Twist"}</button>
          {twist ? <button type="button" className="ui-button" aria-pressed={flip} aria-label="Turns the wrong way? Flip it" onClick={toggleFlip}>Flip</button> : null}
        </div>
        <div className="pz-grid4">
          <button type="button" className="ui-button" aria-label="Hour back" onClick={() => step("hour", -1)}>Hour −</button>
          <button type="button" className="ui-button" aria-label="Hour forward" onClick={() => step("hour", 1)}>Hour +</button>
          <button type="button" className="ui-button" aria-label="Minutes back" onClick={() => step("minute", -1)}>Min −</button>
          <button type="button" className="ui-button" aria-label="Minutes forward" onClick={() => step("minute", 1)}>Min +</button>
        </div>
      </div>
      <div className="pz-twist">
        <p className="ui-hint pz-hint">{twist ? "Hold the phone upright and turn it like a wheel to turn the chosen hand." : "Twist: turn the phone like a wheel to turn a hand."}</p>
      </div>
      <button type="button" className="ui-button ui-button--primary pz-wide" onClick={() => submit({ h, m })}>Set this time</button>
    </div>
  );
}

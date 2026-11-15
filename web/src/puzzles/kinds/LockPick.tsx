import { useEffect, useId, useRef, useState, type ChangeEvent, type MouseEvent, type PointerEvent } from "react";
import { tiltToPosition } from "@hauntology/shared/puzzles/motion";
import { useFeelValue, useFrame, useLatest } from "../hooks";
import type { KindProps } from "./types";
import "./LockPick.css";

type Heat = "idle" | "cold" | "cool" | "warm" | "hot";
type Held = { button: boolean; slider: boolean; latch: boolean };
const HEAT_TEXT: Readonly<Record<Heat, string>> = {
  idle: "Hold Tension, then move the pick.",
  cold: "Cold",
  cool: "Cool",
  warm: "Warm",
  hot: "Hot: hold still",
};
/** The text twin of the hot-and-cold buzz. */
const heatOf = (distance: number, windowDeg: number): Heat => (distance <= windowDeg / 2 ? "hot" : distance < 14 ? "warm" : distance < 28 ? "cool" : "cold");

/**
 * Lock pick: hold the tension, move the pick, feel for each pin's hidden sweet spot. Touch path: touching the slider is the
 * tension, so one finger is enough. Tilt: lean the phone to move the pick while Tension is held. A pin sets after the pick
 * stays in its window for the dwell time; pins set in order, left to right.
 */
export default function LockPick({ view, feel, reducedMotion, submit, elapsed, announce, resetKey }: KindProps<"lockpick">) {
  const [lo, hi] = view.range;
  const [cur, setCur] = useState(0);
  const [heat, setHeat] = useState<Heat>("idle");
  const [tension, setTension] = useState(false);
  const tilt = useFeelValue(feel.motion.subscribe, () => feel.motion.state);
  const pos = useRef(0);
  const dwell = useRef(0);
  const inWindow = useRef(false);
  const sets = useRef<Array<{ pin: number; atDeg: number; atMs: number }>>([]);
  const held = useRef<Held>({ button: false, slider: false, latch: false });
  const slider = useRef<HTMLInputElement>(null);
  const sliderId = useId();
  const latest = useLatest({ cur, tension, heat });

  const feelHeat = (h: Heat): void => { if (latest.current.heat !== h) { latest.current.heat = h; setHeat(h); } };
  const hold = (key: keyof Held, on: boolean): void => {
    held.current[key] = on;
    const any = held.current.button || held.current.slider || held.current.latch;
    if (any === latest.current.tension) return;
    latest.current.tension = any;
    setTension(any);
    if (!any) { dwell.current = 0; inWindow.current = false; feelHeat("idle"); }
  };

  // A wrong Attempt starts the pins again (the host raises resetKey); the pick stays where it is.
  const seen = useRef(resetKey);
  useEffect(() => {
    if (seen.current === resetKey) return;
    seen.current = resetKey;
    sets.current = [];
    dwell.current = 0;
    inWindow.current = false;
    latest.current.cur = 0;
    setCur(0);
  }, [resetKey, latest]);

  useFrame((_t, dt) => {
    const L = latest.current;
    if (L.tension && feel.motion.state === "on") {
      pos.current = tiltToPosition(feel.motion.tilt.x, lo, hi);
      if (slider.current) slider.current.value = String(pos.current);
    }
    if (!L.tension) return;
    const center = view.centers[L.cur];
    if (center === undefined) return;
    const d = Math.abs(pos.current - center);
    const inside = d <= view.windowDeg / 2;
    feelHeat(heatOf(d, view.windowDeg));
    if (!inside) {
      dwell.current = 0;
      inWindow.current = false;
      feel.haptics.hotCold(d, view.windowDeg);
      return;
    }
    if (!inWindow.current) { inWindow.current = true; feel.haptics.buzz("click"); feel.synth.play("click"); }
    feel.haptics.hotCold(0, view.windowDeg); // inside the window the pulse interval is its shortest
    dwell.current += dt;
    if (dwell.current < view.dwellMs) return;
    // The frame time says the dwell is done. The host's clock must agree by a whole dwell between two sets (its reading can
    // differ from the frame time by a millisecond), or the recorded times could be closer together than the Lock allows.
    const atMs = Math.round(elapsed());
    const prev = sets.current[sets.current.length - 1];
    if (prev !== undefined && atMs - prev.atMs < view.dwellMs) return;
    sets.current.push({ pin: L.cur, atDeg: Math.round(pos.current * 10) / 10, atMs });
    feel.haptics.buzz("thunk");
    feel.synth.play("thunk");
    const next = L.cur + 1;
    L.cur = next;
    setCur(next);
    dwell.current = 0;
    inWindow.current = false;
    announce(`Pin ${next} of ${view.pins} set`);
    if (next >= view.pins) {
      held.current = { button: false, slider: false, latch: false };
      L.tension = false;
      setTension(false);
      feelHeat("idle");
      submit({ sets: sets.current.slice() });
    }
  }, cur < view.pins);

  const onSlide = (e: ChangeEvent<HTMLInputElement>): void => { pos.current = Number(e.currentTarget.value); };
  // A keyboard or screen-reader press is a click with no pointer (`detail` 0): it latches the tension on or off.
  const onButtonClick = (e: MouseEvent): void => { if (e.detail === 0) hold("latch", !held.current.latch); };
  const onButtonDown = (e: PointerEvent<HTMLButtonElement>): void => { e.currentTarget.setPointerCapture?.(e.pointerId); hold("button", true); };

  return (
    <div>
      <p className="pz-hint">Feel for each pin's sweet spot. Pins set left to right.</p>
      <ol className={`pz-pins${reducedMotion ? " pz-pins-still" : ""}`} aria-label="Pins">
        {Array.from({ length: view.pins }, (_, i) => {
          const state = i < cur ? "set" : i === cur ? "picking" : "waiting";
          return <li key={i} className={`pz-pin pz-pin-${state}`}><span className="pz-sr">{`Pin ${i + 1} of ${view.pins}: ${state}`}</span><i aria-hidden="true" /></li>;
        })}
      </ol>
      <p className="pz-heat" data-heat={heat}>{HEAT_TEXT[heat]}</p>
      <label className="pz-slider-label" htmlFor={sliderId}>Pick position: slide left or right</label>
      <input
        id={sliderId} ref={slider} type="range" className="pz-slider" min={lo} max={hi} step={0.5} defaultValue={0}
        onChange={onSlide} onPointerDown={() => hold("slider", true)} onPointerUp={() => hold("slider", false)} onPointerCancel={() => hold("slider", false)}
      />
      <button type="button" className="pz-btn pz-hold" aria-pressed={tension} onClick={onButtonClick} onPointerDown={onButtonDown} onPointerUp={() => hold("button", false)} onPointerCancel={() => hold("button", false)}>
        Tension (hold)
      </button>
      <p className="pz-hint">{tilt === "on" ? "Tilt is on: hold Tension and lean the phone to move the pick." : "Touching the slider holds the tension for you. Or hold the Tension button."}</p>
    </div>
  );
}

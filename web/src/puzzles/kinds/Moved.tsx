import { useEffect, useRef, useState } from "react";
import { dimPlan } from "@hauntology/shared/puzzles/dim";
import { Shelf } from "../art/shelf";
import { useLatest } from "../hooks";
import type { KindProps } from "./types";
import "./Moved.css";

/** The first step of the dim waits one tick, so the lit shelf is painted before it fades. */
const FIRST_STEP_MS = 30;

/**
 * What moved: the lights go out for two seconds (a fade, never a flash; one still dim step for reduced motion) and the
 * phone rumbles once. When the lights come back, tap every spot that is not as it was: swapped, new or missing, then
 * press "These changed". The shelf as it was is not shown here: the Player saw it in an earlier place.
 */
export default function Moved({ view, feel, reducedMotion, submit, announce, resetKey }: KindProps<"moved">) {
  const [lit, setLit] = useState(false);
  const [lum, setLum] = useState(() => dimPlan(reducedMotion)[0]?.lum ?? 0.3);
  const [picked, setPicked] = useState<ReadonlySet<number>>(() => new Set());
  const fired = useRef(false);
  const latest = useLatest({ picked, view, feel, announce, reducedMotion });
  const cols = view.slots === 6 ? 3 : 4;

  // The dark: runs once, on mount. Every timer goes when the screen does.
  useEffect(() => {
    const { view: v, feel: f, announce: say, reducedMotion: reduced } = latest.current;
    const plan = dimPlan(reduced);
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    if (!fired.current) { // a remount in development must not rumble twice
      fired.current = true;
      f.haptics.buzz("rumble");
      f.synth.play("creak");
    }
    say(`The lights go out for ${Math.round(v.darkMs / 1000)} seconds.`);
    setLit(false);
    setLum(plan[0]?.lum ?? 0.3);
    // Each step of the plan starts the fade to the next level (the fade itself is CSS).
    plan.forEach((step, i) => {
      const next = plan[i + 1];
      if (next === undefined) return;
      timers.push(setTimeout(() => setLum(next.lum), Math.max(FIRST_STEP_MS, step.t)));
    });
    timers.push(setTimeout(() => { setLit(true); say("The lights are back. Tap everything that changed."); }, v.darkMs));
    return () => { for (const id of timers) clearTimeout(id); };
  }, [latest]);

  // A wrong Attempt clears the chosen spots (the host raises resetKey). The dark does not play again.
  const seen = useRef(resetKey);
  useEffect(() => {
    if (seen.current === resetKey) return;
    seen.current = resetKey;
    latest.current.picked = new Set();
    setPicked(new Set());
  }, [resetKey, latest]);

  const toggle = (slot: number): void => {
    const next = new Set(latest.current.picked);
    if (next.has(slot)) next.delete(slot); else next.add(slot);
    latest.current.picked = next;
    setPicked(next);
    feel.haptics.buzz("tick");
    feel.synth.play("tick");
  };
  const submitNow = (): void => submit({ changed: [...latest.current.picked].sort((a, b) => a - b) });

  if (!lit) {
    return (
      <div className="pz-moved" data-phase="dark">
        <p className="pz-hint pz-moved-note" role="status">The lights go out…</p>
        {/* the shelf in the dark: only the empty spots, so nothing of the answer shows */}
        <div className={`pz-moved-dark pz-visual${reducedMotion ? " pz-moved-still" : ""}`} style={{ opacity: lum, gridTemplateColumns: `repeat(${cols}, 1fr)` }} aria-hidden="true">
          {Array.from({ length: view.slots }, (_, i) => <span key={i} className="pz-slot pz-slot-empty" />)}
        </div>
      </div>
    );
  }
  return (
    <div className="pz-moved" data-phase="lit">
      <p className="ui-hint pz-hint">Tap everything that changed on the shelf you saw: swapped, new or missing.</p>
      <div className="pz-field">
        <Shelf items={view.after} cols={cols} selected={picked} onPick={toggle} />
        <p className="pz-readout pz-moved-count" role="status">{picked.size} chosen</p>
      </div>
      <button type="button" className="ui-button ui-button--primary pz-wide" onClick={submitNow}>These changed</button>
    </div>
  );
}

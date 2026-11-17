import { useEffect, useRef, useState, type ReactNode } from "react";
import { knockPlayTimes } from "@hauntology/shared/puzzles/knock";
import type { Sight } from "@hauntology/shared/puzzles/types";
import type { PuzzleFeel } from "./feel/types";
import { useLatest } from "./hooks";
import { SightClue } from "./SightClue";

/**
 * A clue shown once on a phone, in an earlier place (the Sight) or at the Lock when it was missed (the Faded clue).
 * It closes on its own when `showMs` is up, or when the Player taps "Got it". A heartbeat buzz marks its arrival; the
 * countdown is text and a bar redrawn a few times a second, so it needs no animation.
 */
export function SightCard({ sight, title, feel, onDone, now = () => performance.now() }: { sight: Sight; title: string; feel: PuzzleFeel; onDone: () => void; now?: () => number }): ReactNode {
  const latestDone = useLatest(onDone);
  const fired = useRef(false);
  const done = { current: () => { if (!fired.current) { fired.current = true; latestDone.current(); } } }; // however it closes, it closes once
  const [left, setLeft] = useState(sight.showMs);
  useEffect(() => {
    feel.haptics.newAttempt();
    feel.haptics.buzz("heartbeat");
    const start = now();
    const timer = setInterval(() => {
      const remaining = sight.showMs - (now() - start);
      if (remaining <= 0) { clearInterval(timer); setLeft(0); done.current(); } else setLeft(remaining);
    }, 100);
    // a secret knock is heard: the ghost knocks it once, a thunk and a buzz for each knock, after the heartbeat (the dots and words show it too)
    const p = sight.payload;
    const knocks = p.kind === "knock" ? knockPlayTimes(p).map((ms) => setTimeout(() => { feel.synth.play("thunk"); feel.haptics.buzz("tick"); }, 500 + ms)) : [];
    return () => { clearInterval(timer); for (const k of knocks) clearTimeout(k); };
    // the card starts once, when it appears
  }, []);
  return (
    <div className="ui-panel pz-card" role="dialog" aria-label={title}>
      <h2 className="ui-heading">{title}</h2>
      <div className="pz-clue"><SightClue sight={sight} /></div>
      <div className="ui-gauge ui-gauge--thin" aria-hidden="true"><i className="ui-gauge-fill" style={{ width: `${Math.max(0, Math.min(100, (left / sight.showMs) * 100))}%` }} /></div>
      <p className="ui-hint" aria-live="off">{Math.ceil(left / 1000)} s</p>
      <button type="button" className="ui-button ui-button--primary" onClick={() => done.current()}>Got it</button>
    </div>
  );
}

import { useEffect, useRef, useState, type ReactNode } from "react";
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
    return () => clearInterval(timer);
    // the card starts once, when it appears
  }, []);
  return (
    <div className="pz-card" role="dialog" aria-label={title}>
      <h2 className="pz-title">{title}</h2>
      <div className="pz-clue"><SightClue sight={sight} /></div>
      <div className="pz-bar" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, (left / sight.showMs) * 100))}%` }} /></div>
      <p className="pz-muted" aria-live="off">{Math.ceil(left / 1000)} s</p>
      <button type="button" className="pz-btn" onClick={() => done.current()}>Got it</button>
    </div>
  );
}

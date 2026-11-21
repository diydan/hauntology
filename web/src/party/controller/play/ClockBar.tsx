import { useEffect, useRef, useState, type ReactNode } from "react";
import { achievementsOf, clockWords, remainingMs, turnOf, WARNING_MS } from "./play-logic";
import type { GameView } from "../game-view";

/**
 * The Turn Clock, its 10 second warning and the Achievements this seat earned (party-mode 9.9). The time is the Room's deadline read on the
 * Room's clock; nothing is decided here. The warning is said once, in words, to a polite live region, and does not flash.
 */
export function ClockBar({ game, me, offsetMs, nowMs }: { game: GameView; me: number; offsetMs: number; nowMs: number }): ReactNode {
  const pub = game.pub;
  const turn = turnOf(game, me);
  const left = remainingMs(pub?.deadlineMs ?? null, nowMs, offsetMs);
  const paused = pub?.paused === true;
  const warning = left !== null && !paused && left <= WARNING_MS && left > 0;
  // say "10 seconds left" once per Turn, not on every tick
  const said = useRef<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const key = `${pub?.round ?? 0}:${pub?.active ?? "-"}:${pub?.deadlineMs ?? "-"}`;
  useEffect(() => {
    if (warning && said.current !== key) { said.current = key; setAnnounce(turn.mine ? "Ten seconds left on your turn." : `Ten seconds left on ${turn.name}'s turn.`); }
    if (!warning && said.current !== key) setAnnounce("");
  }, [warning, key, turn.mine, turn.name]);
  const gained = achievementsOf(pub, me);
  const who = turn.activeSeat === null ? "No one's turn" : turn.mine ? "Your turn" : `${turn.name}'s turn`;
  return (
    <section className="pc-clock ui-stack--tight" aria-label="Turn clock">
      <div className="ui-row ui-row--between">
        <span className="ui-eyebrow">Round {pub?.round ?? 1} · {who}</span>
        <span className={`ui-chip${warning ? " is-active" : ""}`} role="timer" aria-label={`Time left ${clockWords(left, paused)}`}>{clockWords(left, paused)}</span>
      </div>
      <p className="ui-sr-only" role="status" aria-live="polite">{announce}</p>
      {warning ? <p className="ui-hint">Under ten seconds left.</p> : null}
      {gained.length > 0 ? (
        <ul className="ui-chips" aria-label="Your Achievements">
          {gained.map((a) => <li key={a.id} className="ui-chip">{a.label} (+{a.seconds} s)</li>)}
        </ul>
      ) : null}
    </section>
  );
}

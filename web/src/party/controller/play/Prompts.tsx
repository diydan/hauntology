import type { ReactNode } from "react";
import type { GameView } from "../game-view";
import { HAUNT_WORDS, nameOf, secondsLeft } from "./play-logic";

type Send = (msg: Readonly<{ t: string } & Record<string, unknown>>) => void;

/**
 * "Which card do you show?" (party-mode 9.23): shown only to the Player who holds several of the named cards, with the 10 second countdown and what
 * happens when it runs out, in words. The default is the Room's, so the phone does not guess it.
 */
export function AnswerPrompt({ game, send, nowMs, offsetMs }: { game: GameView; send: Send; nowMs: number; offsetMs: number }): ReactNode {
  const a = game.priv?.answer;
  if (a == null) return null;
  const left = secondsLeft(a.deadlineMs, nowMs, offsetMs);
  return (
    <section className="ui-card ui-stack" aria-label="Choose a card to show" role="alertdialog" aria-labelledby="pc-answer-title">
      <h2 className="ui-heading" id="pc-answer-title">Which card do you show?</h2>
      <p className="ui-hint" role="status">You hold more than one of the named cards. Only the one who asked sees it. {left > 0 ? `${left} s left.` : "Time is up."} If you do not choose, the Room chooses for you.</p>
      <div className="ui-choices">
        {a.options.map((id) => <button key={id} type="button" className="ui-button ui-choice" onClick={() => send({ t: "show", card: id })}>{nameOf(game.pub, id)}</button>)}
      </div>
    </section>
  );
}

/** A haunting Player's Haunt Event choice with the 15 second countdown (party-mode 9.12). The default is the first option, and the Room says so. */
export function HauntChoice({ game, send, nowMs, offsetMs }: { game: GameView; send: Send; nowMs: number; offsetMs: number }): ReactNode {
  const c = game.priv?.choose;
  if (c == null) return null;
  const left = secondsLeft(c.deadlineMs, nowMs, offsetMs);
  return (
    <section className="ui-card ui-stack" aria-label="Choose a haunt event" role="alertdialog" aria-labelledby="pc-haunt-title">
      <h2 className="ui-heading" id="pc-haunt-title">The house stirs. Choose what happens.</h2>
      <p className="ui-hint" role="status">{left > 0 ? `${left} s to choose.` : "Time is up."} If you do not, the first one happens.</p>
      <div className="ui-stack--tight">
        {c.options.map((o) => (
          <button key={o} type="button" className="ui-button ui-button--block" onClick={() => send({ t: "choose", option: o })}>
            <strong>{HAUNT_WORDS[o]?.name ?? o}</strong> <span className="ui-hint">{HAUNT_WORDS[o]?.line ?? ""}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** A Rattle prompt from the Room (party-mode 19.7, 9.19): one line, one button to turn Rattle on, and a way to dismiss it. It names no sender. */
export function RattlePrompt({ game, send, onDismiss }: { game: GameView; send: Send; onDismiss: () => void }): ReactNode {
  const p = game.prompt;
  if (p === null) return null;
  return (
    <section className="ui-card ui-stack--tight" aria-label="Rattle" role="status">
      <p className="ui-lead">{p.text}</p>
      <div className="ui-row">
        <button type="button" className="ui-button ui-button--primary" onClick={() => { send({ t: "rattleOn", on: true }); onDismiss(); }}>Turn on Rattle</button>
        <button type="button" className="ui-button" onClick={onDismiss}>Not now</button>
      </div>
    </section>
  );
}

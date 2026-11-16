import type { ReactNode } from "react";
import { clueRows, codeSoFar, type SpiritClue } from "@hauntology/shared/puzzles/clues";
import "./ClueList.css";

/**
 * The Clue list of the Spirit clues layer (puzzles 15.7): every clue as text, read or "Not found yet", with "Code so far" and
 * a "Show all as text" button that reads every clue at once, so a Lock never needs the Player to turn round. An unread
 * clue shows nothing of itself, only its name. Every control is at least 48 pixels tall.
 */
export function ClueList({ clues, read, onShowAll, onClose }: { clues: readonly SpiritClue[]; read: ReadonlySet<string>; onShowAll: () => void; onClose?: () => void }): ReactNode {
  const rows = clueRows(clues, read), code = codeSoFar(clues, read), found = rows.filter((r) => r.text !== null).length;
  return (
    <section className="cl-list ui-panel" aria-label="Clues">
      <header className="ui-row ui-row--between">
        <h2 className="ui-heading">Clues <span className="ui-hint">{found} of {rows.length}</span></h2>
        {onClose ? <button type="button" className="ui-button cl-button" onClick={onClose}>Close</button> : null}
      </header>
      {code.length > 0 ? <p className="cl-code" aria-label="Code so far">Code so far: {code.map((d) => d ?? "?").join(" ")}</p> : null}
      <ul className="cl-rows">
        {rows.map((r) => (
          <li key={r.id} data-found={r.text === null ? "0" : "1"}>
            <b>{r.title}</b>
            <span>{r.text ?? "Not found yet"}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="ui-button cl-button" onClick={onShowAll} disabled={found === rows.length}>Show all as text</button>
    </section>
  );
}

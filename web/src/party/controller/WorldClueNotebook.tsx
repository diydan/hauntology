import type { ReactNode } from "react";
import type { PublicWorldClue } from "@hauntology/shared/puzzles/world-clues";
import { SightClue } from "../../puzzles/SightClue";
import { SignChip } from "../../puzzles/SignBadge";

/**
 * Assist World Clue notebook (`.kiro/specs/world-clues`, Requirements 3.2, 4.3):
 * lists each World Clue and Decoy seen on the Player's own Turn inside a shared `ui-panel` with `ui-log` rows.
 */
export function WorldClueNotebook({ clues }: { clues: readonly PublicWorldClue[] }): ReactNode {
  return (
    <section className="ui-panel ui-stack--tight" data-slot="notebook" aria-label="Notebook">
      <h2 className="ui-heading">World clues</h2>
      <ol className="ui-log">
        {clues.map((clue) => (
          <li key={`${clue.zone}-${clue.sign}`} className="ui-log-row ui-stack--tight">
            <div className="ui-row ui-row--between">
              <SignChip sign={clue.sign} />
              <span className="ui-log-id">{clue.zone}</span>
            </div>
            <SightClue sight={{ kind: clue.sight.kind, payload: clue.sight, showMs: 8000 }} />
          </li>
        ))}
      </ol>
    </section>
  );
}

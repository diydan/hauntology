import { useEffect, useMemo, useState, type ReactNode } from "react";
import { autoMarks, cellMark, residueFound, type Column, type Mark, type PlayerMarks } from "@hauntology/shared/party/notebook";
import type { Theory } from "@hauntology/shared/party/theory";
import { TheoryChoice } from "../../../table/TheoryChoice";
import type { GameView } from "../game-view";
import { knowledgeOf } from "./play-logic";
import { loadNotebook, nextCell, saveNotebook, type StorageLike } from "./notebook-store";

const GLYPH: Readonly<Record<Mark, string>> = { blank: "", has: "✓", lacks: "✗", maybe: "?" };
const WORD: Readonly<Record<Mark, string>> = { blank: "no mark", has: "has it", lacks: "does not have it", maybe: "maybe" };

/**
 * The hand and the notebook grid (party-mode 9.6, 9.26): the 18 cards against every Player and the Residue. The game fills only what this
 * Player knows for certain (their Hand, the cards shown to them, the Residue they found, and with auto-cross the passes); their own marks
 * are kept apart, cycle on a tap, and live on this device only. Cells are 48 px, each says its card, column and mark in words, and a mark
 * is a glyph, never a colour alone. The Theory marks sit below the grid.
 */
export function Notebook({ game, me, code, autoCross, storage }: { game: GameView; me: number; code: string; autoCross: boolean; storage: StorageLike }): ReactNode {
  const pub = game.pub;
  const [marks, setMarks] = useState<PlayerMarks>(() => loadNotebook(storage, code, me).marks);
  const [theory, setTheory] = useState<Theory>(() => loadNotebook(storage, code, me).theory);
  useEffect(() => { saveNotebook(storage, code, me, marks, theory); }, [storage, code, me, marks, theory]);
  const know = useMemo(() => knowledgeOf(game, me, autoCross), [game, me, autoCross]);
  const auto = useMemo(() => autoMarks(know), [know]);
  if (pub === null) return null;
  const cards = [...pub.suspects.map((c) => ({ ...c, group: "Suspects" })), ...pub.zones.map((c) => ({ ...c, group: "Rooms" })), ...pub.relics.map((c) => ({ ...c, group: "Relics" }))];
  const cols: { col: Column; name: string }[] = [...pub.seats.map((s) => ({ col: s.seat as Column, name: s.seat === me ? "You" : s.nickname })), { col: "residue", name: "Residue" }];
  const found = residueFound(know);
  return (
    <section className="pc-notebook ui-stack" aria-label="Notebook">
      <div className="ui-row ui-row--between">
        <h2 className="ui-heading">Notebook</h2>
        <span className="ui-chip" role="status">Residue found: {found} of 3</span>
      </div>
      <p className="ui-hint">Tap a square to mark it: has it, does not have it, maybe. {autoCross ? "Auto-cross is on: a pass fills in a cross for you." : "Only what you know for certain fills in by itself."} Only you see this.</p>
      <div className="pc-grid-wrap">
        <table className="pc-grid">
          <caption className="ui-sr-only">Cards against players</caption>
          <thead>
            <tr><th scope="col">Card</th>{cols.map((c) => <th key={String(c.col)} scope="col">{c.name}</th>)}</tr>
          </thead>
          <tbody>
            {cards.map((card) => (
              <tr key={card.id}>
                <th scope="row">{card.name}<span className="ui-sr-only"> ({card.group})</span></th>
                {cols.map((c) => {
                  const mark = cellMark(auto, marks, card.id, c.col);
                  return (
                    <td key={String(c.col)}>
                      <button
                        type="button" className="ui-button pc-cell" data-mark={mark}
                        aria-label={`${card.name}, ${c.name}: ${WORD[mark]}`}
                        onClick={() => setMarks((m) => nextCell(m, card.id, c.col, cellMark(auto, m, card.id, c.col)))}
                      >{GLYPH[mark]}</button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TheoryChoice suspects={pub.suspects} zones={pub.zones} theory={theory} onChange={setTheory} />
    </section>
  );
}

/** The cards in this seat's Hand, by name and group, as plain chips. */
export function Hand({ game }: { game: GameView }): ReactNode {
  const pub = game.pub;
  const hand = game.priv?.hand ?? [];
  const name = (id: string): string => pub?.suspects.find((c) => c.id === id)?.name ?? pub?.zones.find((c) => c.id === id)?.name ?? pub?.relics.find((c) => c.id === id)?.name ?? id;
  const kindWord = { suspect: "Suspect", zone: "Room", relic: "Relic" } as const;
  return (
    <section className="pc-hand ui-stack--tight" aria-label="Your hand">
      <h2 className="ui-heading">Your hand</h2>
      {hand.length === 0 ? <p className="ui-hint">No cards yet.</p> : (
        <ul className="ui-chips">
          {hand.map((c) => <li key={c.id} className="ui-chip">{name(c.id)} <span className="ui-hint">({kindWord[c.kind as keyof typeof kindWord] ?? c.kind})</span></li>)}
        </ul>
      )}
    </section>
  );
}

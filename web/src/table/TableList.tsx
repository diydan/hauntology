import type { ReactNode } from "react";
import type { Theory } from "@hauntology/shared/party/theory";
import { describePiece, type PieceId, type TableModel } from "./model";
import { TheoryChoice } from "./TheoryChoice";
import "./table.css";

/**
 * The Table list (spirit-table 3.2 of the plan, Requirement 6.3): the text twin of the Table. Every room with its Pawns and the Player's own
 * Marks, every Suspect and Relic, and the room choice per Suspect (9.5). It is the only view when WebGL is missing, and every piece has its
 * text here, so nothing on the Table is only a picture. It reads the same `TableModel` the drawing does, so the two cannot disagree.
 */
export function TableList({ model, theory, onTheory, notice, onPick }: {
  model: TableModel;
  theory: Theory;
  onTheory: (next: Theory) => void;
  /** One line that says why this is the only view (no WebGL), or nothing. */
  notice?: string;
  /** Called with a piece's id when its row is tapped, to open its card on the Table (not needed when the list is the only view). */
  onPick?: (id: PieceId) => void;
}): ReactNode {
  const atDoor = model.pawns.filter((p) => p.zone === "door");
  const row = (id: PieceId, label: string, text: string): ReactNode => (
    <li key={id} className="st-row" data-piece={id}>
      {onPick ? <button type="button" className="ui-button st-row-button" onClick={() => onPick(id)} aria-label={`${label}. ${text}`}><span className="st-row-name">{label}</span></button> : <span className="st-row-name">{label}</span>}
      <span className="st-row-text">{text}</span>
    </li>
  );
  return (
    <section className="st-list ui-stack" aria-label="Spirit table, as a list">
      {notice ? <p className="ui-notice" role="status">{notice}</p> : null}
      <section className="ui-panel" aria-labelledby="st-rooms">
        <h2 className="ui-heading" id="st-rooms">Rooms</h2>
        <ul className="st-rows">{model.rooms.map((r) => row(r.id, r.name, describePiece(model, r)))}</ul>
        {atDoor.length ? <p className="ui-hint">At the front door: {atDoor.map((p) => p.nickname).join(", ")}.</p> : null}
      </section>
      <section className="ui-panel" aria-labelledby="st-suspects">
        <h2 className="ui-heading" id="st-suspects">Suspects</h2>
        <ul className="st-rows">{model.suspects.map((s) => row(s.id, s.name, describePiece(model, s)))}</ul>
      </section>
      <section className="ui-panel" aria-labelledby="st-relics">
        <h2 className="ui-heading" id="st-relics">Relics</h2>
        <ul className="st-rows">{model.relics.map((r) => row(r.id, r.name, describePiece(model, r)))}</ul>
      </section>
      <p className="ui-hint">The Whisper: {describePiece(model, model.whisper)}</p>
      <TheoryChoice
        suspects={model.suspects.map((s) => ({ id: s.card, name: s.name }))}
        zones={model.rooms.map((r) => ({ id: r.zone, name: r.name }))}
        theory={theory}
        onChange={onTheory}
      />
    </section>
  );
}

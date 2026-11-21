import type { ReactNode } from "react";
import type { TableData } from "@hauntology/shared/table/data";
import type { TablePawn } from "@hauntology/shared/table/pawns";
import "./TableDataList.css";

const MARK_WORDS = { ruled_out: "ruled out", maybe: "maybe" } as const;

function PawnLine({ pawn }: { pawn: TablePawn }): ReactNode {
  const tags = [pawn.active ? "their turn" : null, pawn.mono ? "poltergeist" : null].filter((t): t is string => t !== null);
  return (
    <li>
      {pawn.nickname}
      {tags.length > 0 ? <span className="tl-tag"> ({tags.join(", ")})</span> : null}
    </li>
  );
}

/**
 * The Spirit table as a plain list (spirit-table 3.2): every room with its Pawns, the Cold Spot, what this Player has
 * inspected and their own marks, then every Suspect and Relic with its mark. It reads the same `TableData` as the 3D
 * table, so it says nothing the table does not, and it is the only view when WebGL is missing. Text only: each line is
 * read out by a screen reader as it stands.
 */
export function TableDataList({ data, playerSeat }: { data: TableData; playerSeat?: number | null }): ReactNode {
  const pawnsIn = (zone: string): TablePawn[] => data.pawns.filter((p) => p.zone === zone);
  const doorPawns = data.pawns.filter((p) => p.zone === "door");
  const ended = data.ended;
  return (
    <section className="tl ui-panel" aria-label="The Spirit table as a list">
      <h2 className="ui-heading">The table</h2>
      <p className="ui-hint">
        Haunt {data.haunt.level} of {data.haunt.max}.{playerSeat === undefined || playerSeat === null ? "" : " Your marks show only to you."}
      </p>

      <h3 className="ui-eyebrow">Rooms</h3>
      <ul className="tl-list">
        {data.rooms.map((room) => {
          const here = pawnsIn(room.zone);
          const placed = data.suspects.filter((s) => s.placedIn === room.zone);
          const flags = [
            room.coldSpot ? "Cold Spot" : null,
            room.inspected ? "you have read it" : null,
            room.mark !== undefined ? `your mark: ${MARK_WORDS[room.mark]}` : null,
          ].filter((f): f is string => f !== null);
          return (
            <li key={room.zone} className="tl-room">
              <strong>{room.name}</strong>
              {flags.length > 0 ? <span className="tl-tag"> ({flags.join("; ")})</span> : null}
              <ul className="tl-sub" aria-label={`Players in ${room.name}`}>
                {here.length === 0 ? <li className="tl-empty">No one here</li> : here.map((p) => <PawnLine key={p.seat} pawn={p} />)}
                {placed.map((s) => (
                  <li key={`theory-${s.card}`} className="tl-theory">
                    {s.name}: your theory puts them here
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>

      {doorPawns.length > 0 ? (
        <>
          <h3 className="ui-eyebrow">At the door</h3>
          <ul className="tl-sub">{doorPawns.map((p) => <PawnLine key={p.seat} pawn={p} />)}</ul>
        </>
      ) : null}

      <h3 className="ui-eyebrow">Suspects</h3>
      <ul className="tl-sub">
        {data.suspects.map((s) => (
          <li key={s.card}>
            {s.name}
            {s.mark !== undefined ? <span className="tl-tag"> ({MARK_WORDS[s.mark]})</span> : null}
          </li>
        ))}
      </ul>

      <h3 className="ui-eyebrow">Relics</h3>
      <ul className="tl-sub">
        {data.relics.map((r) => (
          <li key={r.card}>
            {r.name}
            {r.mark !== undefined ? <span className="tl-tag"> ({MARK_WORDS[r.mark]})</span> : null}
          </li>
        ))}
      </ul>

      {ended !== undefined ? (
        <p className="tl-answer" role="status">
          The answer: {data.suspects.find((s) => s.card === ended.suspect)?.name ?? ended.suspect}, with{" "}
          {data.relics.find((r) => r.card === ended.relic)?.name ?? ended.relic}, in the{" "}
          {data.rooms.find((r) => r.zone === ended.zone)?.name ?? ended.zone}.
        </p>
      ) : null}
    </section>
  );
}

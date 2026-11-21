import type { PrivateSnapshot, PublicSnapshot } from "@hauntology/shared/party/engine";
import { useState, type ReactNode } from "react";
import { namesOf, notebook } from "./words";

/**
 * The game's own sections, one list for the shared screen of the solo case and for a phone's Controller (integration 4.2, 5.1): a refusal in words,
 * the answer choice, the house's choice, a Haunting puzzle for a Player who joined the haunting, the turn (go, search, end, ask), the hand and
 * notebook, and the accusation with a second press. It reads only the two views the Room sent and sends one Room message for each press: the
 * Room decides what is allowed.
 */
export const REFUSALS: Record<string, string> = {
  not_your_turn: "It is not your turn.",
  already_inspected: "You have searched this room already.",
  already_suggested: "You have asked once this turn.",
  not_in_zone: "Go to a room first.",
  zone_closed: "A shut door blocks the way to that room.",
  puzzle_attempts_spent: "You have haunted with a puzzle this round already. Another one opens next round.",
  puzzle_already_open: "A puzzle is open already.",
  answering_choice: "The house is waiting on you to choose first.",
  puzzle_disabled: "Puzzles are off in this case.",
};

export type SendRoom = (msg: Readonly<{ t: string }> & Record<string, unknown>) => void;

export function GameSections({ view, me, seat, send, refused }: { view: PublicSnapshot; me: PrivateSnapshot | null; seat: number | null; send: SendRoom; refused: string | null }): ReactNode {
  const [ask, setAsk] = useState({ suspect: "", relic: "" });
  const [seal, setSeal] = useState({ suspect: "", zone: "", relic: "", sure: false });
  const n = namesOf(view, seat);
  const mine = view.active !== null && view.active === seat;
  return (
    <>
      {refused ? <p className="ui-notice" role="alert">{REFUSALS[refused] ?? `Not now (${refused}).`}</p> : null}

      {me?.answer ? (
        <section className="ui-panel ui-stack" aria-label="Show a card">
          <p>Someone asked about a card you hold. Show one:</p>
          <div className="ui-row">
            {me.answer.options.map((id) => (
              <button key={id} type="button" className="ui-button" onClick={() => send({ t: "show", card: id })}>Show {n.card(id)}</button>
            ))}
          </div>
        </section>
      ) : null}

      {me?.choose ? (
        <section className="ui-panel ui-stack" aria-label="The house stirs">
          <p>The house stirs. You choose what happens:</p>
          <div className="ui-row">
            {me.choose.options.map((o) => (
              <button key={o} type="button" className="ui-button" onClick={() => send({ t: "choose", option: o })}>{o.replace("-", " ")}</button>
            ))}
          </div>
        </section>
      ) : null}

      {view.seats.find((x) => x.seat === seat)?.poltergeist === true && view.puzzleSetting !== "off" ? (
        <section className="ui-panel ui-stack" aria-label="Haunting puzzle">
          <p>You have joined the haunting. Open a puzzle once a round: solve it for a Scare point.</p>
          <button type="button" className="ui-button" onClick={() => send({ t: "hauntPuzzle" })}>Haunt a puzzle</button>
        </section>
      ) : null}

      <section className="ui-panel ui-stack" aria-label="Your turn">
        <p>{view.at ? `${mine ? "You are" : `${n.seat(view.active)} is`} in the ${n.card(view.at)}.` : mine ? "Choose a room to go to." : "Waiting…"}</p>
        <div className="ui-row" role="group" aria-label="Rooms">
          {view.zones.map((z) => (
            <button key={z.id} type="button" className="ui-button" disabled={!mine || view.at === z.id || view.closedZones.includes(z.id)} onClick={() => send({ t: "walk", zone: z.id })}>
              {z.name}
            </button>
          ))}
        </div>
        <div className="ui-row">
          <button type="button" className="ui-button" disabled={!mine || view.at === null} onClick={() => send({ t: "inspect" })}>Search this room</button>
          <button type="button" className="ui-button" disabled={!mine} onClick={() => send({ t: "endTurn" })}>End turn</button>
          <button type="button" className="ui-button ui-button--quiet" disabled={!mine} onClick={() => send({ t: "pass" })}>Pass</button>
        </div>
        <form className="ui-row" onSubmit={(ev) => { ev.preventDefault(); if (ask.suspect && ask.relic) send({ t: "suggest", suspect: ask.suspect, relic: ask.relic }); }}>
          <label className="ui-field">
            <span className="ui-field-label">Ghost</span>
            <select className="ui-select" value={ask.suspect} onChange={(ev) => setAsk({ ...ask, suspect: ev.target.value })}>
              <option value="">Choose…</option>
              {view.suspects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Relic</span>
            <select className="ui-select" value={ask.relic} onChange={(ev) => setAsk({ ...ask, relic: ev.target.value })}>
              <option value="">Choose…</option>
              {view.relics.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <button type="submit" className="ui-button ui-button--primary" disabled={!mine || view.at === null || !ask.suspect || !ask.relic}>Ask</button>
        </form>
      </section>

      <section className="ui-panel ui-stack" aria-label="Your cards and notebook">
        <p>Your cards: {me ? me.hand.map((c) => n.card(c.id)).join(", ") : "…"}</p>
        <table className="solo-notebook">
          <caption className="ui-sr-only">Notebook: what you know is not the answer</caption>
          <tbody>
            {notebook(view, me).map((g) => g.rows.map((r, i) => (
              <tr key={r.id}>
                {i === 0 ? <th scope="rowgroup" rowSpan={g.rows.length}>{g.group}</th> : null}
                <td>{r.mark ? <s>{r.name}</s> : r.name}</td>
                <td>{r.mark === "mine" ? "in your hand" : r.mark === "shown" ? "shown to you" : r.mark === "found" ? "found" : ""}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </section>

      <section className="ui-panel ui-stack" aria-label="Accuse">
        {me?.sealed ? <p>Your accusation is sealed.</p> : (
          <form className="ui-row" onSubmit={(ev) => {
            ev.preventDefault();
            if (!seal.sure) { setSeal({ ...seal, sure: true }); return; }
            send({ t: "seal", suspect: seal.suspect, zone: seal.zone, relic: seal.relic });
            setSeal({ ...seal, sure: false });
          }}>
            {(["suspect", "zone", "relic"] as const).map((k) => (
              <label key={k} className="ui-field">
                <span className="ui-field-label">{k === "suspect" ? "Ghost" : k === "zone" ? "Room" : "Relic"}</span>
                <select className="ui-select" value={seal[k]} onChange={(ev) => setSeal({ ...seal, [k]: ev.target.value, sure: false })}>
                  <option value="">Choose…</option>
                  {(k === "suspect" ? view.suspects : k === "zone" ? view.zones : view.relics).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
            ))}
            <button type="submit" className="ui-button ui-button--danger" disabled={!seal.suspect || !seal.zone || !seal.relic}>
              {seal.sure ? "Yes, seal it" : "Seal accusation"}
            </button>
          </form>
        )}
      </section>
    </>
  );
}

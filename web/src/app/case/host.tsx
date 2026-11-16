import { useEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { browserRoomDeps, checkWorld, RoomError, startSolo, type RoomClient, type RoomDeps } from "./room-client";
import type { HostHandle, HostSetup } from "./types";
import type { ViewerHandle } from "../viewer/types";
import { eventLine, namesOf, notebook, secondsLeft } from "./words";

/**
 * The real Host for "Play a case" (integration 4.1, 4.2; party-mode 8.15): a real Room on the server, the visitor in
 * seat 1 as the Master, the Bots added and the game started. Everything is on this one screen: the table, the pad
 * (Go, Search, Ask, End turn), the hand, the notebook and the log. No Room Code, no QR, no phone. The 3D world view
 * joins later; this page plays a whole case without it.
 */
export async function mountHost(setup: HostSetup, deps: RoomDeps = browserRoomDeps()): Promise<HostHandle> {
  let client: RoomClient;
  try {
    await checkWorld(deps, setup.worldId, setup.setup);
    client = await startSolo(deps, setup.setup);
  } catch (e) {
    // The Room's own reason (too small, rooms full, party off) goes back to Haunt, which says why in one line.
    if (!(e instanceof RoomError)) throw e;
    queueMicrotask(() => setup.onMessage({ t: "refused", code: e.code }));
    return { playAgain() {}, async dispose() {} };
  }
  // The world beside the table (integration 4.2). It shows the Haunt rising; the table holds every control.
  const split = document.createElement("div");
  split.className = "case-split";
  const worldBox = document.createElement("div");
  worldBox.className = "case-world";
  const tableBox = document.createElement("div");
  split.append(worldBox, tableBox);
  setup.container.append(split);
  const root = createRoot(tableBox);
  root.render(<SoloTable client={client} />);
  let viewer: ViewerHandle | null = null;
  if (setup.loadViewer) {
    try {
      viewer = await (await setup.loadViewer()).mountViewer({ container: worldBox, worldId: setup.worldId, onMessage: () => {} });
    } catch {
      viewer = null; // no world view: the case plays on the table alone
      worldBox.remove();
    }
  }
  let lastHaunt = -1;
  const showHaunt = (): void => {
    const v = client.getSnapshot().public;
    if (viewer === null || v === null) return;
    const level = v.haunt.max > 0 ? Math.min(1, v.haunt.level / v.haunt.max) : 0;
    if (level === lastHaunt) return;
    lastHaunt = level;
    viewer.send({ t: "apply_view", found: [], anchors: [], hauntLevel: level, ghostVisible: false });
  };
  const stopHaunt = client.subscribe(showHaunt);
  showHaunt();

  // Tell the shell what happens, through the same messages the stand-in used.
  let last = client.getSnapshot().status;
  let scripted = false;
  const stop = client.subscribe(() => {
    const s = client.getSnapshot();
    if (s.status === last) return;
    if (s.status === "playing") {
      setup.onMessage({ t: "started" });
      if (!scripted) { scripted = true; setup.onMessage({ t: "scripted" }); }
    }
    if (s.status === "ended") setup.onMessage({ t: "ended" });
    if (s.status === "closed" && last !== "closed") setup.onMessage({ t: "refused", code: "case_failed" });
    last = s.status;
  });

  let up = true;
  return {
    playAgain: () => client.send({ t: "playAgain" }),
    async dispose() {
      if (!up) return;
      up = false;
      stop();
      stopHaunt();
      client.close();
      root.unmount();
      await viewer?.dispose();
      split.remove();
    },
  };
}

const REFUSALS: Record<string, string> = {
  not_your_turn: "It is not your turn.",
  already_inspected: "You have searched this room already.",
  already_suggested: "You have asked once this turn.",
  not_in_zone: "Go to a room first.",
};

export function SoloTable({ client }: { client: RoomClient }) {
  const snap = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const [ask, setAsk] = useState({ suspect: "", relic: "" });
  const [seal, setSeal] = useState({ suspect: "", zone: "", relic: "", sure: false });

  const view = snap.public;
  if (view === null) return <p aria-busy="true">Setting the table…</p>;
  const me = snap.private;
  const n = namesOf(view, snap.seat);
  const mine = view.active !== null && view.active === snap.seat;
  const left = secondsLeft(view, now);
  const lines = view.events.map((e) => eventLine(e, n)).filter((x): x is string => x !== null).slice(-8);

  if (view.phase === "ended" && view.ending) {
    const e = view.ending;
    return (
      <section className="ui-panel ui-stack" aria-labelledby="solo-end">
        <h2 id="solo-end" className="ui-heading">{e.houseWins ? "The haunting continues" : "The case is solved"}</h2>
        <p className="ui-lead">
          It was {n.card(e.solution.suspect)}, in the {n.card(e.solution.zone)}, with the {n.card(e.solution.relic)}.
        </p>
        {e.winners.length > 0 ? <p>Solved by {e.winners.map((w) => n.seat(w)).join(", ")}.</p> : null}
      </section>
    );
  }

  return (
    <div className="solo-table ui-stack">
      <p className="ui-status" role="status">
        Round {view.round} · {mine ? "Your turn" : `${n.seat(view.active)}'s turn`}
        {left !== null ? ` · ${left} s` : view.paused ? " · clock paused" : ""} · Haunt {view.haunt.level} of {view.haunt.max}
      </p>
      {snap.refused ? <p className="ui-notice" role="alert">{REFUSALS[snap.refused] ?? `Not now (${snap.refused}).`}</p> : null}

      {me?.answer ? (
        <section className="ui-panel ui-stack" aria-label="Show a card">
          <p>Someone asked about a card you hold. Show one:</p>
          <div className="ui-row">
            {me.answer.options.map((id) => (
              <button key={id} type="button" className="ui-button" onClick={() => client.send({ t: "show", card: id })}>Show {n.card(id)}</button>
            ))}
          </div>
        </section>
      ) : null}

      {me?.choose ? (
        <section className="ui-panel ui-stack" aria-label="The house stirs">
          <p>The house stirs. You choose what happens:</p>
          <div className="ui-row">
            {me.choose.options.map((o) => (
              <button key={o} type="button" className="ui-button" onClick={() => client.send({ t: "choose", option: o })}>{o.replace("-", " ")}</button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="ui-panel ui-stack" aria-label="Your turn">
        <p>{view.at ? `${mine ? "You are" : `${n.seat(view.active)} is`} in the ${n.card(view.at)}.` : mine ? "Choose a room to go to." : "Waiting…"}</p>
        <div className="ui-row" role="group" aria-label="Rooms">
          {view.zones.map((z) => (
            <button key={z.id} type="button" className="ui-button" disabled={!mine || view.at === z.id} onClick={() => client.send({ t: "walk", zone: z.id })}>
              {z.name}
            </button>
          ))}
        </div>
        <div className="ui-row">
          <button type="button" className="ui-button" disabled={!mine || view.at === null} onClick={() => client.send({ t: "inspect" })}>Search this room</button>
          <button type="button" className="ui-button" disabled={!mine} onClick={() => client.send({ t: "endTurn" })}>End turn</button>
          <button type="button" className="ui-button ui-button--quiet" disabled={!mine} onClick={() => client.send({ t: "pass" })}>Pass</button>
        </div>
        <form className="ui-row" onSubmit={(ev) => { ev.preventDefault(); if (ask.suspect && ask.relic) client.send({ t: "suggest", suspect: ask.suspect, relic: ask.relic }); }}>
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
            client.send({ t: "seal", suspect: seal.suspect, zone: seal.zone, relic: seal.relic });
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

      <section className="ui-stack" aria-label="What happened">
        <ol className="ui-log" aria-live="polite">
          {lines.map((l, i) => <li key={`${view.events.length}-${i}`} className="ui-log-row">{l}</li>)}
        </ol>
      </section>
    </div>
  );
}

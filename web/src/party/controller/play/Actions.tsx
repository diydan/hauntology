import { useEffect, useRef, useState, type ReactNode } from "react";
import type { GameView } from "../game-view";
import { nameOf, refusalWords, turnOf } from "./play-logic";
import { RelicScanner } from "./RelicScanner";

type Send = (msg: Readonly<{ t: string } & Record<string, unknown>>) => void;
/** The Inspect time the Room uses (party-mode 11.1); the bar only shows it, the Room decides. */
export const INSPECT_SECONDS = 10;
/** The window after a Suggestion in which the Detective may still end their Turn (party-mode 6.1). */
export const WINDOW_SECONDS = 15;

function Pick({ label, value, options, onChange, hint }: { label: string; value: string; options: readonly Readonly<{ id: string; name: string }>[]; onChange: (id: string) => void; hint?: (id: string) => string }): ReactNode {
  return (
    <fieldset className="pc-pick ui-stack--tight">
      <legend className="ui-field-label">{label}</legend>
      <div className="ui-choices" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className="ui-button ui-choice" onClick={() => onChange(o.id)}>
            {o.name}{hint?.(o.id) ? <span className="ui-hint"> {hint(o.id)}</span> : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The Suggestion (party-mode 9.7): every Suspect and every Relic is offered, including the cards in the Hand and the ones the notebook marks
 * no (a Bluff is allowed and looks like any other Suggestion). The Zone is the one the Detective stands in. Relics can also be scanned.
 */
export function SuggestSheet({ game, me, send, onClose }: { game: GameView; me: number; send: Send; onClose: () => void }): ReactNode {
  const pub = game.pub;
  const [suspect, setSuspect] = useState("");
  const [relic, setRelic] = useState("");
  if (pub === null) return null;
  const inHand = new Set((game.priv?.hand ?? []).map((c) => c.id));
  const here = pub.at === null ? null : nameOf(pub, pub.at);
  void me;
  return (
    <section className="ui-card ui-stack" aria-label="Suggest">
      <h2 className="ui-heading">Suggest</h2>
      <p className="ui-hint">{here === null ? "Walk into a room first." : `In the ${here}, who and with what?`}</p>
      <Pick label="Suspect" value={suspect} options={pub.suspects} onChange={setSuspect} hint={(id) => (inHand.has(id) ? "(in your hand)" : "")} />
      <Pick label="Relic" value={relic} options={pub.relics} onChange={setRelic} hint={(id) => (inHand.has(id) ? "(in your hand)" : "")} />
      <RelicScanner onRelic={(id) => { if (pub.relics.some((r) => r.id === id)) setRelic(id); }} />
      <div className="ui-row">
        <button type="button" className="ui-button ui-button--primary" disabled={here === null || suspect === "" || relic === ""} onClick={() => { send({ t: "suggest", suspect, relic }); onClose(); }}>Suggest</button>
        <button type="button" className="ui-button" onClick={onClose}>Cancel</button>
      </div>
    </section>
  );
}

/** The Accusation (party-mode 9.7): three picks, then a second step that says it is final. Nothing is sent until the second step is confirmed. */
export function SealSheet({ game, send, onClose }: { game: GameView; send: Send; onClose: () => void }): ReactNode {
  const pub = game.pub;
  const [pick, setPick] = useState({ suspect: "", zone: "", relic: "" });
  const [confirm, setConfirm] = useState(false);
  if (pub === null) return null;
  const ready = pick.suspect !== "" && pick.zone !== "" && pick.relic !== "";
  if (confirm && ready) {
    return (
      <section className="ui-card ui-stack" aria-label="Seal your accusation">
        <h2 className="ui-heading">This is final</h2>
        <p className="ui-lead">{nameOf(pub, pick.suspect)}, in the {nameOf(pub, pick.zone)}, with the {nameOf(pub, pick.relic)}.</p>
        <p className="ui-hint">You cannot take it back. If it is wrong, you join the haunting. Others see only that you sealed one.</p>
        <div className="ui-row">
          <button type="button" className="ui-button ui-button--danger" onClick={() => { send({ t: "seal", ...pick }); onClose(); }}>Seal it</button>
          <button type="button" className="ui-button" onClick={() => setConfirm(false)}>Back</button>
        </div>
      </section>
    );
  }
  return (
    <section className="ui-card ui-stack" aria-label="Accuse">
      <h2 className="ui-heading">Accuse</h2>
      <p className="ui-hint">Name the suspect, the room and the relic. You get one Accusation for the whole game.</p>
      <Pick label="Suspect" value={pick.suspect} options={pub.suspects} onChange={(suspect) => setPick((p) => ({ ...p, suspect }))} />
      <Pick label="Room" value={pick.zone} options={pub.zones} onChange={(zone) => setPick((p) => ({ ...p, zone }))} />
      <Pick label="Relic" value={pick.relic} options={pub.relics} onChange={(relic) => setPick((p) => ({ ...p, relic }))} />
      <div className="ui-row">
        <button type="button" className="ui-button ui-button--primary" disabled={!ready} onClick={() => setConfirm(true)}>Review</button>
        <button type="button" className="ui-button" onClick={onClose}>Cancel</button>
      </div>
    </section>
  );
}

/**
 * What a Player can do now (party-mode 9.7, 9.11): on their Turn walk, Inspect with a 10 second bar, Suggest, seal an Accusation, end the Turn
 * (with the 15 second window after a Suggestion), and on another's Turn listen in with Resolve. Each button only sends; the Room decides and
 * its refusal is shown in words.
 */
export function Actions({ game, me, send, nowMs }: { game: GameView; me: number; send: Send; nowMs: number; offsetMs?: number }): ReactNode {
  const pub = game.pub;
  const priv = game.priv;
  const turn = turnOf(game, me);
  const [sheet, setSheet] = useState<"suggest" | "seal" | null>(null);
  const [inspect, setInspect] = useState<{ zone: string; startedMs: number; foundBefore: number } | null>(null);
  const sealed = pub?.seats.find((s) => s.seat === me)?.sealed === true || priv?.sealed != null;
  const lastSuggest = [...(pub?.events ?? [])].reverse().find((e) => e.kind === "suggest" && e.seat === me);
  const turnStart = [...(pub?.events ?? [])].reverse().find((e) => e.kind === "turn-start");
  const suggested = turn.mine && lastSuggest !== undefined && turnStart !== undefined && lastSuggest.id > turnStart.id;
  // the window opens when the Suggestion first shows
  const windowAt = useRef<{ id: number; at: number } | null>(null);
  if (suggested && lastSuggest !== undefined && windowAt.current?.id !== lastSuggest.id) windowAt.current = { id: lastSuggest.id, at: nowMs };
  useEffect(() => { if (!turn.mine) setSheet(null); }, [turn.mine]);
  if (pub === null || priv === null) return null;
  const refusal = game.refusal === null ? null : refusalWords(game.refusal.code);
  const left = inspect === null ? 0 : Math.max(0, INSPECT_SECONDS - Math.floor((nowMs - inspect.startedMs) / 1000));
  const foundNow = priv.found.length;

  const out = (
    <>
      {refusal ? <div className="ui-notice" role="alert"><strong>{refusal.title}</strong> {refusal.body}</div> : null}
      {turn.poltergeist ? null : sealed ? <p className="ui-hint">You sealed your Accusation. It is read at the end of the round.</p> : null}
    </>
  );

  if (!turn.mine) {
    return (
      <section className="pc-actions ui-stack" aria-label="Actions">
        {turn.poltergeist ? null : <p className="ui-hint" role="status">{turn.activeSeat === null ? "Waiting." : `Waiting for ${turn.name}.`}</p>}
        {priv.canEavesdrop !== null && !turn.poltergeist ? (
          <button type="button" className="ui-button" onClick={() => send({ t: "eavesdrop", eventId: priv.canEavesdrop as number })}>Listen in (uses 1 Resolve)</button>
        ) : null}
        {priv.heard.length > 0 ? (
          <ul className="ui-chips" aria-label="What you overheard">
            {priv.heard.map((h) => <li key={h.eventId} className="ui-chip">You heard: {nameOf(pub, h.card)}</li>)}
          </ul>
        ) : null}
        {!turn.poltergeist && !sealed ? <button type="button" className="ui-button" onClick={() => setSheet(sheet === "seal" ? null : "seal")}>Accuse</button> : null}
        {sheet === "seal" ? <SealSheet game={game} send={send} onClose={() => setSheet(null)} /> : null}
        {out}
      </section>
    );
  }

  if (sheet === "suggest") return <SuggestSheet game={game} me={me} send={send} onClose={() => setSheet(null)} />;
  if (sheet === "seal") return <SealSheet game={game} send={send} onClose={() => setSheet(null)} />;

  const winLeft = suggested && windowAt.current !== null ? Math.max(0, WINDOW_SECONDS - Math.floor((nowMs - windowAt.current.at) / 1000)) : null;
  return (
    <section className="pc-actions ui-stack" aria-label="Actions">
      <fieldset className="pc-zones ui-stack--tight">
        <legend className="ui-field-label">Walk to a room</legend>
        <div className="ui-choices">
          {pub.zones.map((z) => {
            const closed = pub.closedZones.includes(z.id);
            const cold = pub.haunt.coldSpot === z.id;
            return (
              <button key={z.id} type="button" className="ui-button ui-choice" aria-pressed={pub.at === z.id} disabled={closed || pub.at === z.id} onClick={() => send({ t: "walk", zone: z.id })}>
                {z.name}{cold ? <span className="ui-hint"> (cold)</span> : null}{closed ? <span className="ui-hint"> (shut)</span> : null}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="ui-row">
        <button type="button" className="ui-button" disabled={pub.at === null || inspect !== null && left > 0} onClick={() => { setInspect({ zone: pub.at as string, startedMs: nowMs, foundBefore: foundNow }); send({ t: "inspect" }); }}>Inspect</button>
        <button type="button" className="ui-button ui-button--primary" disabled={pub.at === null || suggested || pub.haunt.coldSpot === pub.at} onClick={() => setSheet("suggest")}>Suggest</button>
      </div>
      {inspect !== null ? (
        <div className="ui-stack--tight" role="status" aria-live="polite">
          <div className="ui-progress" role="progressbar" aria-label="Searching" aria-valuemin={0} aria-valuemax={INSPECT_SECONDS} aria-valuenow={INSPECT_SECONDS - left}><span className="ui-progress-label">{left > 0 ? `Searching… ${left} s` : foundNow > inspect.foundBefore ? "You found a piece of Residue." : "You found nothing here."}</span></div>
        </div>
      ) : null}
      {suggested ? (
        <div className="ui-stack--tight" role="status">
          <p className="ui-hint">{winLeft !== null ? `You have ${winLeft} s to accuse or end your turn.` : "Suggested."}</p>
          <button type="button" className="ui-button" onClick={() => send({ t: "endTurn" })}>End turn</button>
        </div>
      ) : <button type="button" className="ui-button" onClick={() => send({ t: "pass" })}>Pass</button>}
      {!sealed ? <button type="button" className="ui-button" onClick={() => setSheet("seal")}>Accuse</button> : null}
      {out}
    </section>
  );
}

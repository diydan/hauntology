import { useState, type ReactNode } from "react";
import { CUES } from "@hauntology/shared/party/cues";
import type { GameView } from "../game-view";
import { refusalWords } from "./play-logic";

type Send = (msg: Readonly<{ t: string } & Record<string, unknown>>) => void;

/**
 * Cues, Nudges and Frames (party-mode 9.16): the Cue picker with the TV or this phone, Help and Spook with their Resolve cost, and the Frame
 * picker (a Player and a Cue). Targets are 48 px, and whenever the Room refuses, the reason is shown in words. The phone enables a button only
 * when it can tell the Room will not refuse for a reason it already knows (a Bot's seat, your own turn); everything else the Room decides.
 */
export function TableControls({ game, me, send, offersNudges = true, offersFrames = true }: { game: GameView; me: number; send: Send; offersNudges?: boolean; offersFrames?: boolean }): ReactNode {
  const pub = game.pub;
  const [cue, setCue] = useState<string>(CUES[0].id);
  const [place, setPlace] = useState<"tv" | "phone">("tv");
  const [target, setTarget] = useState<number | "">("");
  if (pub === null || pub.phase !== "playing") return null;
  const mine = pub.active === me;
  const resolve = game.priv?.resolve ?? 0;
  const humans = pub.seats.filter((s) => !s.bot && s.seat !== me && !s.poltergeist);
  const settings = (game.lobby?.settings ?? {}) as { nudges?: string; frames?: boolean; sounds?: boolean };
  const nudges = settings.nudges ?? "all";
  const reason = game.refusal !== null && /^(cue|nudge|frame|rattle)_denied/.test(game.refusal.code) ? refusalWords(game.refusal.code) : null;
  return (
    <section className="pc-table ui-stack" aria-label="Cues, nudges and frames">
      <fieldset className="ui-stack--tight">
        <legend className="ui-field-label">Make a sound</legend>
        <div className="ui-choices" role="radiogroup" aria-label="Cue">
          {CUES.map((c) => <button key={c.id} type="button" role="radio" aria-checked={cue === c.id} className="ui-button ui-choice" onClick={() => setCue(c.id)}>{c.caption}</button>)}
        </div>
        <div className="ui-segments" role="radiogroup" aria-label="Where">
          <button type="button" role="radio" aria-checked={place === "tv"} className="ui-button" onClick={() => setPlace("tv")}>On the screen</button>
          <button type="button" role="radio" aria-checked={place === "phone"} className="ui-button" onClick={() => setPlace("phone")}>On my phone</button>
        </div>
        <button type="button" className="ui-button" disabled={mine} onClick={() => send({ t: "cue", cue, place })}>Play it</button>
        {mine ? <p className="ui-hint">You cannot play a sound on your own turn.</p> : null}
      </fieldset>
      {offersNudges && nudges !== "off" ? (
        <fieldset className="ui-stack--tight">
          <legend className="ui-field-label">Change the clock</legend>
          <p className="ui-hint">You have {resolve} Resolve.</p>
          <div className="ui-row">
            <button type="button" className="ui-button" disabled={mine || resolve < 1} onClick={() => send({ t: "nudge", kind: "help" })}>Help (+10 s, costs 1)</button>
            {nudges === "all" ? <button type="button" className="ui-button" disabled={mine || resolve < 2} onClick={() => send({ t: "nudge", kind: "spook" })}>Spook (−10 s, costs 2)</button> : null}
          </div>
        </fieldset>
      ) : null}
      {offersFrames && settings.frames !== false && settings.sounds !== false && humans.length > 0 ? (
        <fieldset className="ui-stack--tight">
          <legend className="ui-field-label">Frame a friend</legend>
          <label className="ui-sr-only" htmlFor="pc-frame">Player</label>
          <select id="pc-frame" className="ui-select" value={target} onChange={(e) => setTarget(e.target.value === "" ? "" : Number(e.target.value))}>
            <option value="">Choose a player</option>
            {humans.map((h) => <option key={h.seat} value={h.seat}>{h.nickname}</option>)}
          </select>
          <button type="button" className="ui-button" disabled={target === ""} onClick={() => { if (target !== "") send({ t: "frame", target, cue }); }}>Play it on their phone</button>
          <p className="ui-hint">Nobody sees who sent it until the end.</p>
        </fieldset>
      ) : null}
      {reason ? <div className="ui-notice" role="alert"><strong>{reason.title}</strong> {reason.body}</div> : null}
    </section>
  );
}

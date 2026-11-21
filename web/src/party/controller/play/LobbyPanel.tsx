import type { ReactNode } from "react";
import type { ContributionApi } from "../contribute-api";
import type { RoomView } from "../controller-port";
import { ContributionPanel } from "./ContributionPanel";
import { MasterMenu, type WorldChoice } from "./MasterMenu";
import type { Recorder } from "../../phone/recorder";
import { StitchPanel } from "./StitchPanel";

/**
 * The lobby on the phone: who is seated, the Master's controls for the Master and a plain waiting line for everyone else, and the Stitch question
 * once the Master has turned it on. The contribution screens (Suspect, photo, Zone name) are separate (party-mode 9.8, 9.24).
 */
export function LobbyPanel({ view, send, worlds, record, contributions = null }: { view: RoomView; send: (m: Readonly<{ t: string } & Record<string, unknown>>) => void; worlds: readonly WorldChoice[]; record?: Recorder; contributions?: ContributionApi | null }): ReactNode {
  const game = view.game;
  if (game === undefined || view.seat === null) return null;
  const seats = game.lobby?.seats ?? [];
  const isMaster = game.lobby?.masterSeat === view.seat;
  return (
    <section className="pc-lobby ui-stack" aria-label="Lobby">
      <h2 className="ui-heading">In the lobby</h2>
      {seats.length > 0 ? (
        <ul className="ui-chips" aria-label="Players">
          {seats.map((s) => <li key={s.seat} className={`ui-chip${s.connected || s.bot ? " is-active" : ""}`}>{s.nickname}{s.bot ? " (Bot)" : ""}{s.seat === game.lobby?.masterSeat ? " · Master" : ""}{!s.connected && !s.bot ? " (away)" : ""}</li>)}
        </ul>
      ) : null}
      {isMaster ? <MasterMenu game={game} me={view.seat} send={send} worlds={worlds} /> : <p className="ui-hint" role="status">Waiting for the Master to start the game.</p>}
      <ContributionPanel api={contributions} />
      <StitchPanel game={game} send={send} {...(record ? { record } : {})} />
    </section>
  );
}

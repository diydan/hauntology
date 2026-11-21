import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ControllerPort, RoomView } from "../controller-port";
import { Actions } from "./Actions";
import { ClockBar } from "./ClockBar";
import { haptic } from "../../phone/haptics";
import { hasMotionSensor } from "../../phone/sensors";
import { HauntingPanel } from "./Haunting";
import { Hand, Notebook } from "./Notebook";
import { Pad } from "./Pad";
import { PhoneEffects } from "./PhoneEffects";
import { AnswerPrompt, HauntChoice, RattlePrompt } from "./Prompts";
import { Recap } from "./Recap";
import { TableControls } from "./TableControls";
import { turnOf } from "./play-logic";
import { useNow } from "./useNow";
import type { SoundDeps } from "./phone-sound";
import type { StorageLike } from "./notebook-store";

/**
 * The phone while a game is on (party-mode 9): the clock and Achievements, the prompts the Room puts to this seat (which card to show, which Haunt Event),
 * the actions of a Detective or the haunting Player's own screen, the hand and the notebook, the Cue, Nudge and Frame controls, the public log, and
 * the ending. It draws only what the Room sent (`view.game`) and sends only messages; the Room decides everything and its refusals show in words.
 */
export function PlayPanel({ port, view, layout, now = Date.now, storage, soundDeps, sensors = hasMotionSensor(), embedded = false }: {
  port: ControllerPort; view: RoomView; layout: "pad" | "panel"; now?: () => number; storage: StorageLike; soundDeps: SoundDeps; sensors?: boolean;
  /** This pad sits on the Host's shared screen (party-mode 8.6): the Private View (hand, notebook, the card to show) is drawn only when every other seat is a Bot. */
  embedded?: boolean;
}): ReactNode {
  const game = view.game;
  const me = view.seat;
  const nowMs = useNow(now);
  const offsetMs = view.clock?.offsetMs ?? 0;
  const send = useMemo(() => (msg: Readonly<{ t: string } & Record<string, unknown>>): void => port.send?.(msg), [port]);
  const turn = game !== undefined && me !== null ? turnOf(game, me) : null;
  // a buzz when the turn comes round, or a question is put (a pulse on screens that cannot buzz)
  const [pulse, setPulse] = useState(false);
  const wasMine = useRef(false);
  const hadAnswer = useRef(false);
  useEffect(() => {
    const mine = turn?.mine === true;
    const ask = game?.priv?.answer != null || game?.priv?.choose != null;
    if ((mine && !wasMine.current) || (ask && !hadAnswer.current)) { if (!haptic(mine && !wasMine.current ? "turn" : "ask")) { setPulse(true); const id = setTimeout(() => setPulse(false), 600); wasMine.current = mine; hadAnswer.current = ask; return () => clearTimeout(id); } }
    wasMine.current = mine; hadAnswer.current = ask;
    return undefined;
  }, [turn?.mine, game?.priv?.answer, game?.priv?.choose]);
  if (game === undefined || me === null || game.pub === null || turn === null) return null;
  const online = view.connection === "online";
  const lightOn = (game.lobby?.switches as { lightBar?: boolean } | undefined)?.lightBar !== false;
  const ended = game.pub.phase === "ended";
  const autoCross = (game.lobby?.settings as { autoCross?: boolean } | undefined)?.autoCross === true;
  const solo = game.pub.seats.filter((s) => !s.bot).length <= 1;
  const peek = !embedded || game.pub.seats.every((s) => s.seat === me || s.bot);

  return (
    <div className={`pc-play ui-stack${pulse ? " is-pulse" : ""}`} data-layout={layout}>
      <PhoneEffects game={game} offsetMs={offsetMs} nowMs={nowMs} deps={soundDeps} lightOn={lightOn} />
      {ended ? <Recap game={game} me={me} /> : (
        <>
          <ClockBar game={game} me={me} offsetMs={offsetMs} nowMs={nowMs} />
          {peek ? <AnswerPrompt game={game} send={send} nowMs={nowMs} offsetMs={offsetMs} /> : null}
          <HauntChoice game={game} send={send} nowMs={nowMs} offsetMs={offsetMs} />
          {turn.poltergeist ? (
            <>
              <HauntingPanel game={game} send={send} sensors={sensors} />
              <RattlePrompt game={game} send={send} onDismiss={() => port.dismissPrompt?.()} />
              <Actions game={game} me={me} send={send} nowMs={nowMs} offsetMs={offsetMs} hidePrivate={!peek} />
            </>
          ) : (
            <>
              {layout === "pad" ? <Pad active={turn.mine} online={online} send={send} /> : null}
              <Actions game={game} me={me} send={send} nowMs={nowMs} offsetMs={offsetMs} hidePrivate={!peek} />
              {layout === "panel" && peek ? <Hand game={game} /> : null}
            </>
          )}
          {layout === "panel" && peek && !turn.poltergeist && view.code !== null ? <Notebook game={game} me={me} code={view.code} autoCross={autoCross} storage={storage} /> : null}
          <TableControls game={game} me={me} send={send} offersNudges={!solo} offersFrames={!solo} />
        </>
      )}
      {game.log.length > 0 ? (
        <section className="pc-log" aria-label="What is happening">
          <h2 className="ui-heading">Log</h2>
          <ol className="ui-log" aria-live="polite" aria-relevant="additions">
            {game.log.slice(-8).map((l) => <li key={l.id} className="ui-log-row">{l.text}</li>)}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

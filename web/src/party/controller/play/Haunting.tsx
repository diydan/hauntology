import { useState, type ReactNode } from "react";
import { askMotionPermission, useShake } from "../../phone/sensors";
import type { GameView } from "../game-view";

type Send = (msg: Readonly<{ t: string } & Record<string, unknown>>) => void;

/**
 * The haunting Player's screen (party-mode 9.12, 9.19): a plain "you are haunting now" state, the world as the Host walks it (a spectating
 * note), the Scare points only they see, and Rattle: first an opt-in (with the motion permission from the tap), then shake and a hold-to-rattle
 * button. The Room's refusal for a Rattle (too soon, too many) is shown in words by the caller.
 */
export function HauntingPanel({ game, send, sensors, onMotion = askMotionPermission }: { game: GameView; send: Send; sensors: boolean; onMotion?: () => Promise<"granted" | "denied" | "unneeded"> }): ReactNode {
  const r = game.priv?.rattle;
  const [motion, setMotion] = useState<"unknown" | "granted" | "denied" | "unneeded">("unknown");
  const on = r?.on === true;
  const shake = on && sensors && (motion === "granted" || motion === "unneeded");
  useShake(shake, () => send({ t: "rattle", via: "shake" }));
  if (game.priv === null || r === undefined) return null;
  const turnOn = async (): Promise<void> => {
    const res = sensors ? await onMotion() : "unneeded";
    setMotion(res);
    send({ t: "rattleOn", on: true });
  };
  return (
    <section className="ui-card ui-stack" aria-label="You are haunting now">
      <h2 className="ui-heading">You are haunting now</h2>
      <p className="ui-lead">You no longer take turns. You watch the house, stir it, and choose what happens when it wakes.</p>
      <p className="ui-chip" role="status">Your scare points: {game.priv.scare ?? 0}</p>
      <p className="ui-hint">Only you see your points. The others see that you joined the haunting.</p>
      {!r.allowed ? <p className="ui-hint">The Master turned Rattle off.</p> : on ? (
        <div className="ui-stack--tight">
          <button type="button" className="ui-button ui-button--primary ui-button--block" onPointerDown={(e) => { e.preventDefault(); send({ t: "rattle", via: "button" }); }} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); send({ t: "rattle", via: "button" }); } }}>Hold to rattle</button>
          <p className="ui-hint">{shake ? "Or shake your phone." : sensors && motion === "denied" ? "Motion is not allowed, so use the button." : "Use the button to rattle the house."}</p>
          <button type="button" className="ui-button ui-button--quiet" onClick={() => send({ t: "rattleOn", on: false })}>Turn Rattle off</button>
        </div>
      ) : (
        <button type="button" className="ui-button" onClick={() => void turnOn()}>Turn on Rattle</button>
      )}
    </section>
  );
}

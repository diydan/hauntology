import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Controller } from "../controller/Controller";
import type { ControllerPort } from "../controller/controller-port";
import type { PlayExtras } from "../controller/SeatedFrame";

/**
 * "Play on this screen" (party-mode 8.6): the Host page joins as the first Player (so it is the Master) through the ordinary join, and shows that
 * Player's Controller beside the world. Every input still travels as that Player's own message. The shared screen draws the Private View (hand,
 * notebook, the card to show) only while every other seat is a Bot; with another human at the table it stays out of sight.
 */
export function PlayHere({ port, code, extras, nickname = "You" }: { port: ControllerPort; code: string; extras: PlayExtras; nickname?: string }): ReactNode {
  const view = useSyncExternalStore((l) => port.subscribe(() => l()), () => port.getView(), () => port.getView());
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void port.join(code, nickname).then((r) => { if (live && !r.ok) setFailed(true); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [port, code, nickname]);
  if (failed) return <p className="ui-notice" role="alert">This screen could not join the game. Use a phone instead.</p>;
  if (view.seat === null) return <p className="ui-hint" role="status">Joining as a player…</p>;
  return <div className="ph-pad" aria-label="Play on this screen"><Controller port={port} extras={{ ...extras, embedded: true }} /></div>;
}

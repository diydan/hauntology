import { useSyncExternalStore, type ReactNode } from "react";
import { KINDS } from "@hauntology/shared/puzzles/types";
import { STANDIN_CODES, type StandInPort } from "../standin-port";

/** The strip under the demo Controller that plays the Room: offer a Lock, change the connection. Not part of the Controller. */
export function DevBar({ port }: { port: StandInPort }): ReactNode {
  const view = useSyncExternalStore((onChange) => port.subscribe(() => onChange()), () => port.getView(), () => port.getView());
  const seated = view.seat !== null;
  return (
    <section className="pcd-bar" aria-label="Play the Room">
      <p className="ui-hint">Stand-in Room. Codes: {STANDIN_CODES.open} opens (you are the Master), {STANDIN_CODES.full} is full, {STANDIN_CODES.started} has started; any other is unknown.</p>
      <div className="pcd-row">
        {KINDS.map((k) => <button key={k} type="button" className="ui-button" disabled={!seated} onClick={() => port.offerLock(k, "easy", 1, false)}>{k}</button>)}
      </div>
      <div className="pcd-row">
        {(["online", "reconnecting", "offline"] as const).map((c) => <button key={c} type="button" className="ui-button" aria-pressed={view.connection === c} disabled={!seated} onClick={() => port.setConnection(c)}>{c}</button>)}
      </div>
    </section>
  );
}

import { useEffect, useRef, type ReactNode } from "react";
import type { Kind } from "@hauntology/shared/puzzles/types";
import { COMMON_HELP, KIND_HELP } from "./help";

/**
 * The "?" card: how this puzzle works. It is a plain dialog that closes with its button or the Escape key, and the puzzle
 * underneath keeps where it was. The clock keeps running while it is open, and it says so when there is a clock.
 */
export function HelpCard({ kind, clock, onClose }: { kind: Kind; clock: boolean; onClose: () => void }): ReactNode {
  const help = KIND_HELP[kind];
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="ui-panel pz-card pz-help" role="dialog" aria-label={`How ${help.title} works`}>
      <h2 className="ui-heading">How {help.title} works</h2>
      <ol className="pz-help-steps">{help.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
      {help.extras.length > 0 ? (
        <>
          <h3 className="pz-help-sub">Phone extras (all optional)</h3>
          <ul className="pz-help-list">{help.extras.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </>
      ) : null}
      <ul className="pz-help-list pz-help-common">{COMMON_HELP.map((s, i) => <li key={i}>{s}</li>)}</ul>
      {clock ? <p className="ui-hint">The clock keeps running while you read this.</p> : null}
      <button ref={close} type="button" className="ui-button ui-button--primary" onClick={onClose}>Back to the puzzle</button>
    </div>
  );
}

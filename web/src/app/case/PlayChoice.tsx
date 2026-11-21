import { DEFAULT_CASE_SETUP, caseAvailability, refusalPasses, type CaseSetup } from "@hauntology/shared/app/case-setup";
import { useEffect, useState } from "react";
import { useBoot, useRouterState, useShell } from "../context";
import { CaseSetupCard } from "./CaseSetupCard";

/**
 * "Play a case" and "Wander" (Requirement 13.1), shown when a world is ready. It starts nothing by
 * itself: a click opens the setup, or goes to Wander. Each action has its one-line description,
 * and an action that is off stays on the page, still reachable by keyboard, tied to its reason.
 *
 * - "Play a case" is off when party mode is off, or the Host refused this world on the way here
 *   (the world is too small, or no Room could be made). A too-small place stays off for the visit;
 *   any other refusal is shown once and the case is offered again the next time Haunt opens.
 *   Wander and the Gallery stay.
 * - "Wander" needs a ghost, as the Play route does: it is off, with its reason, until one is chosen.
 *   A case needs none, because it fills every Suspect from the Preset Ghosts.
 */
export const CASE_LINE = "Work out who is haunting it, against Bots on this screen";
export const WANDER_LINE = "Walk in and let the ghost lead you to three memories";
export const GHOST_FIRST_LINE = "Choose a ghost first.";

export function PlayChoice({ worldId }: { worldId: string }) {
  const { router, memory } = useShell();
  const boot = useBoot();
  const { flow } = useRouterState();
  const [open, setOpen] = useState(false);
  const [locksOn, setLocksOn] = useState(() => memory.get().wanderLocks === true);
  // What the Host said about this world on the way here, read once, so this visit to Haunt keeps showing it.
  const [refusal] = useState(() => memory.get().caseRefusal);
  useEffect(() => {
    // A refusal that may pass is shown once: the next time Haunt opens, the case is offered again.
    if (refusal !== undefined && refusalPasses(refusal.code)) memory.set({ caseRefusal: undefined });
  }, [refusal, memory]);

  const flags = boot.status === "ready" ? boot.session.flags : null;
  const caseState = flags === null ? ({ available: false, reason: "Checking what this place can do…" } as const) : caseAvailability(flags, refusal, worldId);
  const wanderOn = flow.ghostReady;
  const showLocksSwitch = flags?.puzzlesEnabled === true;

  const startCase = (setup: CaseSetup) => {
    memory.set({ caseSetup: setup, caseStart: true });
    router.navigate({ screen: "case", worldId });
  };
  const wander = () => {
    memory.set({ startFresh: true, ...(showLocksSwitch ? { wanderLocks: locksOn } : { wanderLocks: false }) });
    router.navigate({ screen: "play", worldId });
  };

  return (
    <section className="play-choice ui-stack" aria-labelledby="play-choice-title">
      <h2 className="ui-heading" id="play-choice-title">How do you want to play?</h2>
      <ul className="actions ui-choices">
        <li>
          <button
            className="ui-button ui-button--block"
            type="button"
            aria-disabled={caseState.available ? undefined : "true"}
            aria-describedby="case-line"
            aria-expanded={caseState.available ? open : undefined}
            aria-controls={caseState.available ? "case-setup-card" : undefined}
            onClick={() => {
              if (caseState.available) setOpen((o) => !o);
            }}
          >
            Play a case
          </button>
          <p id="case-line" className="ui-hint">{caseState.available ? CASE_LINE : `${CASE_LINE}. ${caseState.reason}`}</p>
        </li>
        <li>
          <button className="ui-button ui-button--block" type="button" aria-disabled={wanderOn ? undefined : "true"} aria-describedby="wander-line" onClick={() => wanderOn && wander()}>
            Wander
          </button>
          <p id="wander-line" className="ui-hint">{wanderOn ? WANDER_LINE : `${WANDER_LINE}. ${GHOST_FIRST_LINE}`}</p>
          {showLocksSwitch ? (
            <button
              type="button"
              role="switch"
              className="ui-button ui-switch"
              aria-checked={locksOn}
              onClick={() => {
                const next = !locksOn;
                setLocksOn(next);
                memory.set({ wanderLocks: next });
              }}
            >
              <span>Wander locks</span>
              <span>{locksOn ? "On" : "Off"}</span>
            </button>
          ) : null}
        </li>
      </ul>
      {open ? (
        <div id="case-setup-card">
          <CaseSetupCard initial={memory.get().caseSetup ?? DEFAULT_CASE_SETUP} onStart={startCase} onCancel={() => setOpen(false)} />
        </div>
      ) : null}
    </section>
  );
}

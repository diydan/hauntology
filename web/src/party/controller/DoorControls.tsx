import { useEffect, useRef, useState, type ReactNode } from "react";
import { doorProblemLines, type PublicDoor } from "@hauntology/shared/party/doors";
import type { Sight } from "@hauntology/shared/puzzles/types";
import type { ControllerPort, RoomView } from "./controller-port";

function fadedKnockHint(faded: Sight | null): string | null {
  if (!faded || faded.kind !== "knock") return null;
  const payload = faded.payload as { groups?: readonly number[]; long?: number | null } | undefined;
  if (!payload || !Array.isArray(payload.groups)) return null;
  return `Faded clue: try tapping ${payload.groups.join(", ")} knocks${payload.long !== null && payload.long !== undefined ? " (one long beat)" : ""}.`;
}

/**
 * Door controls on the phone Controller (`knock-door` tasks 1.4, 3.3, 4.2, 9.2, 11.1):
 * renders Heavy-door act controls with "n of need" live status, touch-only Knock door controls
 * with Faded clue fallback, Master validation notices, and live open/shut announcements.
 * Built strictly from `design/elements.css` classes (`ui-panel`, `ui-prompt`, `ui-button`, `ui-hint`, `ui-status`).
 */
export function DoorControls({ port, view }: { port: ControllerPort; view: RoomView }): ReactNode {
  const [taps, setTaps] = useState<number[]>([]);
  const [announcement, setAnnouncement] = useState<string>("");
  const prevDoors = useRef<readonly PublicDoor[] | undefined>(undefined);

  useEffect(() => {
    const curr = view.doors;
    const prev = prevDoors.current;
    prevDoors.current = curr;
    if (!prev || !curr) return;
    for (const d of curr) {
      const before = prev.find((x) => x.id === d.id);
      if (before && before.open !== d.open) {
        setAnnouncement(d.open ? `The door ${d.id} opens.` : `The door ${d.id} shuts.`);
        return;
      }
    }
  }, [view.doors]);

  const shutHeavy = (view.doors ?? []).filter((d) => !d.open && d.lock === "heavy");
  const problems = view.master && view.doorProblems && view.doorProblems.length > 0 ? doorProblemLines(view.doorProblems) : [];
  const knock = view.doorLock ?? null;

  if (shutHeavy.length === 0 && problems.length === 0 && !knock && !announcement) return null;

  const fadedHint = knock ? fadedKnockHint(knock.faded) : null;

  return (
    <div className="ui-stack">
      {announcement ? (
        <p className="ui-status" role="status" aria-live="polite">
          {announcement}
        </p>
      ) : null}

      {problems.length > 0 ? (
        <section className="ui-panel ui-stack--tight" aria-label="Door notice">
          <p className="ui-status" role="status">Playing this world without doors.</p>
          {problems.map((line, i) => (
            <p key={i} className="ui-hint">{line}</p>
          ))}
        </section>
      ) : null}

      {shutHeavy.map((door) => (
        <section key={door.id} className="ui-panel ui-stack--tight" aria-label={`Heavy door ${door.id}`}>
          <p className="ui-prompt">Push the door {door.id} together.</p>
          <p className="ui-status" role="status" aria-live="polite">
            {door.have} of {door.need} acting
          </p>
          <button type="button" className="ui-button" onClick={() => port.doorAct?.(door.id)}>
            Push together
          </button>
        </section>
      ))}

      {knock ? (
        <section className="ui-panel ui-stack--tight" aria-label={`Knock door ${knock.doorId}`}>
          <p className="ui-prompt">Knock to open {knock.doorId} ({knock.triesLeft} tries left).</p>
          {fadedHint ? <p className="ui-hint">{fadedHint}</p> : null}
          {knock.lastResult ? (
            <p className="ui-status" role="status" aria-live="polite">
              {knock.lastResult.heard} ({knock.lastResult.triesLeft} tries left)
            </p>
          ) : null}
          <div className="ui-row">
            <button
              type="button"
              className="ui-button"
              onClick={() => setTaps((prev) => [...prev, Date.now()])}
            >
              Tap ({taps.length})
            </button>
            <button
              type="button"
              className="ui-button"
              disabled={taps.length === 0 || knock.triesLeft <= 0}
              onClick={() => {
                const start = taps[0] ?? 0;
                port.doorKnock?.(knock.doorId, taps.map((t) => Math.max(0, t - start)));
                setTaps([]);
              }}
            >
              Send knock
            </button>
            {taps.length > 0 ? (
              <button type="button" className="ui-button ui-button--quiet" onClick={() => setTaps([])}>
                Clear
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

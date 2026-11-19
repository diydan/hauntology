import { useId, useState, type ReactNode } from "react";
import { ERRAND_OBJECTS, ERRAND_RULE_LINE, type ErrandObject } from "@hauntology/shared/party/errands";
import type { ControllerErrandsView, ControllerPort } from "./controller-port";

/**
 * Target opt-out toggle (errands 4.3, 5.3): uses shared `ui-field--check` and `ui-check`
 * so the label text sits inside the 44 px+ hit target and never uses raw styles.
 */
export function ErrandOptOut({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }): ReactNode {
  const id = useId();
  return (
    <div className="ui-field ui-field--check">
      <input id={id} type="checkbox" className="ui-check" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      <label className="ui-field-label" htmlFor={id}>Do not pick me for errands</label>
    </div>
  );
}

/**
 * Poltergeist's Errand card, Target Yes/No prompt, and Detective Caught picker (`errands` Groups 3 & 4).
 * Built strictly from `design/elements.css` classes with at most one solid yellow primary button per view.
 */
export function ErrandsPanel({ errands, port }: { errands: ControllerErrandsView; port: ControllerPort }): ReactNode {
  const poltId = useId();
  const objId = useId();
  const [poltSeat, setPoltSeat] = useState<number>(() => errands.poltergeists[0]?.seat ?? 0);
  const [obj, setObj] = useState<ErrandObject>(ERRAND_OBJECTS[0]);

  const effectivePolt = errands.poltergeists.some((p) => p.seat === poltSeat) ? poltSeat : (errands.poltergeists[0]?.seat ?? 0);
  const showAsk = errands.ask !== null;
  const showCard = errands.poltergeist && errands.errand !== null;
  const showCaught = !showAsk && errands.on && !errands.poltergeist && errands.poltergeists.length > 0;

  if (!showAsk && !showCard && !showCaught) return null;

  return (
    <div className="ui-stack">
      {showAsk && errands.ask ? (
        <section className="ui-card ui-stack--tight" aria-label="Errand check" aria-live="polite">
          <p className="ui-lead">Are you holding a <strong>{errands.ask.object}</strong> right now?</p>
          <div className="ui-row">
            <button type="button" className="ui-button" onClick={() => port.errandAnswer?.(true)}>Yes</button>
            <button type="button" className="ui-button" onClick={() => port.errandAnswer?.(false)}>No</button>
          </div>
        </section>
      ) : null}

      {showCard && errands.errand ? (
        <section className="ui-card ui-stack--tight" aria-label="Errand">
          <p className="ui-eyebrow">Secret errand</p>
          <p className="ui-lead">
            Get <strong>{errands.seatName(errands.errand.target)}</strong> to hold a <strong>{errands.errand.object}</strong>.
          </p>
          <p className="ui-hint">{ERRAND_RULE_LINE}</p>
          <button
            type="button"
            className="ui-button"
            disabled={errands.doneTriedThisRound}
            onClick={() => port.errandDone?.()}
          >
            Done
          </button>
        </section>
      ) : null}

      {showCaught ? (
        <section className="ui-panel ui-stack--tight" aria-label="Call caught">
          <h3 className="ui-heading">Call caught</h3>
          <div className="ui-field">
            <label className="ui-field-label" htmlFor={poltId}>Poltergeist</label>
            <select id={poltId} className="ui-select" value={effectivePolt} onChange={(e) => setPoltSeat(Number(e.currentTarget.value))}>
              {errands.poltergeists.map((p) => (
                <option key={p.seat} value={p.seat}>{p.nickname}</option>
              ))}
            </select>
          </div>
          <div className="ui-field">
            <label className="ui-field-label" htmlFor={objId}>Object</label>
            <select id={objId} className="ui-select" value={obj} onChange={(e) => setObj(e.currentTarget.value as ErrandObject)}>
              {ERRAND_OBJECTS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="ui-button ui-button--primary"
            disabled={errands.caughtUsed || effectivePolt === 0}
            onClick={() => { if (effectivePolt !== 0) port.errandCaught?.(effectivePolt, obj); }}
          >
            Caught
          </button>
        </section>
      ) : null}
    </div>
  );
}

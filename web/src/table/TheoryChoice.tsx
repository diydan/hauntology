import { useId, type ReactNode } from "react";
import { setTheory, theoryOf, type Theory } from "@hauntology/shared/party/theory";
import "./TheoryChoice.css";

export type Named = Readonly<{ id: string; name: string }>;

function Row({ suspect, zones, theory, onChange }: { suspect: Named; zones: readonly Named[]; theory: Theory; onChange: (next: Theory) => void }): ReactNode {
  const id = useId();
  return (
    <li className="th-row">
      <label htmlFor={id} className="ui-field-label">{suspect.name}</label>
      <select
        id={id}
        className="ui-select th-select"
        value={theoryOf(theory, suspect.id) ?? ""}
        onChange={(e) => onChange(setTheory(theory, suspect.id, e.target.value === "" ? null : e.target.value, zones.map((z) => z.id)))}
      >
        <option value="">No mark</option>
        {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
      </select>
    </li>
  );
}

/**
 * The notebook's Theory marks (party-mode 4.7 and 4.8): for each Suspect, a choice of the six Zones or "No mark", so a mark can be
 * made and taken back without dragging on the Spirit table. It uses the same `setTheory` as the table, so the two never disagree.
 * The marks are the Player's own: this page says so, and nothing here is sent anywhere.
 */
export function TheoryChoice({ suspects, zones, theory, onChange }: { suspects: readonly Named[]; zones: readonly Named[]; theory: Theory; onChange: (next: Theory) => void }): ReactNode {
  return (
    <section className="th-choice ui-panel" aria-label="My theory">
      <h2 className="ui-heading">My theory</h2>
      <p className="ui-hint">Where I think each suspect might be. Only you see this, and it changes no rule.</p>
      <ul className="th-rows">
        {suspects.map((s) => <Row key={s.id} suspect={s} zones={zones} theory={theory} onChange={onChange} />)}
      </ul>
    </section>
  );
}

import type { ReactNode } from "react";

/**
 * A place on the Controller that a later part of party-mode group 9 fills (the stick, the look area, the face buttons, the hand, the notebook).
 * It is a real, named region with room for its content; until that part is built it says so in one quiet line and has no control that does nothing.
 */
export function Slot({ name, label, children }: { name: string; label: string; children?: ReactNode }): ReactNode {
  return (
    <section className={`pc-slot pc-slot--${name}`} data-slot={name} aria-label={label}>
      {children ?? <p className="ui-hint">{label}: not built yet.</p>}
    </section>
  );
}

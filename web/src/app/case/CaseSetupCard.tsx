import { BOTS_MAX, BOTS_MIN, CASE_PRESETS, CASE_PRESET_COPY, normalizeCaseSetup, type CasePreset, type CaseSetup } from "@hauntology/shared/app/case-setup";
import { useEffect, useRef, useState } from "react";

/**
 * The short setup before a case (Requirement 13.2): a preset and two to five Bots, with Start and
 * Cancel. Plain radio buttons, so the keyboard and a screen reader work without extra code. What it
 * sends is always `normalizeCaseSetup`, so the Host never gets a count it would refuse. Nothing is
 * kept here: the caller keeps the choice in memory for this visit.
 */
export function CaseSetupCard({ initial, onStart, onCancel }: { initial: CaseSetup; onStart: (setup: CaseSetup) => void; onCancel: () => void }) {
  const [preset, setPreset] = useState<CasePreset>(initial.preset);
  const [bots, setBots] = useState<number>(initial.bots);
  const heading = useRef<HTMLHeadingElement>(null);

  // The card opens on a click, so focus moves into it.
  useEffect(() => heading.current?.focus(), []);

  const counts = Array.from({ length: BOTS_MAX - BOTS_MIN + 1 }, (_, i) => BOTS_MIN + i);
  return (
    <form
      className="case-setup"
      aria-labelledby="case-setup-title"
      onSubmit={(e) => {
        e.preventDefault();
        onStart(normalizeCaseSetup({ preset, bots }));
      }}
    >
      <h2 id="case-setup-title" ref={heading} tabIndex={-1}>
        Set up your case
      </h2>

      <fieldset className="choice-group">
        <legend>How it plays</legend>
        {CASE_PRESETS.map((p) => (
          <label key={p} className="choice-option">
            <input type="radio" name="case-preset" value={p} checked={preset === p} onChange={() => setPreset(p)} />
            <span>
              <strong>{CASE_PRESET_COPY[p].label}</strong> <small>{CASE_PRESET_COPY[p].line}</small>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="choice-group choice-bots">
        <legend>Bots at the table</legend>
        {counts.map((n) => (
          <label key={n} className="choice-option">
            <input type="radio" name="case-bots" value={n} checked={bots === n} onChange={() => setBots(n)} />
            <span>{n}</span>
          </label>
        ))}
      </fieldset>

      <p>
        <button className="button" type="submit">
          Start
        </button>{" "}
        <button className="button" type="button" onClick={onCancel}>
          Cancel
        </button>
      </p>
    </form>
  );
}

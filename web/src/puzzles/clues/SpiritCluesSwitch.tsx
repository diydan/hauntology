import { useMemo, useState, type ReactNode } from "react";
import type { SpiritClue } from "@hauntology/shared/puzzles/clues";
import { createOrientationSource, type OrientationSource } from "../../table/orientation";

/**
 * The Controller's side of the Spirit clues (puzzles 10.8, Requirement 15.1): the Player's own device switch, off by default, whose tap is also the
 * tap that asks for motion permission (an iPhone only allows that from a tap). There is no Master control for it, nothing is sent to the Room and
 * nothing is kept: the switch is off again on the next visit, and the clues of the last ring live only in this page (for the Table's Clues control).
 */
export type SpiritCluesDevice = Readonly<{
  on: boolean;
  motion: boolean;
  toggle: () => void;
  source: OrientationSource;
  /** The clues of the ring last shown on this phone and which of them were read, for the Spirit table's Clues control. Never leaves the page. */
  last: Readonly<{ clues: readonly SpiritClue[]; read: ReadonlySet<string> }> | null;
  setLast: (v: Readonly<{ clues: readonly SpiritClue[]; read: ReadonlySet<string> }> | null) => void;
}>;

export function useSpiritClues(): SpiritCluesDevice {
  const source = useMemo(() => createOrientationSource(), []);
  const [on, setOn] = useState(false);
  const [motion, setMotion] = useState(false);
  const [last, setLast] = useState<SpiritCluesDevice["last"]>(null);
  const toggle = (): void => {
    if (on) { source.disable(); setMotion(false); setOn(false); return; }
    setOn(true); // an explicit tap; it also asks for motion permission
    void source.enable().then(setMotion, () => setMotion(false));
  };
  return { on, motion, toggle, source, last, setLast };
}

export function SpiritCluesSwitch({ device }: { device: SpiritCluesDevice }): ReactNode {
  return (
    <div className="ui-stack--tight">
      <button type="button" role="switch" aria-checked={device.on} className="ui-button ui-switch" onClick={device.toggle}>
        <span className="ui-switch-name">Spirit clues</span>
        <span className="ui-switch-state">{device.on ? "On" : "Off"}</span>
      </button>
      <p className="ui-hint">Shows a safe code as clues hanging round you. You can always read them as a list.</p>
    </div>
  );
}

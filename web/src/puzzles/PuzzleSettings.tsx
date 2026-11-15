import { useId, type ReactNode } from "react";
import { presetSetting, type Preset } from "@hauntology/shared/puzzles/settings";
import { PUZZLE_SETTINGS, type PuzzleSetting } from "@hauntology/shared/puzzles/types";
import type { FeelSettings, TiltState } from "./feel/types";
import "./puzzles.css";
import "./PuzzleSettings.css";

/** The switches that belong to one device. `tilt` is the Player's wish for tilt (on by default where a sensor answers). */
export type DeviceSettings = FeelSettings & Readonly<{ tilt: boolean; assist: boolean }>;
export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = { touchOnly: false, sensitivity: 1, hapticMode: "auto", dialInvert: false, soundConsent: true, tilt: true, assist: false };

type Switch = Readonly<{ on: boolean; onChange: (on: boolean) => void }>;
export type PuzzleSettingsProps = Readonly<{
  /** The Master's row (Party Mode): shown to the Master only, so leave it out for everyone else. */
  master?: Readonly<{ value: PuzzleSetting; preset: Preset; onChange: (value: PuzzleSetting) => void }>;
  /** Wander: the Locks switch, off by default. */
  wander?: Switch;
  /** Party Mode: Plain Inspect for this seat. Only the seat sees it. */
  plainInspect?: Switch;
  device: DeviceSettings;
  onDevice: (next: DeviceSettings) => void;
  /** What the phone can do: whether a motion sensor answered, and whether it can buzz. */
  tiltState: TiltState;
  canVibrate: boolean;
}>;

const LEVEL_NAME: Readonly<Record<PuzzleSetting, string>> = { off: "Off", easy: "Easy", medium: "Medium", hard: "Hard" };

/** One on/off switch: a button with a name, a visible state and a hint, at least 48 pixels tall. */
function Row({ label, hint, on, onChange, disabled = false }: { label: string; hint: ReactNode; on: boolean; onChange: (on: boolean) => void; disabled?: boolean }): ReactNode {
  const hintId = useId();
  return (
    <div className="pz-setting">
      <button type="button" role="switch" aria-checked={on} aria-describedby={hintId} disabled={disabled} className="ui-button ui-switch" onClick={() => onChange(!on)}>
        <span className="ui-switch-name">{label}</span>
        <span className="ui-switch-state">{on ? "On" : "Off"}</span>
      </button>
      <div id={hintId} className="ui-hint">{hint}</div>
    </div>
  );
}

const tiltHint = (state: TiltState, wanted: boolean, touchOnly: boolean): string => {
  if (touchOnly) return "Touch only is on, so tilt is off.";
  if (state === "unsupported") return "This phone has no motion sensor. You play with touch.";
  if (state === "denied") return "Motion was not allowed. You play with touch. Allow it in the phone's settings to use tilt.";
  return wanted ? "Lean the phone to move the pick, torch, planchette and orb. You can always use touch." : "Tilt is off. You play with touch.";
};

/**
 * The puzzle settings: the Master's Puzzle setting (Party), the Locks switch (Wander), Plain Inspect (this seat), and the
 * switches of this device (tilt, vibration, sound, Assist, touch only, tilt strength, twist direction). Every switch has a
 * text state and a hint, every control is at least 48 pixels, and nothing here changes how any answer is checked.
 * It holds no state of its own: the Controller keeps and remembers the settings and passes them in.
 */
export function PuzzleSettings({ master, wander, plainInspect, device, onDevice, tiltState, canVibrate }: PuzzleSettingsProps): ReactNode {
  const set = (over: Partial<DeviceSettings>): void => onDevice({ ...device, ...over });
  const touchOnly = device.touchOnly;
  const senses = useId();
  const help = useId();
  const strengthId = useId();
  return (
    <section className="pz-settings" aria-label="Puzzle settings">
      <h2 className="ui-heading">Puzzles</h2>

      {master && (
        <div className="pz-setting" role="radiogroup" aria-label="Puzzles">
          <div className="ui-segments">
            {PUZZLE_SETTINGS.map((level) => (
              <button key={level} type="button" role="radio" aria-checked={master.value === level} className="ui-button" onClick={() => master.onChange(level)}>{LEVEL_NAME[level]}</button>
            ))}
          </div>
          <p className="ui-hint">{`This game's preset gives ${LEVEL_NAME[presetSetting(master.preset)].toLowerCase()}. A change applies from the next Inspect, for everyone.`}</p>
        </div>
      )}
      {wander && <Row label="Locks" hint="A small puzzle in front of each memory. You can always skip it." on={wander.on} onChange={wander.onChange} />}
      {plainInspect && <Row label="Plain Inspect" hint="Your Inspect always works and always takes the full time. No puzzle. Nobody else is told." on={plainInspect.on} onChange={plainInspect.onChange} />}

      <div role="group" aria-labelledby={senses} className="pz-group">
        <h3 id={senses} className="ui-eyebrow">Senses on this phone</h3>
        <Row label="Touch only" hint="Turns off tilt, buzz, sound and the microphone. Every puzzle can be finished this way." on={touchOnly} onChange={(on) => set({ touchOnly: on })} />
        <Row label="Tilt" hint={tiltHint(tiltState, device.tilt, touchOnly)} on={device.tilt && !touchOnly && tiltState !== "unsupported"} onChange={(on) => set({ tilt: on })} disabled={touchOnly || tiltState === "unsupported"} />
        <div className="pz-setting">
          <label className="ui-field-label" htmlFor={strengthId}>Tilt strength: {device.sensitivity.toFixed(1)} times</label>
          <input id={strengthId} type="range" className="ui-range" min={0.4} max={2.5} step={0.1} value={device.sensitivity} disabled={touchOnly || !device.tilt} aria-valuetext={`${device.sensitivity.toFixed(1)} times`} onChange={(e) => set({ sensitivity: Number(e.currentTarget.value) })} />
        </div>
        <Row label="Flip the twist" hint="Turn this on if the safe dial and the clock hands turn the wrong way when you twist the phone." on={device.dialInvert} onChange={(on) => set({ dialInvert: on })} disabled={touchOnly || !device.tilt} />
        <Row label="Buzz" hint={canVibrate ? "The phone buzzes with the puzzle. Every buzz also shows on screen." : "This phone cannot buzz. You see it on screen instead."} on={canVibrate && device.hapticMode !== "visual" && !touchOnly} onChange={(on) => set({ hapticMode: on ? "auto" : "visual" })} disabled={touchOnly || !canVibrate} />
        <Row label="Sound" hint="Clicks, notes and creaks from your own phone. Every sound is also shown on screen." on={device.soundConsent && !touchOnly} onChange={(on) => set({ soundConsent: on })} disabled={touchOnly} />
      </div>

      <div role="group" aria-labelledby={help} className="pz-group">
        <h3 id={help} className="ui-eyebrow">Help</h3>
        <Row
          label="Assist"
          hint={<>Assist does three things:<ul className="pz-assist-list"><li>It keeps the clues you saw on the Clues page, and lets you look at a clue again while you play.</li><li>It shows each clue for 8 seconds.</li><li>It shows the Spirit board's word as text.</li></ul></>}
          on={device.assist} onChange={(on) => set({ assist: on })}
        />
      </div>
    </section>
  );
}

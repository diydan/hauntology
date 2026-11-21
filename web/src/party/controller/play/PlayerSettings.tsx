import { useState, type ReactNode } from "react";
import { canVibrate } from "../../phone/haptics";

type Send = (msg: Readonly<{ t: string } & Record<string, unknown>>) => void;
export const prefersReducedMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * This phone's own sound and light choices (party-mode 9.14, 9.18), changeable from the menu at any time. The tap that says yes to sound also
 * unlocks Web Audio (a phone only plays after a tap), and says so honestly when it could not: then the Room is told "no audio" and the phone
 * flashes and vibrates instead. Light is a separate yes; nothing plays under reduced motion even then. Sound is never needed to play.
 */
export function SoundLightSettings({ send, unlock, vibrates = canVibrate(), initial = { sound: false, light: false } }: {
  send: Send; unlock: () => Promise<boolean>; vibrates?: boolean; initial?: { sound: boolean; light: boolean };
}): ReactNode {
  const [sound, setSound] = useState(initial.sound);
  const [light, setLight] = useState(initial.light);
  const [audio, setAudio] = useState<boolean | null>(null);
  const reduced = prefersReducedMotion();
  const toggleSound = async (on: boolean): Promise<void> => {
    if (!on) { setSound(false); send({ t: "sound", consent: false }); return; }
    const ok = await unlock();
    setAudio(ok);
    setSound(true);
    send({ t: "sound", consent: true, audio: ok });
  };
  const toggleLight = (on: boolean): void => { setLight(on); send({ t: "light", consent: on, reducedMotion: reduced }); };
  return (
    <div className="ui-stack--tight" aria-label="Sound and light">
      <button type="button" role="switch" aria-checked={sound} className="ui-button ui-switch" onClick={() => void toggleSound(!sound)}>
        <span className="ui-switch-name">Phone sounds</span><span className="ui-switch-state">{sound ? "On" : "Off"}</span>
      </button>
      <p className="ui-hint">{sound ? audio === false ? `This phone could not start sound, so it flashes${vibrates ? " and buzzes" : ""} instead.` : "Sounds play after a tap, so you may turn the volume up now. A silent switch can still mute them." : "Off: nothing plays on this phone. You still read every sound in the log."}</p>
      <button type="button" role="switch" aria-checked={light} className="ui-button ui-switch" onClick={() => toggleLight(!light)}>
        <span className="ui-switch-name">Light bar</span><span className="ui-switch-state">{light ? "On" : "Off"}</span>
      </button>
      <p className="ui-hint">{reduced ? "Your phone asks for less motion, so the light bar stays dark." : "The screen glows grey in time with the house. It never flashes more than twice a second."}</p>
    </div>
  );
}

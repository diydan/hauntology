import { useMemo, useRef } from "react";
import { createBrowserFeel } from "./feel/create";
import type { PuzzleFeel, TiltState } from "./feel/types";
import { useFeelValue } from "./hooks";
import type { DeviceSettings, DeviceSettingsControl } from "./PuzzleSettings";

/** What a screen that plays Locks needs about this phone: the feel layer, the settings and the ways to change them. */
export type PuzzleDevice = Readonly<{
  feel: PuzzleFeel;
  device: DeviceSettings;
  /** Whether tilt is on now, or why not (the phone has no sensor, it was not allowed, it was turned off). */
  tilt: TiltState;
  canVibrate: boolean;
  /** A change made in the settings: tilt starts or stops at once, so a switch acts the moment it is turned. */
  changeDevice: (next: DeviceSettings) => void;
  /** The Player pressed Tilt inside a Lock (`PuzzleHost`'s `onTiltChoice`): the same saved setting as the switch in the settings. */
  onTiltChoice: (on: boolean) => void;
  setDevice: DeviceSettingsControl["setDevice"];
}>;

/**
 * The glue between the device settings and the feel layer, for the demo page and the Controller alike. It stores nothing: the settings come in
 * as a `DeviceSettingsControl` and whoever owns them (the Controller, through `useDeviceSettings`) keeps them on the phone.
 * The feel layer reads the settings through a getter, so a change is seen by the next frame without making a new feel.
 */
export function usePuzzleDevice(control: DeviceSettingsControl): PuzzleDevice {
  const { device, setDevice } = control;
  const deviceRef = useRef(device);
  deviceRef.current = device;
  const feel = useMemo(() => createBrowserFeel(() => deviceRef.current), []);
  const tilt = useFeelValue(feel.motion.subscribe, () => feel.motion.state);
  // The Player's wish for tilt lives in the device settings. Tilt starts by itself where the phone has a sensor, so a switch must act at once:
  // turning it on (a tap, which is also what an iPhone needs to ask) asks now, turning it off or choosing Touch only stops it.
  const changeDevice = (next: DeviceSettings): void => {
    const was = deviceRef.current;
    setDevice(next);
    if ((next.touchOnly && !was.touchOnly) || (was.tilt && !next.tilt)) feel.motion.disable();
    else if ((!was.tilt && next.tilt && !next.touchOnly) || (was.touchOnly && !next.touchOnly && next.tilt)) void feel.motion.enable();
  };
  const onTiltChoice = (on: boolean): void => setDevice((d) => ({ ...d, tilt: on }));
  return { feel, device, tilt, canVibrate: feel.haptics.supported, changeDevice, onTiltChoice, setDevice };
}

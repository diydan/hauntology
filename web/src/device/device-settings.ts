import { useCallback, useRef, useState } from "react";
import { DEFAULT_DEVICE_SETTINGS, type DeviceSettings, type DeviceSettingsControl } from "../puzzles/PuzzleSettings";

/**
 * What a phone remembers about how its Player likes to play: the tilt wish (on by default, off once the Player turned it off),
 * Touch only, tilt strength, buzz, twist direction, sound and Assist. It lives on the device (localStorage), so each Player's own
 * phone keeps its own choice from one Lock to the next and from one game to the next. Nothing here is sent to a Room or a server.
 */
export const DEVICE_SETTINGS_KEY = "hauntology.puzzles.device";

export type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

/** The phone's storage, or null where it is not there or not allowed (private browsing, a blocked-storage setting): the settings then last for this visit only. */
export function deviceStorage(): SettingsStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const HAPTIC_MODES: readonly DeviceSettings["hapticMode"][] = ["auto", "vibrate", "visual"];
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

/** The settings in a stored string. A missing, damaged or out-of-range value gives that setting's default and leaves the others as they were. */
export function parseDeviceSettings(raw: string | null): DeviceSettings {
  const d = DEFAULT_DEVICE_SETTINGS;
  let o: Record<string, unknown> = {};
  try {
    const v: unknown = raw === null ? null : JSON.parse(raw);
    if (typeof v === "object" && v !== null && !Array.isArray(v)) o = v as Record<string, unknown>;
  } catch {
    o = {};
  }
  const strength = typeof o.sensitivity === "number" && Number.isFinite(o.sensitivity) ? Math.min(2.5, Math.max(0.4, o.sensitivity)) : d.sensitivity;
  return {
    touchOnly: bool(o.touchOnly, d.touchOnly),
    tilt: bool(o.tilt, d.tilt),
    sensitivity: strength,
    hapticMode: HAPTIC_MODES.find((m) => m === o.hapticMode) ?? d.hapticMode,
    dialInvert: bool(o.dialInvert, d.dialInvert),
    soundConsent: bool(o.soundConsent, d.soundConsent),
    assist: bool(o.assist, d.assist),
  };
}

export function readDeviceSettings(storage: SettingsStorage | null = deviceStorage()): DeviceSettings {
  try {
    return parseDeviceSettings(storage?.getItem(DEVICE_SETTINGS_KEY) ?? null);
  } catch {
    return parseDeviceSettings(null);
  }
}

/** Remember the settings. False when the phone would not keep them: the Player still has them for this visit, and nothing breaks. */
export function writeDeviceSettings(settings: DeviceSettings, storage: SettingsStorage | null = deviceStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify(parseDeviceSettings(JSON.stringify(settings))));
    return true;
  } catch {
    return false;
  }
}

type Next = Parameters<DeviceSettingsControl["setDevice"]>[0];

/**
 * The device settings of a Controller: read from the phone once, and written back at every change (a tap on Tilt, a switch in the
 * settings). `overrides` are for this visit only (the demo's `?assist=1`); they are saved with the rest from the next change.
 * Give the setter to `PuzzleSettings` (`onDevice`) and the host's `onTiltChoice`, and the choice survives a reload.
 */
export function useDeviceSettings(overrides: Partial<DeviceSettings> = {}, storage?: SettingsStorage | null): readonly [DeviceSettings, (next: Next) => void] {
  const place = useRef<SettingsStorage | null | undefined>(storage);
  const [device, setDevice] = useState<DeviceSettings>(() => ({ ...readDeviceSettings(storage === undefined ? deviceStorage() : storage), ...overrides }));
  const latest = useRef(device);
  latest.current = device;
  const set = useCallback((next: Next): void => {
    const value = typeof next === "function" ? next(latest.current) : next;
    latest.current = value;
    writeDeviceSettings(value, place.current === undefined ? deviceStorage() : place.current);
    setDevice(value);
  }, []);
  return [device, set];
}

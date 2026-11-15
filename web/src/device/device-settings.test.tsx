// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEVICE_SETTINGS_KEY, parseDeviceSettings, readDeviceSettings, useDeviceSettings, writeDeviceSettings, type SettingsStorage } from "./device-settings";
import { PersistedPuzzleDemo } from "./PersistedPuzzleDemo";
import { DEFAULT_DEVICE_SETTINGS, type DeviceSettings } from "../puzzles/PuzzleSettings";
import { stubCanvas, stubGeometry } from "../puzzles/test-utils";

/** A phone's storage in a Map. */
const memory = (start: Record<string, string> = {}): SettingsStorage & { data: Map<string, string> } => {
  const data = new Map(Object.entries(start));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
};
const stored = (s: { data: Map<string, string> }): unknown => JSON.parse(s.data.get(DEVICE_SETTINGS_KEY) ?? "null");

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

describe("what a phone remembers about how its Player likes to play", () => {
  it("starts with tilt on and everything else at its default when nothing was saved, or what was saved is damaged", () => {
    expect(parseDeviceSettings(null)).toEqual(DEFAULT_DEVICE_SETTINGS);
    expect(DEFAULT_DEVICE_SETTINGS.tilt).toBe(true);
    for (const bad of ["", "{", "null", "[]", "42", "\"tilt\"", "{\"tilt\":\"no\"}"]) expect(parseDeviceSettings(bad), bad).toEqual(DEFAULT_DEVICE_SETTINGS);
  });

  it("keeps the Player's tilt choice: off stays off, on stays on, and the other settings come back as they were", () => {
    const mine: DeviceSettings = { touchOnly: false, tilt: false, sensitivity: 1.7, hapticMode: "visual", dialInvert: true, soundConsent: false, assist: true };
    expect(parseDeviceSettings(JSON.stringify(mine))).toEqual(mine);
    expect(parseDeviceSettings("{\"tilt\":false}").tilt).toBe(false);
    expect(parseDeviceSettings("{\"tilt\":false}").sensitivity).toBe(1);
    expect(parseDeviceSettings("{\"touchOnly\":true}").touchOnly).toBe(true);
  });

  it("takes a value that is wrong or out of range as that setting's default, and leaves the others alone", () => {
    const got = parseDeviceSettings(JSON.stringify({ tilt: false, sensitivity: 99, hapticMode: "loud", dialInvert: 1, assist: true }));
    expect(got).toEqual({ ...DEFAULT_DEVICE_SETTINGS, tilt: false, sensitivity: 2.5, assist: true });
    expect(parseDeviceSettings(JSON.stringify({ sensitivity: -3 })).sensitivity).toBe(0.4);
    expect(parseDeviceSettings("{\"sensitivity\":\"1.5\"}").sensitivity).toBe(1);
    expect(parseDeviceSettings("{\"sensitivity\":null}").sensitivity).toBe(1);
  });

  it("writes only the settings it knows, reads them back, and says so when the phone would not keep them", () => {
    const place = memory();
    expect(writeDeviceSettings({ ...DEFAULT_DEVICE_SETTINGS, tilt: false, extra: "x" } as DeviceSettings, place)).toBe(true);
    expect(stored(place)).toEqual({ ...DEFAULT_DEVICE_SETTINGS, tilt: false });
    expect(readDeviceSettings(place).tilt).toBe(false);
    const full: SettingsStorage = { getItem: () => null, setItem: () => { throw new DOMException("full", "QuotaExceededError"); } };
    expect(writeDeviceSettings(DEFAULT_DEVICE_SETTINGS, full)).toBe(false);
    expect(writeDeviceSettings(DEFAULT_DEVICE_SETTINGS, null)).toBe(false);
  });

  it("plays on with the defaults when the phone's storage is blocked or breaks (private browsing, a blocked-storage setting)", () => {
    const broken: SettingsStorage = { getItem: () => { throw new DOMException("no", "SecurityError"); }, setItem: () => { throw new DOMException("no", "SecurityError"); } };
    expect(readDeviceSettings(broken)).toEqual(DEFAULT_DEVICE_SETTINGS);
    expect(readDeviceSettings(null)).toEqual(DEFAULT_DEVICE_SETTINGS);
    const { result } = renderHook(() => useDeviceSettings({}, broken));
    act(() => result.current[1]((d) => ({ ...d, tilt: false })));
    expect(result.current[0].tilt).toBe(false); // still the Player's choice for this visit
  });
});

describe("useDeviceSettings", () => {
  it("reads the phone once, saves every change, and the next visit starts from it", () => {
    const place = memory({ [DEVICE_SETTINGS_KEY]: JSON.stringify({ tilt: false, sensitivity: 1.3 }) });
    const first = renderHook(() => useDeviceSettings({}, place));
    expect(first.result.current[0]).toEqual({ ...DEFAULT_DEVICE_SETTINGS, tilt: false, sensitivity: 1.3 });
    expect(place.data.size).toBe(1); // reading changed nothing
    act(() => first.result.current[1]((d) => ({ ...d, tilt: true })));
    act(() => first.result.current[1]((d) => ({ ...d, touchOnly: true }))); // two changes in a row: the second sees the first
    expect(stored(place)).toEqual({ ...DEFAULT_DEVICE_SETTINGS, tilt: true, sensitivity: 1.3, touchOnly: true });
    first.unmount();
    const next = renderHook(() => useDeviceSettings({}, place));
    expect(next.result.current[0]).toEqual({ ...DEFAULT_DEVICE_SETTINGS, tilt: true, sensitivity: 1.3, touchOnly: true });
  });

  it("takes a whole new value as well as an update function, and an override for this visit sits on top of what was saved", () => {
    const place = memory({ [DEVICE_SETTINGS_KEY]: JSON.stringify({ assist: false }) });
    const { result } = renderHook(() => useDeviceSettings({ assist: true }, place));
    expect(result.current[0].assist).toBe(true);
    expect(place.data.get(DEVICE_SETTINGS_KEY)).toBe(JSON.stringify({ assist: false })); // nothing is saved until the Player changes something
    act(() => result.current[1]({ ...result.current[0], tilt: false }));
    expect(result.current[0].tilt).toBe(false);
    expect((stored(place) as DeviceSettings).tilt).toBe(false);
  });

  it("uses the browser's own storage when none is given", () => {
    localStorage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify({ tilt: false }));
    const { result } = renderHook(() => useDeviceSettings());
    expect(result.current[0].tilt).toBe(false);
    act(() => result.current[1]((d) => ({ ...d, tilt: true })));
    expect(JSON.parse(localStorage.getItem(DEVICE_SETTINGS_KEY) ?? "{}").tilt).toBe(true);
  });
});

describe("the puzzle demo page keeps the Player's choices across a reload", () => {
  let restoreGeometry = (): void => {};
  let restoreCanvas = (): void => {};
  beforeEach(() => { restoreGeometry = stubGeometry(); restoreCanvas = stubCanvas(); });
  afterEach(() => { restoreGeometry(); restoreCanvas(); });
  const saved = (): DeviceSettings => JSON.parse(localStorage.getItem(DEVICE_SETTINGS_KEY) ?? "null") as DeviceSettings;
  const open = async (): Promise<void> => {
    render(<PersistedPuzzleDemo search="?kind=maze&level=easy&seed=1&faded=0" />);
    await screen.findByRole("application", { name: /^Maze\./ }, { timeout: 5000 });
  };

  it("writes nothing until the Player chooses, then a tap on Tilt in the puzzle is saved on the phone", async () => {
    localStorage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify({ tilt: false }));
    await open();
    expect(saved()).toEqual({ tilt: false }); // opening the puzzle did not rewrite it
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Tilt" })); await Promise.resolve(); });
    expect(saved().tilt).toBe(true); // the host's onTiltChoice reaches the phone's storage
    cleanup();
    await open(); // the next visit
    expect(saved().tilt).toBe(true);
  });

  it("brings back a switch in the settings after a reload", async () => {
    await open();
    fireEvent.click(screen.getByText("Settings"));
    const touchOnly = (): HTMLElement => screen.getByRole("switch", { name: /Touch only/ });
    expect(touchOnly().getAttribute("aria-checked")).toBe("false");
    await act(async () => { fireEvent.click(touchOnly()); });
    expect(saved().touchOnly).toBe(true);
    cleanup();
    await open();
    fireEvent.click(screen.getByText("Settings"));
    expect(touchOnly().getAttribute("aria-checked")).toBe("true");
  });
});

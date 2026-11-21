// @vitest-environment jsdom
import { renderHook, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { defaultPlatform } from "../app/platform";
import { createFakeFeel } from "./feel/fakes";
import { DEFAULT_DEVICE_SETTINGS } from "./PuzzleSettings";
import { usePuzzleDevice } from "./usePuzzleDevice";

afterEach(() => { cleanup(); });

describe("PlatformKit.puzzleFeel (puzzles 5.1)", () => {
  it("the default platform makes the browser's four pieces, reading the device switches through the getter it is given", () => {
    const device = { current: { ...DEFAULT_DEVICE_SETTINGS } };
    const feel = defaultPlatform().puzzleFeel(() => device.current);
    expect(feel.motion).toBeDefined();
    expect(feel.haptics).toBeDefined();
    expect(feel.synth).toBeDefined();
    expect(feel.breath).toBeDefined();
    expect(typeof feel.onEvent).toBe("function");
    feel.closeLock();
  });

  it("usePuzzleDevice uses the feel the platform makes, so a test or the demo can swap the whole layer", () => {
    const fake = createFakeFeel();
    let asked = 0;
    const { result } = renderHook(() => usePuzzleDevice({ device: DEFAULT_DEVICE_SETTINGS, setDevice: () => {} }, () => { asked++; return fake; }));
    expect(result.current.feel).toBe(fake);
    expect(asked).toBe(1);
  });
});

describe("the Synth follows the seat's sound consent in a Party Room (puzzles 5.6)", () => {
  it("the feel's settings say sound only when the phone's Sound switch is on AND the Room has not said no; Wander passes no gate and the switch alone decides", () => {
    let read: (() => { soundConsent: boolean }) | null = null;
    const make = (settings: () => { soundConsent: boolean }) => { read = settings; return createFakeFeel(); };
    const on = { ...DEFAULT_DEVICE_SETTINGS, soundConsent: true };
    const off = { ...DEFAULT_DEVICE_SETTINGS, soundConsent: false };
    const { rerender } = renderHook(({ device, allowed }: { device: typeof on; allowed: boolean | undefined }) =>
      usePuzzleDevice({ device, setDevice: () => {} }, make as never, allowed === undefined ? {} : { soundAllowed: allowed }), { initialProps: { device: on, allowed: undefined as boolean | undefined } });
    expect(read!().soundConsent).toBe(true); // Wander: no gate
    rerender({ device: on, allowed: false });
    expect(read!().soundConsent).toBe(false); // the Room says no
    rerender({ device: on, allowed: true });
    expect(read!().soundConsent).toBe(true);
    rerender({ device: off, allowed: true });
    expect(read!().soundConsent).toBe(false); // the phone's own switch still wins
  });
});

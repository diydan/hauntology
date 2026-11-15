// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Transcript } from "@hauntology/shared/puzzles/types";
import { createFakeFeel } from "../../puzzles/feel/fakes";
import type { PuzzleHostProps } from "../../puzzles/PuzzleHost";
import { DEFAULT_DEVICE_SETTINGS } from "../../puzzles/PuzzleSettings";
import type { PuzzleDevice } from "../../puzzles/usePuzzleDevice";
import type { ControllerPort, LockOffer } from "./controller-port";
import { LockArea } from "./LockArea";
import { StandInPort } from "./standin-port";

let props: PuzzleHostProps | null = null;
vi.mock("../../puzzles/PuzzleHost", () => ({ PuzzleHost: (p: PuzzleHostProps) => { props = p; return <div data-testid="host" />; } }));
afterEach(() => { cleanup(); props = null; });

function setup(over: Partial<PuzzleDevice["device"]> = {}) {
  const port = new StandInPort();
  port.offerLock("candles", "easy", 2, true);
  const offer = port.getView().lock as LockOffer;
  const calls: string[] = [];
  const device = {
    feel: createFakeFeel(), device: { ...DEFAULT_DEVICE_SETTINGS, ...over }, tilt: "off", canVibrate: false, changeDevice: () => undefined,
    onTiltChoice: (on: boolean) => { calls.push(`tilt ${on}`); }, setDevice: () => undefined,
  } as unknown as PuzzleDevice;
  render(<LockArea port={port as ControllerPort} offer={offer} device={device} />);
  return { port, offer, device, calls, host: props as unknown as PuzzleHostProps };
}

describe("LockArea gives the Lock to the puzzle screen and the answers to the Room", () => {
  it("passes the Lock as the Room made it, and the phone's feel and Assist setting", () => {
    const { offer, device, host } = setup({ assist: true });
    expect(host.kind).toBe(offer.kind);
    expect(host.view).toBe(offer.view);
    expect(host.faded).toBe(offer.faded);
    expect(host.clue).toBe(offer.clue);
    expect(host.attempts).toBe(offer.attempts);
    expect(host.capMs).toBe(offer.capMs);
    expect(host.feel).toBe(device.feel);
    expect(host.assist).toBe(true);
    expect(setup({ assist: false }).host.assist).toBe(false);
  });

  it("sends an Attempt to the Room under the Lock's id and returns the Room's reply", () => {
    const { port, offer, host } = setup();
    const t = { kind: "candles", order: [0] } as unknown as Transcript;
    const reply = host.onAttempt(t);
    expect(port.calls).toContain(`attempt ${offer.id}`);
    expect(reply).toMatchObject({ outcome: expect.stringMatching(/wrong|failed|solved/) });
  });

  it("tells the Room how the Lock ended: given up, out of time, or done (the result was read)", () => {
    const { port, offer, host } = setup();
    host.onGiveUp();
    host.onTimeUp?.();
    host.onFinish?.({ outcome: "solved" });
    expect(port.calls.filter((c) => c.startsWith("closeLock"))).toEqual([`closeLock ${offer.id} gave_up`, `closeLock ${offer.id} time_up`, `closeLock ${offer.id} finished`]);
  });

  it("hands the Player's Tilt button to the phone's settings, not to the Room", () => {
    const { calls, port, host } = setup();
    host.onTiltChoice?.(false);
    host.onTiltChoice?.(true);
    expect(calls).toEqual(["tilt false", "tilt true"]);
    expect(port.calls.some((c) => /tilt/i.test(c))).toBe(false); // what a Player feels like using is nobody else's business
  });
});

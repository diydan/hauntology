// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { soundAvailability } from "@hauntology/shared/party/sounds";
import { game, pub } from "../../test/party-fixtures";
import { EMPTY_HOST } from "../host/host-view";
import { IDLE_HOST, type HostState } from "../phone/host-port";
import type { SoundDeps } from "../controller/play/phone-sound";
import { DisplayPage } from "./DisplayPage";

afterEach(cleanup);

const DOOR = { id: "d1", at: { x: 2, z: 3 }, width: 1, a: "z1", b: "z2", lock: "knock", open: false, need: 0, have: 0 };
const DOOR2 = { ...DOOR, id: "d2", at: { x: 8, z: 7 }, a: "z2", b: "z3", lock: "heavy", need: 2, have: 1 };

class FakePort {
  state: HostState;
  listeners = new Set<() => void>();
  constructor(doors: unknown[]) { this.state = { ...IDLE_HOST, connection: "online", view: { ...EMPTY_HOST, game: game({ pub: pub({ doors }) }) } }; }
  getState() { return this.state; }
  subscribe(l: () => void) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
  setDoors(doors: unknown[]) { this.state = { ...this.state, view: { ...EMPTY_HOST, game: game({ pub: pub({ doors }) }) } }; act(() => { for (const l of [...this.listeners]) l(); }); }
}
const sounds = () => {
  const played: string[] = [];
  const timers: (() => void)[] = [];
  const deps: SoundDeps = { play: (id) => played.push(id), vibrate: () => undefined, available: soundAvailability(["creak"]), canVibrate: false, reducedMotion: false, now: () => Date.now(), setTimer: (f) => { timers.push(f); return timers.length; }, clearTimer: () => undefined };
  return { played, timers, sound: { deps, offsetMs: 0 } };
};
const mount = (p: FakePort, over: { reduced?: boolean; sound?: ReturnType<typeof sounds>["sound"] } = {}) =>
  render(<DisplayPage port={p as never} reducedMotion={over.reduced ?? false} storage={localStorage} size={{ width: 1000, height: 800 }} {...(over.sound ? { sound: over.sound } : {})} />);
const live = (c: HTMLElement): string => c.querySelector("[data-door-live]")?.textContent ?? "";

describe("doors on the Display (knock-door 8.2, 8.4)", () => {
  it("draws nothing for doors in a world with none", () => {
    const { container } = mount(new FakePort([]));
    expect(container.querySelectorAll(".pd-door")).toHaveLength(0);
    expect(container.querySelectorAll(".pd-doors")).toHaveLength(0);
    expect(live(container)).toBe("");
  });
  it("shows each door once in each picture, shut or open, with its state in words and no lock or count", () => {
    const { container } = mount(new FakePort([DOOR, { ...DOOR2, open: true }]));
    // four tiles, two doors each
    expect(container.querySelectorAll(".pd-door")).toHaveLength(8);
    const first = container.querySelector<HTMLElement>('[data-door="d1"]')!;
    expect(first.dataset.open).toBe("no");
    expect(container.querySelector<HTMLElement>('[data-door="d2"]')!.dataset.open).toBe("yes");
    const words = [...container.querySelectorAll(".pd-door-words li")].map((li) => li.textContent);
    expect(words.slice(0, 2)).toEqual(["The door between Cellar and Attic: shut", "The door between Attic and Parlour: open"]);
    expect(container.querySelector(".pd-doors")!.textContent).not.toMatch(/knock|heavy|\d of \d/i);
    expect(live(container)).toBe(""); // the first look is quiet
  });
  it("says a change in the live region, swings with the slow fade, and creaks once", () => {
    const s = sounds();
    const port = new FakePort([DOOR]);
    const { container } = mount(port, { sound: s.sound });
    port.setDoors([{ ...DOOR, open: true }]);
    expect(live(container)).toBe("The door between Cellar and Attic opened.");
    expect(container.querySelector<HTMLElement>('[data-door="d1"]')!.dataset.open).toBe("yes");
    act(() => s.timers.splice(0).forEach((f) => f()));
    expect(s.played).toEqual(["creak"]);
    port.setDoors([{ ...DOOR, open: true }]); // same state again: no new creak, no new words
    act(() => s.timers.splice(0).forEach((f) => f()));
    expect(s.played).toEqual(["creak"]);
    port.setDoors([DOOR]);
    expect(live(container)).toBe("The door between Cellar and Attic shut.");
  });
  it("shows the final state with no swing under reduced motion, and still says the change", () => {
    const port = new FakePort([DOOR]);
    const { container } = mount(port, { reduced: true });
    expect(container.querySelector<HTMLElement>('[data-door="d1"]')!.dataset.motion).toBe("none");
    port.setDoors([{ ...DOOR, open: true }]);
    expect(container.querySelector<HTMLElement>('[data-door="d1"]')!.dataset.open).toBe("yes");
    expect(live(container)).toBe("The door between Cellar and Attic opened.");
  });
});

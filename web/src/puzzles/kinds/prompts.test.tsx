// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import type { Kind } from "@hauntology/shared/puzzles/types";
import { mountKind, stubCanvas, stubGeometry } from "../test-utils";
import Board from "./Board";
import Candles from "./Candles";
import Clock from "./Clock";
import LockPick from "./LockPick";
import Maze from "./Maze";
import Moved from "./Moved";
import MusicBox from "./MusicBox";
import Photo from "./Photo";
import Safe from "./Safe";
import Wires from "./Wires";
import Words from "./Words";

let undo: Array<() => void> = [];
beforeEach(() => { undo = [stubGeometry(), stubCanvas()]; });
afterEach(() => { cleanup(); for (const u of undo) u(); vi.useRealTimers(); });

function viewOf<K extends Kind>(kind: K) {
  const lock = makeLock(kind, "easy", 6);
  if (lock.kind !== kind) throw new Error("kind");
  return lock.view as Extract<typeof lock.view, { kind: K }>;
}
const hints = (): string[] => [...document.querySelectorAll(".pz-hint")].map((h) => h.textContent ?? "");

// Every Memory Kind names what the Player is matching, because the clue was seen in another place and cannot be seen here.
describe("a prompt names its target", () => {
  it("Clock: the stopped clock you saw", () => {
    mountKind(Clock, viewOf("clock"));
    expect(hints()[0]).toBe("Set the hands to the time on the stopped clock you saw.");
  });
  it("Safe: the plaque you saw", () => {
    mountKind(Safe, viewOf("safe"));
    expect(hints()[0]).toMatch(/code from the plaque you saw/);
  });
  it("Wires: the fuse box you saw", () => {
    mountKind(Wires, viewOf("wires"));
    expect(hints()[0]).toMatch(/place in the fuse box you saw/);
  });
  it("What moved: the shelf you saw, once the lights are back", () => {
    vi.useFakeTimers();
    mountKind(Moved, viewOf("moved"));
    act(() => { vi.advanceTimersByTime(2600); });
    expect(hints().some((h) => /changed on the shelf you saw/.test(h))).toBe(true);
  });
  it("Torn photo: the photo you saw", () => {
    mountKind(Photo, viewOf("photo"));
    expect(hints()[0]).toMatch(/Put the photo you saw back together/);
  });
});

// One instruction per screen: it is said once and does not come back in a second line.
describe("each screen says its instruction once", () => {
  it("Words: one line that follows the tilt setting", () => {
    mountKind(Words, viewOf("words"), { tilt: "off" });
    expect(hints()).toEqual(["Drag a finger to aim the torch. Pick the lit letters, left to right."]);
    cleanup();
    mountKind(Words, viewOf("words"), { tilt: "on" });
    expect(hints()).toEqual(["Lean the phone to sweep the torch. Pick the lit letters, left to right."]);
  });
  it("Maze: one line that follows the tilt setting", () => {
    mountKind(Maze, viewOf("maze"), { tilt: "off" });
    expect(hints()).toEqual(["Reach the green ring. Hold a finger where the orb should go."]);
    cleanup();
    mountKind(Maze, viewOf("maze"), { tilt: "on" });
    expect(hints()).toEqual(["Reach the green ring. Lean the phone to roll the orb."]);
  });
  it("Lock pick: the pins hint, then only the tension help below the controls", () => {
    mountKind(LockPick, viewOf("lockpick"));
    expect(hints()).toEqual(["Feel for each pin's sweet spot. Pins set left to right.", "Touching the slider holds the tension for you. Or hold the Tension button."]);
  });
  it("Music box: the tune is wound before it is played back, and the no-sound line explains the shapes", () => {
    const v = viewOf("musicbox");
    mountKind(MusicBox, v);
    expect(hints()[0]).toBe(`Press Wind to hear the ${v.n}-note tune, then play it back on the keys.`);
    expect(hints()[1]).toMatch(/No sound\? Watch the keys light up/);
  });
  it("Spirit board: one instruction under the board, and the clue above it", () => {
    mountKind(Board, viewOf("board"));
    expect(hints().filter((h) => /planchette/.test(h)).length).toBe(1);
    expect(hints().some((h) => /^Clue: /.test(h))).toBe(true);
  });
});

describe("Candles: what is out is said in words", () => {
  it("starts with none out and then lists them in the order they were put out; the microphone line sits beside its button", () => {
    const v = viewOf("candles");
    mountKind(Candles, v);
    expect(screen.getByText("Out so far: none")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Candle 3,/ }));
    expect(screen.getByText("Out so far: 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Candle 1,/ }));
    expect(screen.getByText("Out so far: 3 then 1")).toBeTruthy();
    const note = hints().findIndex((h) => /Or blow them out/.test(h));
    expect(note).toBeGreaterThanOrEqual(0);
    expect(hints()[note]).toMatch(/microphone is optional and only measures loudness\. Nothing is recorded\./);
    const mic = screen.getByRole("button", { name: "Blow to snuff" });
    expect(document.querySelectorAll(".pz-hint")[note]?.nextElementSibling?.contains(mic)).toBe(true); // the line is right above the buttons
  });
});

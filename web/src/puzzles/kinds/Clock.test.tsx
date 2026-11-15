// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import { verify } from "@hauntology/shared/puzzles/verify";
import { polar } from "../art/ClockFace";
import { mountKind, pointer, stubGeometry, wait } from "../test-utils";
import Clock from "./Clock";

let restore = (): void => {};
beforeEach(() => { restore = stubGeometry(); });
afterEach(() => { cleanup(); restore(); });

const view = makeLock("clock", "medium", 7).view;
if (view.kind !== "clock") throw new Error("kind");
/** The clock's view at a level. */
const viewAt = (level: "easy" | "medium" | "hard", seed = 7) => { const v = makeLock("clock", level, seed).view; if (v.kind !== "clock") throw new Error("kind"); return v; };
const readout = (): string => screen.getByRole("img", { name: /The clock shows/ }).textContent ?? "";

/** Press at a hand's tip and drag to an angle on the dial. */
function dragHand(board: Element, from: { deg: number; r: number }, toDeg: number, toR = from.r): void {
  const [x0, y0] = polar(150, 150, from.r, from.deg);
  const [x1, y1] = polar(150, 150, toR, toDeg);
  pointer(board, "pointerdown", x0, y0);
  pointer(board, "pointermove", x1, y1);
  pointer(board, "pointerup", x1, y1);
}

describe("Clock", () => {
  it("starts at 12:00 with every control named and big enough to be a button", () => {
    mountKind(Clock, view);
    expect(readout()).toBe("12:00");
    expect(screen.getByRole("application", { name: "Clock to set" })).toBeTruthy();
    for (const name of ["Hour back", "Hour forward", "Minutes back", "Minutes forward", "Hour hand", "Minute hand", "Twist", "Set this time"]) {
      expect(screen.getByRole("button", { name }), name).toBeTruthy();
    }
  });

  it("sets the minutes by dragging the long hand, and the hour by dragging the short one, with a tick each", () => {
    const { submits, feel } = mountKind(Clock, view);
    const board = screen.getByRole("application");
    dragHand(board, { deg: 0, r: 104 }, 120); // the minute hand from 12 to the 4: 20 minutes
    expect(readout()).toBe("12:20");
    dragHand(board, { deg: 10, r: 50 }, 130, 50); // the hour hand (now at 10 degrees) to just past the 4
    expect(readout()).toBe("4:20");
    expect(feel.haptics.buzzes.filter((b) => b === "tick").length).toBeGreaterThanOrEqual(2);
    expect(feel.synth.played).toContain("tick");
    fireEvent.click(screen.getByRole("button", { name: "Set this time" }));
    expect(submits).toEqual([{ h: 4, m: 20 }]);
  });

  it("moves with the step buttons and wraps round: 12 to 1, 55 minutes to 0", () => {
    mountKind(Clock, view);
    fireEvent.click(screen.getByRole("button", { name: "Hour forward" }));
    expect(readout()).toBe("1:00");
    fireEvent.click(screen.getByRole("button", { name: "Hour back" }));
    fireEvent.click(screen.getByRole("button", { name: "Hour back" }));
    expect(readout()).toBe("11:00");
    fireEvent.click(screen.getByRole("button", { name: "Minutes back" }));
    expect(readout()).toBe("11:55");
    fireEvent.click(screen.getByRole("button", { name: "Minutes forward" }));
    expect(readout()).toBe("11:00");
  });

  it("steps the minutes by the level: a quarter hour on easy, five on medium, one on hard, by button and by drag", () => {
    for (const [level, stepMin] of [["easy", 15], ["medium", 5], ["hard", 1]] as const) {
      mountKind(Clock, viewAt(level));
      fireEvent.click(screen.getByRole("button", { name: "Minutes forward" }));
      expect(readout()).toBe(`12:${String(stepMin).padStart(2, "0")}`);
      fireEvent.click(screen.getByRole("button", { name: "Minutes back" }));
      fireEvent.click(screen.getByRole("button", { name: "Minutes back" }));
      expect(readout()).toBe(`12:${String(60 - stepMin).padStart(2, "0")}`);
      dragHand(screen.getByRole("application", { name: "Clock to set" }), { deg: (60 - stepMin) * 6, r: 120 }, 7 * 6); // to the 7-minute mark
      expect(readout()).toBe(`12:${String(Math.round(7 / stepMin) * stepMin).padStart(2, "0")}`);
      cleanup();
    }
  });

  it("answers a hard clock, set to the minute, and the shared check passes it", () => {
    const { submits } = mountKind(Clock, viewAt("hard", 11));
    const lock = makeLock("clock", "hard", 11);
    if (lock.kind !== "clock") throw new Error("kind");
    for (let i = 0; i < lock.secret.h % 12; i++) fireEvent.click(screen.getByRole("button", { name: "Hour forward" }));
    for (let i = 0; i < lock.secret.m; i++) fireEvent.click(screen.getByRole("button", { name: "Minutes forward" }));
    fireEvent.click(screen.getByRole("button", { name: "Set this time" }));
    expect(verify(lock, { kind: "clock", ...submits[0], elapsedMs: 9999 } as never)).toEqual({ ok: true });
  });

  it("answers the answer: a set time that equals the stopped clock passes the shared check", () => {
    const { submits } = mountKind(Clock, view);
    const lock = makeLock("clock", "medium", 7);
    if (lock.kind !== "clock") throw new Error("kind");
    for (let i = 0; i < lock.secret.h % 12; i++) fireEvent.click(screen.getByRole("button", { name: "Hour forward" }));
    for (let i = 0; i < lock.secret.m / 5; i++) fireEvent.click(screen.getByRole("button", { name: "Minutes forward" }));
    fireEvent.click(screen.getByRole("button", { name: "Set this time" }));
    const p = submits[0];
    expect(p).toBeDefined();
    expect(verify(lock, { kind: "clock", ...p, elapsedMs: 9999 })).toEqual({ ok: true });
  });

  it("ignores a move when nothing is held, and a drag ends when the finger lifts", () => {
    mountKind(Clock, view);
    const board = screen.getByRole("application");
    const [x, y] = polar(150, 150, 104, 90);
    pointer(board, "pointermove", x, y);
    expect(readout()).toBe("12:00");
    dragHand(board, { deg: 0, r: 104 }, 60);
    expect(readout()).toBe("12:10");
    const [x2, y2] = polar(150, 150, 104, 180);
    pointer(board, "pointermove", x2, y2); // after the lift: no effect
    expect(readout()).toBe("12:10");
  });

  it("turns the chosen hand with the phone when Twist is on, and says so when tilt is not available", async () => {
    const { feel } = mountKind(Clock, view, { tilt: "on" });
    feel.motion.dial = 10;
    fireEvent.click(screen.getByRole("button", { name: "Twist" }));
    await wait(80);
    feel.motion.dial = 40; // a quarter-way round: 30 degrees
    await wait(80);
    expect(readout()).toBe("12:05");
    feel.motion.dial = 100; // 90 degrees from the start: 15 minutes
    await wait(80);
    expect(readout()).toBe("12:15");
    fireEvent.click(screen.getByRole("button", { name: "Twist: on" })); // off again
    feel.motion.dial = 200;
    await wait(80);
    expect(readout()).toBe("12:15");

    cleanup();
    const unsupported = mountKind(Clock, view, { tilt: "unsupported" });
    unsupported.feel.motion.enableResult = "unsupported";
    fireEvent.click(screen.getByRole("button", { name: "Twist" }));
    await wait(20);
    expect(unsupported.announcements.at(-1)).toMatch(/not available/i);
    expect(screen.getByRole("button", { name: "Twist" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("uses touch alone: no sensor is read when there is no tilt", async () => {
    const { feel } = mountKind(Clock, view, { tilt: "off" });
    await wait(60);
    expect(feel.motion.enabled).toBe(0);
  });

  it("says what to match, and explains Twist where it is used", () => {
    mountKind(Clock, view);
    expect(screen.getByText("Set the hands to the time on the stopped clock you saw.")).toBeTruthy();
    expect(screen.getByText("Twist: turn the phone like a wheel to turn a hand.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Flip it/ })).toBeNull(); // only once Twist is on
  });

  it("flips the twist direction from the screen itself, when the phone turns the hand the wrong way", async () => {
    const { feel } = mountKind(Clock, view, { tilt: "on" });
    feel.motion.dial = 10;
    fireEvent.click(screen.getByRole("button", { name: "Twist" }));
    await wait(80);
    feel.motion.dial = 40; // 30 degrees round: five minutes
    await wait(80);
    expect(readout()).toBe("12:05");
    expect(screen.getByText(/turn it like a wheel to turn the chosen hand/)).toBeTruthy();
    const flip = screen.getByRole("button", { name: /Flip it/ });
    expect(flip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(flip);
    expect(flip.getAttribute("aria-pressed")).toBe("true");
    await wait(80);
    feel.motion.dial = 10; // 30 degrees back for the phone, which now counts as forward
    await wait(80);
    expect(readout()).toBe("12:10");
    fireEvent.click(flip);
    await wait(80);
    feel.motion.dial = 40;
    await wait(80);
    expect(readout()).toBe("12:15"); // flipping back counts the phone's turn the usual way again: 30 degrees on from 12:10
  });

  it("lays the controls out side by side, never stacked: which hand and Twist in one row, then the four steps", () => {
    mountKind(Clock, view);
    const group = screen.getByRole("group", { name: "Which hand" });
    const row = group.parentElement as HTMLElement;
    expect(row.className).toMatch(/pz-grid3/);
    expect(within(group).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Hour hand", "Minute hand"]);
    expect(screen.getByRole("button", { name: "Twist" }).parentElement).toBe(row);
    expect(document.querySelectorAll(".pz-grid4 > button").length).toBe(4);
  });
});

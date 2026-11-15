// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ClockDial, ClockHands, StoppedClock, hourAngle, minuteAngle } from "./ClockFace";
import { SafeDefs, SafeDial, SafeIndex, SafePlaque, SafePlate } from "./safe";

afterEach(cleanup);

// The safe and the clock are drawn as the objects they are. These tests keep the parts that make them read as those objects (and that the
// clues rely on) in place: the engraved numerals, the ticks, the hands at the right angle, the chosen hand picked out, the plaque's name.
describe("the safe", () => {
  it("has ten engraved numerals on its dial, each engraved twice (the cut and its lit edge), in order", () => {
    const { container } = render(<svg><SafeDefs id="t" /><SafeDial id="t" /></svg>);
    const dark = [...container.querySelectorAll("text.pz-sf-num")].map((t) => t.textContent);
    const lit = [...container.querySelectorAll("text.pz-sf-num-hi")].map((t) => t.textContent);
    expect(dark).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    expect(lit).toEqual(dark);
    expect(container.querySelectorAll("circle.pz-sf-ticks").length).toBe(1); // a tick every tenth of the dial
    expect(container.querySelector(".pz-sf-knob-ring")).not.toBeNull(); // the brass-ringed knob
    expect(container.querySelector(".pz-sf-pointer")).not.toBeNull(); // the notch that shows the turn
  });

  it("has a door plate with four rivets and a fixed brass index, and nothing in them turns by itself (no transform group)", () => {
    const { container } = render(<svg><SafeDefs id="t" /><SafePlate id="t" /><SafeIndex id="t" /></svg>);
    expect(container.querySelectorAll("g.pz-sf-plate > g").length).toBe(4);
    expect(container.querySelector("polygon.pz-sf-marker")).not.toBeNull();
    expect(container.querySelector("g[transform]")).toBeNull(); // the screen's own group is the first and only one that turns
  });

  it("shows the code on a brass plaque for the clue, named for a screen reader as before, with each digit scratched in", () => {
    render(<SafePlaque code={[4, 8, 1]} />);
    const plaque = screen.getByRole("img", { name: "Code: 4 8 1" });
    expect([...plaque.querySelectorAll("text.pz-sf-scratch")].map((t) => t.textContent)).toEqual(["4", "8", "1"]);
    expect(plaque.querySelectorAll("circle.pz-sf-plaque-screw").length).toBe(4);
  });
});

describe("the clock", () => {
  it("has the numerals 1 to 12 in black enamel, sixty minute ticks and twelve bold hour ticks", () => {
    const { container } = render(<svg><ClockDial /></svg>);
    expect([...container.querySelectorAll("text.pz-ck-num")].map((t) => t.textContent)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
    expect(container.querySelectorAll("line.pz-ck-tick, line.pz-ck-tick-big").length).toBe(60);
    expect(container.querySelectorAll("line.pz-ck-tick-big").length).toBe(12);
    expect(container.querySelector("circle.pz-ck-bezel")).not.toBeNull(); // the brass bezel
  });

  it("turns each hand to its own angle: the hour hand by the hour and the minutes, the minute hand by the minutes", () => {
    const { container } = render(<svg><ClockHands h={3} m={30} /></svg>);
    const turns = [...container.querySelectorAll("g[transform^='translate(150 150) rotate(']")].map((g) => Number(/rotate\(([-\d.]+)\)/.exec(g.getAttribute("transform") ?? "")?.[1]));
    expect(turns).toEqual([hourAngle(3, 30), minuteAngle(30)]);
    expect(turns).toEqual([105, 180]);
    expect(container.querySelector(".pz-ck-boss")).not.toBeNull();
    expect(container.querySelector("ellipse.pz-ck-glint")).not.toBeNull(); // the glint of the glass over the hands
  });

  it("picks out only the hand being turned", () => {
    const only = (active: "hour" | "minute" | undefined): string[] => {
      const { container, unmount } = render(<svg><ClockHands h={3} m={30} active={active} /></svg>);
      const lit = [...container.querySelectorAll("g[transform^='translate(150 150) rotate(']")].map((g, i) => (g.querySelector(".pz-ck-hand-active") ? ["hour", "minute"][i] ?? "?" : ""));
      unmount();
      return lit.filter(Boolean);
    };
    expect(only("hour")).toEqual(["hour"]);
    expect(only("minute")).toEqual(["minute"]);
    expect(only(undefined)).toEqual([]);
  });

  it("still names the stopped clock of the clue by its time", () => {
    render(<StoppedClock h={10} m={5} />);
    expect(screen.getByRole("img", { name: "A stopped clock showing 10:05" })).toBeTruthy();
  });
});

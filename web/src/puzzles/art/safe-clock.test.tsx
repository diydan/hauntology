// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CLOCK_C, ClockDial, ClockHands, HOUR_REACH, MINUTE_HAND, MINUTE_REACH, NUMERAL_R, NUMERAL_SIZE, StoppedClock, hourAngle, minuteAngle } from "./ClockFace";
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

  it("keeps the numerals out of the hands' way: they sit on an outer ring, beyond the minute track, and no hand reaches them (so a hand never covers a numeral)", () => {
    const { container } = render(<svg><ClockDial /></svg>);
    const track = [...container.querySelectorAll("circle.pz-ck-track")].map((c) => Number(c.getAttribute("r")));
    expect(track.length).toBe(2);
    expect(Math.max(...track)).toBeLessThan(NUMERAL_R - NUMERAL_SIZE / 2); // the track is inside the numerals
    // where each numeral is: on the ring, at its hour
    const texts = [...container.querySelectorAll("text.pz-ck-num")];
    texts.forEach((t, i) => {
      const x = Number(t.getAttribute("x")) - CLOCK_C;
      const y = Number(t.getAttribute("y")) - NUMERAL_SIZE * 0.36 - CLOCK_C;
      expect(Math.hypot(x, y)).toBeCloseTo(NUMERAL_R, 1);
      expect(((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360).toBeCloseTo(((i + 1) * 30) % 360, 1);
      expect(Number(t.getAttribute("font-size"))).toBe(NUMERAL_SIZE);
    });
    // the nearest edge of each numeral (its box, the glyphs a little narrower) is further out than the longest hand
    for (let n = 1; n <= 12; n++) {
      const a = (n * 30 * Math.PI) / 180;
      const w = String(n).length * NUMERAL_SIZE * 0.6;
      const h = NUMERAL_SIZE * 0.72;
      const inner = NUMERAL_R - ((w / 2) * Math.abs(Math.sin(a)) + (h / 2) * Math.abs(Math.cos(a)));
      expect(inner, `numeral ${n}`).toBeGreaterThan(MINUTE_REACH + 2);
    }
    expect(HOUR_REACH).toBeLessThan(MINUTE_REACH);
  });

  it("draws hands that end where they say they do, the minute hand slim all the way, and neither reaching the numerals", () => {
    const { container } = render(<svg><ClockHands h={3} m={30} /></svg>);
    const reach = (d: string): number => {
      const n = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      let far = 0;
      for (let i = 0; i + 1 < n.length; i += 2) far = Math.max(far, Math.hypot(n[i]!, n[i + 1]!));
      return far;
    };
    const paths = [...container.querySelectorAll("path.pz-ck-hand")].map((p) => p.getAttribute("d") ?? "");
    expect(paths.length).toBe(2);
    expect(reach(paths[0]!)).toBeCloseTo(HOUR_REACH, 0);
    expect(reach(paths[1]!)).toBeCloseTo(MINUTE_REACH, 0);
    expect(paths[1]).toBe(MINUTE_HAND);
    // the minute hand is no wider than 5 units until its point: where it could cross a numeral it is a thin line
    const pts = MINUTE_HAND.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const widest = Math.max(...pts.filter((_, i) => i % 2 === 0).map(Math.abs));
    expect(widest).toBeLessThanOrEqual(4.2);
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

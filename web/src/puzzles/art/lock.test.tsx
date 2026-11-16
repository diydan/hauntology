// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HEIGHT, LIFT, LockDefs, LockPin, LockTools, PICK_MAX, SHEAR, SLICE, driverTop, keyBottom, liftOf, pickPath, springPath } from "./lock";

afterEach(cleanup);

describe("the lock art", () => {
  it("a pin being picked never rises to the shear line by itself: only setting it closes the gap", () => {
    expect(PICK_MAX).toBeLessThan(1);
    expect(liftOf(40, -40, 40)).toBeCloseTo(PICK_MAX); // the pick at its furthest
    expect(liftOf(-40, -40, 40)).toBe(0);
    expect(liftOf(0, -40, 40)).toBeCloseTo(PICK_MAX / 2);
    expect(liftOf(900, -40, 40)).toBeCloseTo(PICK_MAX); // clamped
    expect(liftOf(-900, -40, 40)).toBe(0);
    expect(liftOf(5, 10, 10)).toBeGreaterThanOrEqual(0); // a range of nothing does not divide by zero
  });

  it("the pin is made like a real one: at rest the break between the driver pin and the key pin is a lift below the shear line, set it is exactly on it", () => {
    const breakAt = (lift: number): number => keyBottom(lift) - 24;
    expect(breakAt(0)).toBe(SHEAR + LIFT);
    expect(breakAt(1)).toBe(SHEAR);
    expect(driverTop(1) + 30).toBe(SHEAR); // the driver pin ends where the key pin starts
    expect(driverTop(0) + 30).toBe(SHEAR + LIFT);
    expect(HEIGHT).toBeGreaterThan(SHEAR + LIFT + 24); // the key pin still fits in the cylinder
  });

  it("the spring runs from the cap of the bore to the driver pin, in coils", () => {
    const d = springPath(9, 60);
    expect(d.startsWith("M 28 9.0")).toBe(true);
    expect(d.endsWith("L 28 60.0")).toBe(true);
    expect((d.match(/L /g) ?? []).length).toBe(15); // 14 turns of the coil and the last leg
    expect(springPath(9, 36)).not.toBe(d); // a set pin squeezes it
  });

  it("a slice is one pin: a bore with a spring, a steel driver pin and a brass key pin, the shear line and its number engraved on the lip", () => {
    const { container } = render(<><LockDefs id="t" /><LockPin id="t" index={2} lift={0} /></>);
    const slice = container.querySelector("svg.pz-lock-slice") as SVGElement;
    expect(slice.getAttribute("viewBox")).toBe(`0 0 ${SLICE} ${HEIGHT}`);
    expect(slice.getAttribute("aria-hidden")).toBe("true"); // the words say it all for a screen reader
    for (const part of [".pz-bore", ".pz-spring", ".pz-driver", ".pz-keypin", ".pz-shear", ".pz-keyway", ".pz-lk-housing", ".pz-lk-plug"]) expect(slice.querySelector(part), part).not.toBeNull();
    expect(slice.querySelector(".pz-pin-num")?.textContent).toBe("3");
    expect(slice.querySelector(".pz-driver")?.getAttribute("fill")).toBe("url(#t-steel)");
    expect(slice.querySelector(".pz-keypin")?.getAttribute("fill")).toBe("url(#t-pin)");
  });

  it("a set pin sits a full lift up and an unset one sits down", () => {
    const stack = (lift: number): string => render(<LockPin id="t" index={0} lift={lift} />).container.querySelector<SVGGElement>(".pz-key-stack")?.style.transform ?? "";
    expect(stack(0)).toBe("translateY(0px)");
    expect(stack(1)).toBe(`translateY(${-LIFT}px)`);
    expect(stack(PICK_MAX)).toBe(`translateY(${-LIFT * PICK_MAX}px)`);
  });

  it("the pick goes under the pin being picked and rests out of the lock when every pin is set", () => {
    const tip = (at: number, count = 5): string => render(<LockTools id="t" count={count} at={at} lift={0} held={false} />).container.querySelector(".pz-pick path.pz-rod-pick")?.getAttribute("d") ?? "";
    expect(tip(0)).toBe(pickPath(28, keyBottom(0) + 1.5));
    expect(tip(3)).toBe(pickPath(3 * SLICE + 28, keyBottom(0) + 1.5));
    expect(tip(5)).toBe(pickPath(5 * SLICE + 12, keyBottom(0) + 1.5)); // past the last pin: out of the lock
    expect(pickPath(28, 100)).toMatch(/^M 28 100\.0 L 31 107\.0 Q 34 120 42 120 L 448 120$/); // a hooked tip, then a shaft along the keyway
  });

  it("the wrench is steel and glows when the tension is held; the tools sit over the whole cylinder", () => {
    const { container, rerender } = render(<LockTools id="t" count={4} at={1} lift={0.3} held={false} />);
    expect(container.querySelector(".pz-wrench-held")).toBeNull();
    rerender(<LockTools id="t" count={4} at={1} lift={0.3} held />);
    expect(container.querySelector(".pz-wrench-held")).not.toBeNull();
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe(`0 0 ${4 * SLICE} ${HEIGHT}`);
  });
});

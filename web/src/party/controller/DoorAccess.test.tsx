// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Controller } from "./Controller";
import { StandInPort, STANDIN_CODES } from "./standin-port";

afterEach(cleanup);
const seat = async (port: StandInPort): Promise<void> => {
  fireEvent.change(screen.getByLabelText("Room Code"), { target: { value: STANDIN_CODES.open } });
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ann" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Join" })); await Promise.resolve(); await Promise.resolve(); });
  expect(port.getView().seat).toBe(1);
};
const HEAVY = { id: "iron-door", at: { x: 1, z: 1 }, width: 1.4, a: "z0", b: "z1", lock: "heavy", open: false, need: 2, have: 0 } as never;

describe("Every lock opens by touch alone, and every change is in words (knock-door 9.2, 9.3)", () => {
  it("opens a Heavy door, a Knock door and the Slam's knock at the TV with taps (click events) only", async () => {
    const port = new StandInPort();
    render(<Controller port={port} />);
    await seat(port);
    act(() => port.setDoorsView({ doors: [HEAVY], doorLock: { doorId: "cellar", triesLeft: 3, faded: null }, tvKnock: { answeredBy: null } }));
    fireEvent.click(within(screen.getByRole("region", { name: "Heavy door iron-door" })).getByRole("button", { name: "Push together" }));
    const knock = screen.getByRole("region", { name: "Knock door cellar" });
    fireEvent.click(within(knock).getByRole("button", { name: /^Tap/ }));
    fireEvent.click(within(knock).getByRole("button", { name: "Send knock" }));
    const tv = screen.getByRole("region", { name: "Knock back at the TV" });
    fireEvent.click(within(tv).getByRole("button", { name: /^Tap/ }));
    fireEvent.click(within(tv).getByRole("button", { name: "Send knock" }));
    expect(port.calls).toEqual(expect.arrayContaining(["doorAct iron-door", "doorKnock cellar 1", "tvKnock 1"]));
  });
  it("gives every door control a 44 px target through the shared button, and no control is a bare div", async () => {
    const port = new StandInPort();
    const { container } = render(<Controller port={port} />);
    await seat(port);
    act(() => port.setDoorsView({ doors: [HEAVY], doorLock: { doorId: "cellar", triesLeft: 3, faded: null }, tvKnock: { answeredBy: null } }));
    for (const name of ["Heavy door iron-door", "Knock door cellar", "Knock back at the TV"]) {
      const buttons = within(screen.getByRole("region", { name })).getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
      for (const b of buttons) expect(b.className).toContain("ui-button"); // 44 px targets come from this element (design-system)
    }
    expect(container.querySelectorAll("[onclick], [role=button]:not(button)")).toHaveLength(0);
  });
  it("says a door opening and shutting in the live region, with no flash or animation on the phone", async () => {
    const port = new StandInPort();
    const { container } = render(<Controller port={port} />);
    await seat(port);
    act(() => port.setDoorsView({ doors: [HEAVY] }));
    act(() => port.setDoorsView({ doors: [{ ...HEAVY, open: true }] }));
    expect(screen.getByText("The door iron-door opens.").closest("[aria-live]")?.getAttribute("aria-live")).toBe("polite");
    act(() => port.setDoorsView({ doors: [{ ...HEAVY, open: false }] }));
    expect(screen.getByText("The door iron-door shuts.")).toBeTruthy();
    expect(container.querySelector("[data-flash='on'], [class*='flash']")).toBeNull();
  });
});

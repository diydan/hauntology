// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TiltState } from "./feel/types";
import { DEFAULT_DEVICE_SETTINGS, PuzzleSettings, type DeviceSettings, type PuzzleSettingsProps } from "./PuzzleSettings";

afterEach(cleanup);

type Over = Omit<Partial<PuzzleSettingsProps>, "device"> & { device?: Partial<DeviceSettings> };
function mount(over: Over = {}) {
  const onDevice = vi.fn();
  const device = { ...DEFAULT_DEVICE_SETTINGS, ...over.device };
  const props: PuzzleSettingsProps = { tiltState: "off" as TiltState, canVibrate: true, ...over, device, onDevice };
  const utils = render(<PuzzleSettings {...props} />);
  return { ...utils, onDevice, device };
}
const sw = (name: string): HTMLButtonElement => screen.getByRole("switch", { name: new RegExp(`^${name}`) }) as HTMLButtonElement;

describe("PuzzleSettings", () => {
  it("shows every device switch with a name, a text state and a hint, and the defaults: tilt, buzz and sound on, Assist off", () => {
    mount();
    for (const name of ["Touch only", "Tilt", "Buzz", "Sound", "Assist", "Flip the twist"]) {
      const b = sw(name);
      expect(b.getAttribute("aria-checked"), name).toMatch(/true|false/);
      expect(b.textContent, name).toMatch(/On$|Off$/);
      expect(b.getAttribute("aria-describedby"), name).toBeTruthy();
      expect(document.getElementById(b.getAttribute("aria-describedby") ?? "")?.textContent, name).toBeTruthy();
    }
    expect(sw("Tilt").getAttribute("aria-checked")).toBe("true");
    expect(sw("Buzz").getAttribute("aria-checked")).toBe("true");
    expect(sw("Sound").getAttribute("aria-checked")).toBe("true");
    expect(sw("Assist").getAttribute("aria-checked")).toBe("false");
    expect(sw("Touch only").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("slider", { name: /Tilt strength: 1.0 times/ })).toBeTruthy();
  });

  it("changes one switch at a time and keeps every other setting as it was", () => {
    const { onDevice, device } = mount({ device: { sensitivity: 1.7, dialInvert: true } });
    fireEvent.click(sw("Assist"));
    expect(onDevice).toHaveBeenLastCalledWith({ ...device, assist: true });
    fireEvent.click(sw("Tilt"));
    expect(onDevice).toHaveBeenLastCalledWith({ ...device, tilt: false });
    fireEvent.click(sw("Buzz"));
    expect(onDevice).toHaveBeenLastCalledWith({ ...device, hapticMode: "visual" });
    fireEvent.click(sw("Sound"));
    expect(onDevice).toHaveBeenLastCalledWith({ ...device, soundConsent: false });
    fireEvent.click(sw("Touch only"));
    expect(onDevice).toHaveBeenLastCalledWith({ ...device, touchOnly: true });
    fireEvent.click(sw("Flip the twist"));
    expect(onDevice).toHaveBeenLastCalledWith({ ...device, dialInvert: false });
    fireEvent.change(screen.getByRole("slider"), { target: { value: "2.2" } });
    expect(onDevice).toHaveBeenLastCalledWith({ ...device, sensitivity: 2.2 });
  });

  it("turns a switch back on from off, with Buzz going back to automatic", () => {
    const { onDevice, device } = mount({ device: { hapticMode: "visual", tilt: false, soundConsent: false, assist: true } });
    expect(sw("Buzz").getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw("Buzz"));
    expect(onDevice).toHaveBeenLastCalledWith({ ...device, hapticMode: "auto" });
    fireEvent.click(sw("Tilt"));
    expect(onDevice).toHaveBeenLastCalledWith({ ...device, tilt: true });
    fireEvent.click(sw("Sound"));
    expect(onDevice).toHaveBeenLastCalledWith({ ...device, soundConsent: true });
    fireEvent.click(sw("Assist"));
    expect(onDevice).toHaveBeenLastCalledWith({ ...device, assist: false });
  });

  it("under Touch only, tilt, buzz, sound, strength and twist are off and cannot be changed, and every puzzle can still be played", () => {
    mount({ device: { touchOnly: true, assist: true } });
    for (const name of ["Tilt", "Buzz", "Sound", "Flip the twist"]) expect(sw(name).disabled, name).toBe(true);
    expect(sw("Tilt").getAttribute("aria-checked")).toBe("false");
    expect(sw("Buzz").getAttribute("aria-checked")).toBe("false");
    expect(sw("Sound").getAttribute("aria-checked")).toBe("false");
    expect((screen.getByRole("slider") as HTMLInputElement).disabled).toBe(true);
    expect(sw("Assist").disabled).toBe(false); // Assist is not a sensor
    expect(sw("Assist").getAttribute("aria-checked")).toBe("true"); // and Touch only does not turn it off
    expect(document.body.textContent).toMatch(/Touch only is on, so tilt is off/);
  });

  it("says plainly when the phone has no motion sensor, when motion was denied, and when it cannot buzz", () => {
    const { unmount } = mount({ tiltState: "unsupported" });
    expect(sw("Tilt").disabled).toBe(true);
    expect(sw("Tilt").getAttribute("aria-checked")).toBe("false");
    expect(document.body.textContent).toMatch(/no motion sensor/);
    unmount();
    const denied = mount({ tiltState: "denied" });
    expect(sw("Tilt").disabled).toBe(false);
    expect(document.body.textContent).toMatch(/Motion was not allowed/);
    denied.unmount();
    mount({ canVibrate: false });
    expect(sw("Buzz").disabled).toBe(true);
    expect(sw("Buzz").getAttribute("aria-checked")).toBe("false");
    expect(document.body.textContent).toMatch(/cannot buzz/);
  });

  it("disables the strength and the twist switches when tilt is off, and says so on the Tilt switch", () => {
    mount({ device: { tilt: false } });
    expect((screen.getByRole("slider") as HTMLInputElement).disabled).toBe(true);
    expect(sw("Flip the twist").disabled).toBe(true);
    expect(document.body.textContent).toMatch(/Tilt is off\. You play with touch/);
  });

  it("shows the Master row only when given one: three choices, the current one checked, and the preset's own level in the hint", () => {
    const none = mount();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    none.unmount();
    const onChange = vi.fn();
    mount({ master: { value: "easy", preset: "classic", onChange } });
    const group = screen.getByRole("radiogroup", { name: "Puzzles" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["Off", "Easy", "Normal"]);
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    fireEvent.click(radios[2] as HTMLElement);
    expect(onChange).toHaveBeenCalledWith("normal");
    fireEvent.click(radios[0] as HTMLElement);
    expect(onChange).toHaveBeenLastCalledWith("off");
    expect(group.textContent).toMatch(/preset gives normal/);
    expect(group.textContent).toMatch(/applies from the next Inspect/);
  });

  it("names the level each preset gives: Classic normal, Gentle easy, Quick off", () => {
    for (const [preset, level] of [["classic", "normal"], ["gentle", "easy"], ["quick", "off"]] as const) {
      const m = mount({ master: { value: "off", preset, onChange: () => {} } });
      expect(screen.getByRole("radiogroup").textContent, preset).toMatch(new RegExp(`preset gives ${level}`));
      m.unmount();
    }
  });

  it("offers the Wander Locks switch and the seat's Plain Inspect switch only when given, and calls back with the new value", () => {
    const none = mount();
    expect(screen.queryByRole("switch", { name: /^Locks/ })).toBeNull();
    expect(screen.queryByRole("switch", { name: /^Plain Inspect/ })).toBeNull();
    none.unmount();
    const wander = vi.fn();
    const plain = vi.fn();
    mount({ wander: { on: false, onChange: wander }, plainInspect: { on: true, onChange: plain } });
    expect(sw("Locks").getAttribute("aria-checked")).toBe("false");
    expect(sw("Plain Inspect").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw("Locks"));
    expect(wander).toHaveBeenCalledWith(true);
    fireEvent.click(sw("Plain Inspect"));
    expect(plain).toHaveBeenCalledWith(false);
    expect(document.body.textContent).toMatch(/You can always skip it/);
    expect(document.body.textContent).toMatch(/Nobody else is told/);
  });

  it("is a plain column of named controls: every button has a name, none is a bare icon", () => {
    mount({ master: { value: "normal", preset: "gentle", onChange: () => {} }, wander: { on: true, onChange: () => {} }, plainInspect: { on: false, onChange: () => {} } });
    const buttons = [...document.querySelectorAll("button")];
    expect(buttons.length).toBeGreaterThan(8);
    for (const b of buttons) expect((b.textContent ?? "").trim().length, "named").toBeGreaterThan(0);
    for (const s of screen.getAllByRole("switch")) expect(s.getAttribute("aria-checked")).toMatch(/^(true|false)$/);
  });

  it("groups the settings: the senses together with tilt, its strength and its twist side by side, and Assist under Help", () => {
    mount();
    const groups = screen.getAllByRole("group").map((g) => g.getAttribute("aria-labelledby"));
    expect(groups.length).toBe(2);
    const senses = screen.getByRole("group", { name: "Senses on this phone" });
    const help = screen.getByRole("group", { name: "Help" });
    for (const name of ["Touch only", "Tilt", "Flip the twist", "Buzz", "Sound"]) expect(within(senses).getByRole("switch", { name: new RegExp(`^${name}`) }), name).toBeTruthy();
    expect(within(senses).getByRole("slider")).toBeTruthy();
    expect(within(help).getByRole("switch", { name: /^Assist/ })).toBeTruthy();
    expect(within(senses).queryByRole("switch", { name: /^Assist/ })).toBeNull();
    const order = [...senses.querySelectorAll("[role=switch], input")].map((el) => el.getAttribute("role") ?? "slider");
    expect(order).toEqual(["switch", "switch", "slider", "switch", "switch", "switch"]); // touch only, tilt, strength, twist, buzz, sound
    const labels = [...senses.querySelectorAll(".pz-switch-name")].map((n) => n.textContent);
    expect(labels).toEqual(["Touch only", "Tilt", "Flip the twist", "Buzz", "Sound"]);
  });

  it("spells out the three things Assist does", () => {
    mount();
    const items = [...document.querySelectorAll(".pz-assist-list li")].map((li) => li.textContent);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatch(/keeps the clues you saw on the Clues page.*look at a clue again/);
    expect(items[1]).toMatch(/8 seconds/);
    expect(items[2]).toMatch(/Spirit board's word as text/);
  });
});

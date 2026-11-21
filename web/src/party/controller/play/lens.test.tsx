// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { game, priv, pub } from "../../../test/party-fixtures";
import { isFaceDown, lensDataOf, SpiritLens } from "./SpiritLens";

afterEach(() => { cleanup(); vi.useRealTimers(); });

/** A drawing surface that remembers what was drawn. */
function recorder() {
  const log: string[] = [];
  const proto = HTMLCanvasElement.prototype as unknown as { getContext: unknown };
  const saved = proto.getContext;
  const ctx = { clearRect: () => log.push("clear"), beginPath: () => undefined, arc: () => log.push("arc"), fill: () => undefined, stroke: () => log.push("ripple"), fillText: (t: string) => log.push(`text:${t}`), font: "", textAlign: "" };
  proto.getContext = () => ctx;
  return { log, restore: () => { proto.getContext = saved; } };
}

describe("SpiritLens (party-mode 9.17)", () => {
  it("builds its data only from what this Player already knows: Hand, cards shown to them, Residue they found, their own inspected Zones, the latest ripples", () => {
    const events = [{ id: 1, kind: "inspect", seat: 1, zone: "z2" }, { id: 2, kind: "inspect", seat: 2, zone: "z3" }, { id: 3, kind: "phone-cue", target: 2 }, { id: 4, kind: "rattle", target: 1, turn: 1 }];
    const d = lensDataOf(game({ pub: pub({ events }), priv: priv({ shownToMe: [{ card: "s2", by: 2 }], found: ["r3"] }) }), 1)!;
    expect(d.known.sort()).toEqual(["r2", "r3", "s1", "s2", "z3"]);
    expect(d.inspected).toEqual(["z2"]);
    expect(d.ripples.map((r) => r.eventId)).toEqual([3, 4]);
    expect(lensDataOf(game({ priv: null }), 1)).toBeNull();
  });
  it("is off until a tap, uses no camera, and asks for motion only from that tap", async () => {
    const ask = vi.fn(async () => "granted" as const);
    const r = recorder();
    render(<SpiritLens game={game()} me={1} reducedMotion={false} sensors askPermission={ask} />);
    expect(screen.getByText(/Off\./)).toBeTruthy();
    expect(document.querySelector("canvas")).toBeNull();
    expect(ask).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Turn on the lens" })); });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(document.querySelector("canvas")).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/camera access|marker/i);
    r.restore();
  });
  it("draws simple sprites only for what the Player knows, never a card they do not, and says it in words for assistive tech", async () => {
    const r = recorder();
    render(<SpiritLens game={game()} me={1} reducedMotion={false} sensors={false} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Turn on the lens" })); });
    const texts = r.log.filter((l) => l.startsWith("text:")).map((l) => l.slice(5)).sort();
    expect(texts).toEqual(["Mr Vane", "Parlour", "Wax hand"]);
    expect(texts).not.toContain("Miss Pike");
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("The lens shows what you know: Mr Vane, Parlour, Wax hand.");
    r.restore();
  });
  it("draws at most 30 frames a second, and a quarter of that under reduced motion, with a fixed view and a plain line when there are no sensors", async () => {
    vi.useFakeTimers();
    const r = recorder();
    const { unmount } = render(<SpiritLens game={game()} me={1} reducedMotion={false} sensors={false} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Turn on the lens" })); });
    r.log.length = 0;
    act(() => { vi.advanceTimersByTime(1000); });
    expect(r.log.filter((l) => l === "clear").length).toBeLessThanOrEqual(30);
    expect(r.log.filter((l) => l === "clear").length).toBeGreaterThan(20);
    expect(screen.getByText("Fixed view: this phone cannot turn the picture.")).toBeTruthy();
    unmount();
    cleanup();
    render(<SpiritLens game={game()} me={1} reducedMotion sensors={false} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Turn on the lens" })); });
    r.log.length = 0;
    act(() => { vi.advanceTimersByTime(1000); });
    expect(r.log.filter((l) => l === "clear").length).toBeLessThanOrEqual(8);
    r.restore();
  });
  it("stops drawing while the page is hidden or the phone lies face down, and a tap on the picture lines it up again", async () => {
    vi.useFakeTimers();
    const r = recorder();
    let visible = true;
    render(<SpiritLens game={game()} me={1} reducedMotion={false} sensors askPermission={async () => "unneeded"} visible={() => visible} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Turn on the lens" })); });
    r.log.length = 0;
    visible = false;
    act(() => { vi.advanceTimersByTime(500); });
    expect(r.log.filter((l) => l === "clear")).toHaveLength(0);
    visible = true;
    act(() => { window.dispatchEvent(Object.assign(new Event("deviceorientation"), { alpha: 10, beta: 170, gamma: 0 })); vi.advanceTimersByTime(500); });
    expect(r.log.filter((l) => l === "clear")).toHaveLength(0); // face down
    act(() => { window.dispatchEvent(Object.assign(new Event("deviceorientation"), { alpha: 10, beta: 30, gamma: 0 })); vi.advanceTimersByTime(100); });
    expect(r.log.filter((l) => l === "clear").length).toBeGreaterThan(0);
    expect(screen.getByText(/Tap the picture to line it up again/)).toBeTruthy();
    fireEvent.click(document.querySelector("canvas")!);
    expect(isFaceDown({ beta: 160, gamma: 0 })).toBe(true);
    expect(isFaceDown({ beta: 20, gamma: -170 })).toBe(true);
    expect(isFaceDown({ beta: 20, gamma: 10 })).toBe(false);
    expect(isFaceDown(null)).toBe(false);
    r.restore();
  });
  it("turns off again, and shows nothing of the game before there are views", async () => {
    const r = recorder();
    render(<SpiritLens game={game({ priv: null })} me={1} reducedMotion={false} sensors={false} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Turn on the lens" })); });
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("The lens shows nothing yet.");
    fireEvent.click(screen.getByRole("button", { name: "Turn off the lens" }));
    expect(document.querySelector("canvas")).toBeNull();
    r.restore();
  });
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Scene } from "three";
import { placeClues, type SpiritClue } from "@hauntology/shared/puzzles/clues";
import { RING_MIN_FRAME_MS, RING_MS, RING_MS_ASSIST } from "@hauntology/shared/puzzles/ring";
import type { OrientationSource } from "../../table/orientation";
import type { TableRenderer } from "../../table/renderer";
import { forwardOf, orientationQuat, type Orientation } from "../../table/view";
import { viewOfDirection } from "@hauntology/shared/puzzles/ring";
import { clueAngle } from "@hauntology/shared/puzzles/read";
import { ClueRing, type ClueRingProps } from "./ClueRing";
import { createRingScene, formMark, hangClueRing } from "./ringScene";

// ---- fakes: the frame loop, the sensor, the renderer
let queue: Array<(t: number) => void> = [];
let now = 0;
beforeEach(() => {
  queue = []; now = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => { queue.push(cb); return queue.length; });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  vi.spyOn(performance, "now").mockImplementation(() => now);
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  HTMLMediaElement.prototype.play = () => Promise.resolve();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
/** Run frames of `stepMs` for `ms` of fake time. */
function run(ms: number, stepMs = 16): void {
  for (let t = 0; t < ms; t += stepMs) { now += stepMs; const cbs = queue; queue = []; act(() => { for (const cb of cbs) cb(now); }); }
}
function fakeSensor(): OrientationSource & { emit: (o: Orientation) => void } {
  const ls = new Set<(o: Orientation) => void>();
  return { available: true, async enable() { return true; }, disable() { /* nothing */ }, subscribe(l) { ls.add(l); return () => { ls.delete(l); }; }, emit(o) { for (const l of ls) l(o); } };
}
function fakeRenderer(): { factory: () => TableRenderer; renders: number; disposed: number; scenes: Scene[] } {
  const r = { renders: 0, disposed: 0, scenes: [] as Scene[], factory: () => ({ render: (s: Scene) => { r.renders += 1; r.scenes.push(s); }, resize: () => undefined, dispose: () => { r.disposed += 1; } }) };
  return r;
}
/** The orientation that points the middle of the view at a clue (found by search, so the test needs no formula for the sensor's conventions). */
function aimAt(c: Pick<SpiritClue, "turn" | "height">): Orientation {
  let best: Orientation = { alpha: 0, beta: 90, gamma: 0 }; let bestGap = Infinity;
  for (let alpha = 0; alpha < 360; alpha += 1) for (let beta = 30; beta <= 150; beta += 3) {
    const q = orientationQuat({ alpha, beta, gamma: 0 }, 0)!;
    const gap = clueAngle(viewOfDirection(forwardOf(q)), c);
    if (gap < bestGap) { bestGap = gap; best = { alpha, beta, gamma: 0 }; }
  }
  expect(bestGap).toBeLessThan(0.06);
  return best;
}
/** An orientation that points at no clue at all (more than 20 degrees from every one), found by search. */
function aimAway(cs: readonly SpiritClue[]): Orientation {
  for (let alpha = 0; alpha < 360; alpha += 5) for (let beta = 30; beta <= 140; beta += 5) {
    const v = viewOfDirection(forwardOf(orientationQuat({ alpha, beta, gamma: 0 }, 0)!));
    if (cs.every((c) => clueAngle(v, c) > 0.35)) return { alpha, beta, gamma: 0 };
  }
  throw new Error("no empty direction");
}
const CODE = [4, 2, 7, 1];
const clues = placeClues(11, CODE);
const props = (over: Partial<ClueRingProps> = {}): ClueRingProps => ({ clues, onDone: () => undefined, reducedMotion: false, label: () => null, ...over });
const sr = () => [...document.querySelectorAll("ul[aria-label='Clues in the air'] li")].map((l) => l.textContent);

describe("ClueRing (puzzles 10.6, 10.8, Requirement 15)", () => {
  it("hangs every clue as 'not found yet' at first, with a text label for each, and says how many are read", () => {
    const fr = fakeRenderer();
    render(<ClueRing {...props({ createRenderer: fr.factory, orientation: fakeSensor() })} />);
    expect(sr()).toHaveLength(clues.length);
    expect(sr().every((t) => t!.endsWith("not found yet"))).toBe(true);
    expect(screen.getByTestId("cr-count").textContent).toContain(`0 of ${clues.length} clues read`);
    expect(document.body.textContent).not.toMatch(/Poltergeist/i);
  });
  it("reads a clue after 0.7 s of steady looking: one click buzz, one pulse, the text in the live region and the list", () => {
    const sensor = fakeSensor(), buzz = vi.fn(), seen: ReadonlySet<string>[] = [];
    const fr = fakeRenderer();
    render(<ClueRing {...props({ createRenderer: fr.factory, orientation: sensor, buzz, onRead: (s) => seen.push(s) })} />);
    const target = clues[0]!;
    sensor.emit(aimAt(target));
    run(600);
    expect(buzz).not.toHaveBeenCalled();
    run(300);
    expect(buzz).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("cr-said").textContent).toContain(target.text);
    expect(seen.at(-1)?.has(target.id)).toBe(true);
    expect(sr().filter((t) => !t!.endsWith("not found yet"))).toHaveLength(1);
    run(2000); // looking on reads nothing again and buzzes nothing more
    expect(buzz).toHaveBeenCalledTimes(1);
  });
  it("does not read a clue in a brief glance", () => {
    const sensor = fakeSensor(), buzz = vi.fn();
    render(<ClueRing {...props({ createRenderer: fakeRenderer().factory, orientation: sensor, buzz })} />);
    sensor.emit(aimAt(clues[1]!));
    run(400);
    sensor.emit(aimAway(clues)); // looks away
    run(2000);
    expect(buzz).not.toHaveBeenCalled();
  });
  it("draws at most 30 frames a second", () => {
    const fr = fakeRenderer();
    render(<ClueRing {...props({ createRenderer: fr.factory, orientation: fakeSensor() })} />);
    run(1000, 8); // 125 frames at 8 ms
    expect(fr.renders).toBeLessThanOrEqual(Math.floor(1000 / RING_MIN_FRAME_MS) + 1);
    expect(fr.renders).toBeGreaterThan(20);
  });
  it("pauses face down and when the page is hidden, and counts no time while paused", () => {
    const sensor = fakeSensor(), fr = fakeRenderer(), done = vi.fn();
    render(<ClueRing {...props({ createRenderer: fr.factory, orientation: sensor, onDone: done })} />);
    run(100);
    sensor.emit({ alpha: 0, beta: 180, gamma: 0 }); // face down
    const before = fr.renders;
    run(RING_MS + 5000);
    expect(fr.renders).toBe(before);
    expect(done).not.toHaveBeenCalled(); // a pocket does not run the Player out of time
    sensor.emit({ alpha: 0, beta: 90, gamma: 0 });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    run(2000);
    expect(fr.renders).toBe(before);
  });
  it("is still under reduced motion (the pulse is not run)", () => {
    const sensor = fakeSensor(), fr = fakeRenderer();
    const { container } = render(<ClueRing {...props({ createRenderer: fr.factory, orientation: sensor, reducedMotion: true })} />);
    expect(container.querySelector("[data-reduced]")!.getAttribute("data-reduced")).toBe("1");
    sensor.emit(aimAt(clues[0]!));
    run(1000);
    expect(screen.getByTestId("cr-said").textContent).toContain(clues[0]!.text); // reading still works, with no pulse
  });
  it("ends on Done, when every clue is read by looking, and after 30 s (45 with Assist); only once", () => {
    const sensor = fakeSensor(), done = vi.fn();
    const { unmount } = render(<ClueRing {...props({ createRenderer: fakeRenderer().factory, orientation: sensor, onDone: done })} />);
    fireEvent.click(screen.getByRole("button", { name: /Done/ }));
    expect(done).toHaveBeenCalledTimes(1);
    run(RING_MS + 100);
    expect(done).toHaveBeenCalledTimes(1);
    unmount();
    const timed = vi.fn();
    render(<ClueRing {...props({ createRenderer: fakeRenderer().factory, orientation: fakeSensor(), onDone: timed })} />);
    run(RING_MS - 500);
    expect(timed).not.toHaveBeenCalled();
    run(1000);
    expect(timed).toHaveBeenCalledTimes(1);
    cleanup();
    const slow = vi.fn();
    render(<ClueRing {...props({ createRenderer: fakeRenderer().factory, orientation: fakeSensor(), onDone: slow, assist: true })} />);
    run(RING_MS + 1000);
    expect(slow).not.toHaveBeenCalled();
    run(RING_MS_ASSIST - RING_MS);
    expect(slow).toHaveBeenCalledTimes(1);
  });
  it("reads every clue by looking at each in turn and then ends", () => {
    const sensor = fakeSensor(), done = vi.fn();
    render(<ClueRing {...props({ createRenderer: fakeRenderer().factory, orientation: sensor, onDone: done })} />);
    for (const c of clues) { sensor.emit(aimAt(c)); run(900); }
    expect(done).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("cr-count").textContent).toContain(`${clues.length} of ${clues.length}`);
  });
  it("Show all as text reads every clue at once, lists them, and waits for Done so the text can be read", () => {
    const done = vi.fn();
    render(<ClueRing {...props({ createRenderer: fakeRenderer().factory, orientation: fakeSensor(), onDone: done })} />);
    fireEvent.click(screen.getByRole("button", { name: "Clue list" }));
    fireEvent.click(screen.getByRole("button", { name: "Show all as text" }));
    run(500);
    for (const c of clues) expect(screen.getAllByText(c.text).length).toBeGreaterThan(0);
    expect(done).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(done).toHaveBeenCalledTimes(1);
  });
  it("shows an arrow towards the nearest unread clue after 3 s with nothing read, in words too, and hides it when the list opens", () => {
    render(<ClueRing {...props({ createRenderer: fakeRenderer().factory, orientation: fakeSensor() })} />);
    run(2500);
    expect(screen.queryByTestId("cr-arrow")).toBeNull();
    run(1000);
    expect(screen.getByTestId("cr-arrow")).toBeTruthy();
    expect(screen.getByTestId("cr-arrow-words").textContent).toMatch(/nearest unread clue is (to your right|to your left|above|below)/);
    fireEvent.click(screen.getByRole("button", { name: "Clue list" }));
    run(100);
    expect(screen.queryByTestId("cr-arrow")).toBeNull();
  });
  it("shows the list alone, with one line of why, when the phone cannot draw", () => {
    render(<ClueRing {...props({ createRenderer: () => null })} />);
    expect(screen.getByText(/cannot draw the ring/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Clues" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show all as text" })).toBeTruthy();
  });
  it("has the camera only from its own tap, with no audio, an indicator and a stop control, and carries on when it is refused", async () => {
    const calls: unknown[] = [];
    const track = { stopped: false, stop() { track.stopped = true; } };
    const media = { getUserMedia: async (c: MediaStreamConstraints | undefined) => { calls.push(c); return { getTracks: () => [track] } as unknown as MediaStream; } };
    render(<ClueRing {...props({ createRenderer: fakeRenderer().factory, media })} />);
    expect(calls).toHaveLength(0);
    expect(screen.queryByText("Camera on")).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Camera" })); await Promise.resolve(); });
    expect(calls).toEqual([{ video: { facingMode: "environment" }, audio: false }]);
    expect(screen.getByText("Camera on")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop camera" }));
    expect(track.stopped).toBe(true);
    expect(screen.queryByText("Camera on")).toBeNull();
    cleanup();
    render(<ClueRing {...props({ createRenderer: fakeRenderer().factory, media: { getUserMedia: async () => { throw new DOMException("no", "NotAllowedError"); } } })} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Camera" })); await Promise.resolve(); });
    expect(screen.getByText(/camera was not allowed/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done looking" })).toBeTruthy(); // carries on
  });
  it("stops the camera when the ring closes", async () => {
    const track = { stopped: false, stop() { track.stopped = true; } };
    const { unmount } = render(<ClueRing {...props({ createRenderer: fakeRenderer().factory, media: { getUserMedia: async () => ({ getTracks: () => [track] }) as unknown as MediaStream } })} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Camera" })); await Promise.resolve(); });
    unmount();
    expect(track.stopped).toBe(true);
  });
  it("takes the renderer down when it closes", () => {
    const fr = fakeRenderer();
    const { unmount } = render(<ClueRing {...props({ createRenderer: fr.factory })} />);
    unmount();
    expect(fr.disposed).toBe(1);
  });
  it("every control is 48 pixels in the CSS, and there is one solid yellow button", async () => {
    const css = (await import("./ClueRing.css?raw")).default;
    expect(css).toMatch(/\.cr-controls \.ui-button \{[^}]*min-height: 48px/);
    expect(css).toMatch(/\.cr-arrow \{[^}]*width: 48px; height: 48px/);
    render(<ClueRing {...props({ createRenderer: fakeRenderer().factory })} />);
    expect(document.querySelectorAll(".ui-button--primary")).toHaveLength(1);
  });
});

describe("the ring's scene (puzzles 10.6)", () => {
  it("makes at most 12 sprites, one for each clue, at the same distance, each with its form's mark", () => {
    const many: SpiritClue[] = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, form: (["code", "address", "phone", "date"] as const)[i % 4]!, text: "x", turn: (i * Math.PI) / 11, height: 0 }));
    const scene = createRingScene(many, () => null);
    expect(scene.group.children).toHaveLength(12);
    expect(new Set(scene.group.children.map((s) => Math.round(s.position.length() * 1000)))).toEqual(new Set([1500]));
    expect(new Set(scene.group.children.map((s) => (s.userData as { mark: string }).mark))).toEqual(new Set(["dots", "underline", "slant", "torn"]));
    scene.dispose();
  });
  it("tells the four forms apart by shape, not colour", () => {
    expect(["code", "address", "phone", "date"].map((f) => formMark(f as never))).toEqual(["dots", "underline", "slant", "torn"]);
  });
  it("labels every clue in words, not found yet then its text once read, and pulses only when not still", () => {
    const scene = createRingScene(clues, () => null);
    const c = clues[0]!;
    expect(scene.labels.get(c.id)).toMatch(/not found yet$/);
    scene.setRead(new Set([c.id]));
    expect(scene.labels.get(c.id)).toContain(c.text);
    const s = scene.group.children[0]!;
    const w0 = s.scale.x;
    scene.pulse(c.id, true); scene.update(100);
    expect(s.scale.x).toBe(w0);
    scene.pulse(c.id, false); scene.update(200);
    expect(s.scale.x).not.toBe(w0);
    scene.update(1000);
    scene.dispose();
  });
  it("hangs in the Spirit table's scene with the same camera and takes itself down", () => {
    const scene = new Scene();
    const camera = { position: { copy: vi.fn() } } as never;
    const take = hangClueRing(clues, () => new Set(), () => null)({ scene, camera: { ...(camera as object), position: new (scene.position.constructor as new () => typeof scene.position)() } as never });
    expect(scene.children).toHaveLength(1);
    take();
    expect(scene.children).toHaveLength(0);
  });
});

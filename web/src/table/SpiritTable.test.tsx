// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Group, PerspectiveCamera, Scene } from "three";
import type { TableData } from "@hauntology/shared/table/data";
import { MIN_FRAME_MS } from "@hauntology/shared/table/plan";
import { carryTarget } from "./carry";
import { buildModel } from "./model";
import type { OrientationSource } from "./orientation";
import { pickPiece, rayToBoard, worldRay } from "./picking";
import type { TableRenderer } from "./renderer";
import { SpiritTable, type FrameClock, type SpiritTableProps } from "./SpiritTable";
import { DEFAULT_ANCHOR, DEFAULT_FOV, dragQuat, orientationQuat, placeAt, START_VIEW } from "./view";

const zones = ["library", "study", "nursery", "kitchen", "hall", "cellar"];
const data: TableData = {
  rooms: zones.map((z, i) => ({ zone: z, name: z[0]!.toUpperCase() + z.slice(1), slot: i, coldSpot: z === "nursery", inspected: false })),
  pawns: [{ seat: 0, nickname: "Ada", zone: "hall", active: true, mono: false }],
  suspects: ["cora", "vane", "pike", "thorne", "percy", "dunmore"].map((c, i) => ({ card: c, name: ["Cora Bell", "Lady Vane", "Dr. Pike", "Thorne", "Percy", "Dunmore"][i]! })),
  relics: ["a", "b"].map((c) => ({ card: c, name: `Relic ${c}` })),
  haunt: { level: 2, max: 6 },
};

type Rig = { renders: number; lastScene: Scene | null; lastCamera: PerspectiveCamera | null; disposed: number; resized: number };
function rig() {
  const r: Rig = { renders: 0, lastScene: null, lastCamera: null, disposed: 0, resized: 0 };
  const renderer: TableRenderer = { render: (s, c) => { r.renders++; r.lastScene = s; r.lastCamera = c; }, resize: () => { r.resized++; }, dispose: () => { r.disposed++; } };
  let t = 0; let pending: Array<(n: number) => void> = []; let ids = 0;
  const clock: FrameClock = { request: (cb) => { pending.push(cb); return ++ids; }, cancel: () => { pending = []; }, now: () => t };
  /** Run frames every `step` ms for `ms` ms. */
  const advance = (ms: number, step = 10): void => { act(() => { for (let spent = 0; spent < ms; spent += step) { t += step; const cbs = pending; pending = []; for (const cb of cbs) cb(t); } }); };
  const orientation = (() => {
    let on = false; const ls = new Set<(o: { alpha: number | null; beta: number | null; gamma: number | null }) => void>();
    const src: OrientationSource & { emit: (o: { alpha: number; beta: number; gamma: number }) => void; enabled: () => boolean; asked: number } = {
      available: true, asked: 0,
      async enable() { src.asked++; on = true; return true; }, disable() { on = false; },
      subscribe(l) { ls.add(l); return () => { ls.delete(l); }; },
      emit(o) { for (const l of ls) l(o); }, enabled: () => on,
    };
    return src;
  })();
  return { r, renderer, clock, advance, orientation };
}

const props = (h: ReturnType<typeof rig>, over: Partial<SpiritTableProps> = {}): SpiritTableProps => ({
  data, roomCode: "AB12", theory: {}, onTheory: () => undefined, reducedMotion: false, orientation: h.orientation,
  createRenderer: () => h.renderer, frame: h.clock, buzz: () => undefined, screenAngle: () => 0, media: null, ...over,
});

class FakePointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
}
beforeEach(() => {
  // jsdom has no PointerEvent: without one the finger's position would be lost
  (window as unknown as { PointerEvent: unknown }).PointerEvent = FakePointerEvent;
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"]; // jsdom has no 2D canvas: the textures fall back to flat colour
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  // a stage the size of a phone, since jsdom has no layout
  Element.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 390, height: 700, right: 390, bottom: 700, x: 0, y: 0, toJSON: () => ({}) } as DOMRect; };
});
afterEach(() => { cleanup(); });

const canvasOf = (): HTMLCanvasElement => document.querySelector("canvas.st-canvas") as HTMLCanvasElement;
const anchorGroup = (s: Scene): Group => s.children.find((c) => c.type === "Group" && c.scale.x > 0 && c.scale.x < 1) as Group;

/** The pixel where the ray hits a given Suspect, for the default view and anchor (the same maths the Table uses, run backwards by a scan). */
function pixelOn(suspect: string): { x: number; y: number } {
  const m = buildModel({ data, roomCode: "AB12", theory: {}, tMs: 0, reducedMotion: false });
  const q = dragQuat(START_VIEW);
  for (let y = 0; y < 700; y += 3) for (let x = 0; x < 390; x += 3) {
    const ray = worldRay(q, { vertical: DEFAULT_FOV.vertical, aspect: 390 / 700 }, (x / 390) * 2 - 1, -((y / 700) * 2 - 1));
    if (ray && pickPiece(m, rayToBoard(DEFAULT_ANCHOR, ray), ["suspect"]) === `suspect:${suspect}`) return { x, y };
  }
  throw new Error(`no pixel on ${suspect}`);
}

/** The pixel where the finger's ray, cut at head height, puts the feet over a room: not the same pixel as the floor of that room (the feet are in front of the finger). */
const fingerFor = (zone: string): { x: number; y: number } => {
  const m = buildModel({ data, roomCode: "AB12", theory: {}, tMs: 0, reducedMotion: false });
  const q = dragQuat(START_VIEW);
  for (let y = 0; y < 700; y += 3) for (let x = 0; x < 390; x += 3) {
    const ray = worldRay(q, { vertical: DEFAULT_FOV.vertical, aspect: 390 / 700 }, (x / 390) * 2 - 1, -((y / 700) * 2 - 1));
    if (ray && carryTarget(m, rayToBoard(DEFAULT_ANCHOR, ray))?.room?.zone === zone) return { x, y };
  }
  throw new Error(`no finger position for ${zone}`);
};

describe("SpiritTable: the drawing and its limits", () => {
  it("draws at most 30 frames a second, and not at all when the page is hidden", () => {
    const h = rig();
    render(<SpiritTable {...props(h)} />);
    h.advance(1000, 5);
    expect(h.r.renders).toBeGreaterThan(10);
    expect(h.r.renders).toBeLessThanOrEqual(Math.floor(1000 / MIN_FRAME_MS) + 1);
    const before = h.r.renders;
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    h.advance(500, 5);
    expect(h.r.renders).toBe(before);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    h.advance(200, 5);
    expect(h.r.renders).toBeGreaterThan(before);
  });

  it("pauses when the phone is face down and goes on when it is turned over", async () => {
    const h = rig();
    render(<SpiritTable {...props(h)} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Tilt/ })); });
    h.advance(100, 5);
    act(() => h.orientation.emit({ alpha: 0, beta: 179, gamma: 0 }));
    h.advance(100, 5);
    const down = h.r.renders;
    h.advance(300, 5);
    expect(h.r.renders).toBe(down);
    act(() => h.orientation.emit({ alpha: 0, beta: 80, gamma: 0 }));
    h.advance(200, 5);
    expect(h.r.renders).toBeGreaterThan(down);
  });

  it("is still under reduced motion: the Whisper does not drift between frames", () => {
    const h = rig();
    const clean = { ...data, rooms: data.rooms.map((r) => ({ ...r, coldSpot: false })) };
    render(<SpiritTable {...props(h, { data: clean, reducedMotion: true })} />);
    h.advance(100, 5);
    const w = (): string => { const g = anchorGroup(h.r.lastScene!); return JSON.stringify(g.children.filter((c) => c.type === "Group").map((c) => [c.position.x, c.position.y, c.position.z])); };
    const a = w();
    h.advance(20000, 100);
    expect(w()).toBe(a);
  });

  it("throws the scene and the renderer away when the Table closes", () => {
    const h = rig();
    const { unmount } = render(<SpiritTable {...props(h)} />);
    h.advance(50);
    unmount();
    expect(h.r.disposed).toBe(1);
  });
});

describe("SpiritTable: no WebGL", () => {
  it("shows only the Table list, with one line of why", () => {
    const h = rig();
    render(<SpiritTable {...props(h, { createRenderer: () => null })} />);
    expect(screen.getByRole("status").textContent).toContain("cannot draw the table");
    expect(screen.getByText("Rooms")).toBeTruthy();
    expect(document.querySelector("canvas")).toBeNull();
  });
  it("does the same when the browser has no WebGL at all (jsdom has none)", () => {
    const h = rig();
    const { createRenderer: _omit, ...rest } = props(h);
    void _omit;
    render(<SpiritTable {...rest} />);
    expect(screen.getByText(/cannot draw the table/)).toBeTruthy();
    expect(screen.getByLabelText("Cora Bell")).toBeTruthy(); // the room choice per Suspect is in the list
  });
});

describe("SpiritTable: place, tilt and the drag view", () => {
  it("Place reads the way the phone points at the tap, and puts the Table along it, facing the Player", async () => {
    const h = rig();
    render(<SpiritTable {...props(h)} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Tilt/ })); });
    const reading = { alpha: 140, beta: 72, gamma: 0 };
    act(() => h.orientation.emit(reading));
    h.advance(50);
    act(() => { fireEvent.click(screen.getByRole("button", { name: /Place/ })); });
    h.advance(60);
    const expected = placeAt(orientationQuat(reading)!, DEFAULT_ANCHOR.heading);
    const g = anchorGroup(h.r.lastScene!);
    expect(g.position.x).toBeCloseTo(expected.x, 6);
    expect(g.position.y).toBeCloseTo(expected.y, 6);
    expect(g.position.z).toBeCloseTo(expected.z, 6);
    expect(g.rotation.y).toBeCloseTo(expected.facing, 6);
    expect(expected.y).toBeLessThanOrEqual(-0.28 + 1e-9);
    // a second Place puts it where the view now points
    const second = { alpha: 300, beta: 70, gamma: 0 };
    act(() => h.orientation.emit(second));
    h.advance(50);
    act(() => { fireEvent.click(screen.getByRole("button", { name: /Place/ })); });
    h.advance(60);
    const e2 = placeAt(orientationQuat(second)!, expected.heading);
    expect(anchorGroup(h.r.lastScene!).position.x).toBeCloseTo(e2.x, 6);
  });

  it("asks for motion only from the Tilt tap, says once that it can drift, and does not say it again", async () => {
    const h = rig();
    render(<SpiritTable {...props(h)} />);
    expect(h.orientation.asked).toBe(0);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Tilt/ })); });
    expect(h.orientation.asked).toBe(1);
    expect(screen.getByRole("status").textContent).toContain("Tilt can drift");
    expect(screen.getByRole("status").textContent).toContain("Place");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Tilt/ })); });
    expect(h.orientation.enabled()).toBe(false);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Tilt/ })); });
    expect(screen.getByRole("status").textContent).not.toContain("drift");
  });

  it("falls back to dragging when motion is not allowed, with no error", async () => {
    const h = rig();
    h.orientation.enable = async () => false;
    render(<SpiritTable {...props(h)} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Tilt/ })); });
    expect(screen.getByRole("status").textContent).toContain("Drag to turn the view");
    expect((screen.getByRole("button", { name: /Tilt/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("turns the view by dragging where there is no sensor, and shows the 'board' arrow after 2 seconds out of view", () => {
    const h = rig();
    render(<SpiritTable {...props(h, { orientation: null })} />);
    expect((screen.getByRole("button", { name: /Tilt/ }) as HTMLButtonElement).disabled).toBe(true);
    h.advance(100);
    const c = canvasOf();
    const q0 = JSON.stringify(h.r.lastCamera!.quaternion.toArray());
    act(() => { fireEvent.pointerDown(c, { clientX: 20, clientY: 20, pointerId: 1 }); fireEvent.pointerMove(c, { clientX: 20 + 400, clientY: 20, pointerId: 1 }); fireEvent.pointerUp(c, { clientX: 420, clientY: 20, pointerId: 1 }); });
    h.advance(100);
    expect(JSON.stringify(h.r.lastCamera!.quaternion.toArray())).not.toBe(q0);
    expect(screen.queryByText("board")).toBeNull();
    h.advance(2100);
    expect(screen.getByText("board")).toBeTruthy();
    // Place brings it back at once
    act(() => { fireEvent.click(screen.getByRole("button", { name: /Place/ })); });
    expect(screen.queryByText("board")).toBeNull();
  });
});

describe("SpiritTable: tapping and the card", () => {
  it("picks the Suspect under the finger and names it on a card; Close puts it away", () => {
    const h = rig();
    render(<SpiritTable {...props(h)} />);
    h.advance(50);
    const p = pixelOn("pike");
    const c = canvasOf();
    act(() => { fireEvent.pointerDown(c, { clientX: p.x, clientY: p.y, pointerId: 1 }); fireEvent.pointerUp(c, { clientX: p.x, clientY: p.y, pointerId: 1 }); });
    expect(screen.getByRole("heading", { name: "Dr. Pike" })).toBeTruthy();
    expect(screen.getByRole("dialog").textContent).toContain("No mark");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the list in one tap, and a row there opens its card on the Table", () => {
    const h = rig();
    render(<SpiritTable {...props(h)} />);
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByText("Suspects")).toBeTruthy();
    const row = document.querySelector('[data-piece="relic:b"] button') as HTMLButtonElement;
    fireEvent.click(row);
    expect(screen.getByRole("heading", { name: "Relic b" })).toBeTruthy();
  });
});

describe("SpiritTable: drag to mark", () => {
  it("carries a Suspect onto a room, and the drop makes the Player's own Theory mark, with a buzz and words on the card", () => {
    const h = rig(); const onTheory = vi.fn(); const buzz = vi.fn();
    render(<SpiritTable {...props(h, { onTheory, buzz })} />);
    h.advance(50);
    const from = pixelOn("vane"), to = fingerFor("kitchen");
    const c = canvasOf();
    act(() => {
      fireEvent.pointerDown(c, { clientX: from.x, clientY: from.y, pointerId: 1 });
      fireEvent.pointerMove(c, { clientX: from.x + 4, clientY: from.y, pointerId: 1 }); // under 8 pixels: not yet
    });
    expect(buzz).not.toHaveBeenCalled();
    act(() => { fireEvent.pointerMove(c, { clientX: from.x + 30, clientY: from.y - 20, pointerId: 1 }); });
    expect(buzz).toHaveBeenCalledWith(15);
    act(() => { fireEvent.pointerMove(c, { clientX: to.x, clientY: to.y, pointerId: 1 }); });
    h.advance(300);
    act(() => { fireEvent.pointerUp(c, { clientX: to.x, clientY: to.y, pointerId: 1 }); });
    expect(onTheory).toHaveBeenCalledTimes(1);
    const next = onTheory.mock.calls[0]![0] as Record<string, string>;
    expect(Object.keys(next)).toEqual(["vane"]);
    expect(next.vane).toBe("kitchen");
    expect(screen.getByRole("status").textContent).toContain("maybe here");
  });

  it("takes the mark back when let go off the rooms, changing nothing else", () => {
    const h = rig(); const onTheory = vi.fn();
    render(<SpiritTable {...props(h, { onTheory, theory: { vane: "hall", cora: "study" } })} />);
    h.advance(50);
    const c = canvasOf();
    // the line-up no longer holds Vane (she is in the hall): find her where the model puts her
    const m = buildModel({ data, roomCode: "AB12", theory: { vane: "hall", cora: "study" }, tMs: 0, reducedMotion: false });
    expect(m.suspects.find((s) => s.card === "vane")!.zone).toBe("hall");
    let from: { x: number; y: number } | null = null;
    for (let y = 0; y < 700 && !from; y += 3) for (let x = 0; x < 390 && !from; x += 3) {
      const ray = worldRay(dragQuat(START_VIEW), { vertical: DEFAULT_FOV.vertical, aspect: 390 / 700 }, (x / 390) * 2 - 1, -((y / 700) * 2 - 1));
      if (ray && pickPiece(m, rayToBoard(DEFAULT_ANCHOR, ray), ["suspect"]) === "suspect:vane") from = { x, y };
    }
    expect(from).not.toBeNull();
    act(() => {
      fireEvent.pointerDown(c, { clientX: from!.x, clientY: from!.y, pointerId: 1 });
      fireEvent.pointerMove(c, { clientX: from!.x + 40, clientY: from!.y + 5, pointerId: 1 });
      fireEvent.pointerMove(c, { clientX: 389, clientY: 2, pointerId: 1 }); // off the rooms
      fireEvent.pointerUp(c, { clientX: 389, clientY: 2, pointerId: 1 });
    });
    expect(onTheory).toHaveBeenCalledWith({ cora: "study" });
    expect(screen.getByRole("status").textContent).toContain("Back in the line-up");
  });

  it("does not turn the view while a Suspect is carried", () => {
    const h = rig();
    render(<SpiritTable {...props(h, { orientation: null })} />);
    h.advance(50);
    const q0 = JSON.stringify(h.r.lastCamera!.quaternion.toArray());
    const p = pixelOn("cora"), c = canvasOf();
    act(() => {
      fireEvent.pointerDown(c, { clientX: p.x, clientY: p.y, pointerId: 1 });
      fireEvent.pointerMove(c, { clientX: p.x + 100, clientY: p.y - 90, pointerId: 1 });
      fireEvent.pointerMove(c, { clientX: p.x + 150, clientY: p.y - 120, pointerId: 1 });
    });
    h.advance(100);
    expect(JSON.stringify(h.r.lastCamera!.quaternion.toArray())).toBe(q0);
    act(() => { fireEvent.pointerCancel(c, { pointerId: 1 }); });
  });
});

describe("SpiritTable: camera and clues", () => {
  it("is off until tapped, then shows the camera under the canvas with an indicator and a stop control", async () => {
    const h = rig();
    const stopped = { v: false };
    const media = { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stopped.v = true; } }] }) as unknown as MediaStream };
    render(<SpiritTable {...props(h, { media })} />);
    const video = document.querySelector("video.st-video") as HTMLVideoElement;
    expect(video.hidden).toBe(true);
    expect(screen.queryByText("Camera on")).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Camera/ })); });
    expect(video.hidden).toBe(false);
    expect(screen.getByText("Camera on")).toBeTruthy();
    // the video sits before the canvas, so the canvas is over it
    expect(video.compareDocumentPosition(canvasOf()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop camera" }));
    expect(stopped.v).toBe(true);
    expect(video.hidden).toBe(true);
  });

  it("says one line and keeps the stand-in when the camera is refused", async () => {
    const h = rig();
    render(<SpiritTable {...props(h, { media: { getUserMedia: async () => { throw new DOMException("no", "NotAllowedError"); } } })} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Camera/ })); });
    expect(screen.getByRole("status").textContent).toMatch(/not allowed/);
    expect(document.querySelector("canvas")).not.toBeNull();
  });

  it("shows the count of read clues on the Clues control", () => {
    const h = rig(); const onClues = vi.fn();
    render(<SpiritTable {...props(h, { clueCount: 3, onClues })} />);
    fireEvent.click(screen.getByRole("button", { name: "Clues, 3 read" }));
    expect(onClues).toHaveBeenCalled();
  });
});

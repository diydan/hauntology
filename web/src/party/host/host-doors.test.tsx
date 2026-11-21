// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOOR_ID_PATTERN } from "@hauntology/shared/party/doors";
import { ShellToViewerSchema, type ShellToViewer } from "@hauntology/shared/app/events";
import { soundAvailability } from "@hauntology/shared/party/sounds";
import { game, pub } from "../../test/party-fixtures";
import { IDLE_HOST } from "../phone/host-port";
import { EMPTY_HOST, type HostView } from "./host-view";
import { viewerMessages } from "./host-viewer";
import { HostPage, type HostExtras } from "./HostPage";

afterEach(cleanup);
const door = (over: Record<string, unknown> = {}) => ({ id: "cellar-door", at: { x: 2, z: -3 }, width: 1.2, a: "z1", b: "z2", lock: "knock", open: false, need: 0, have: 0, ...over });
const host = (doors: unknown[]): HostView => ({ ...EMPTY_HOST, game: game({ pub: pub({ doors }) }) });
const sent = (h: HostView, last: { sky: string | null; doors?: string }, zones?: Record<string, { x: number; z: number }>) => viewerMessages(h, { ...last } as never, zones).filter((m) => m.t === "set_doors");

describe("the Host sends the doors to the Viewer (knock-door 8.1, Requirement 9.1)", () => {
  it("sends each door's place, width, wall angle and state once per change, and never its lock or a pattern", () => {
    const last: { sky: string | null; doors?: string } = { sky: null };
    const first = viewerMessages(host([door()]), last);
    const m = first.find((x) => x.t === "set_doors") as Extract<ShellToViewer, { t: "set_doors" }>;
    expect(m.doors).toEqual([{ id: "cellar-door", x: 2, z: -3, width: 1.2, yaw: 0, open: false }]);
    expect(Object.keys(m.doors[0]!).sort()).toEqual(["id", "open", "width", "x", "yaw", "z"]); // no lock, no knock, no need or have
    expect(ShellToViewerSchema.safeParse(m).success).toBe(true);
    expect(viewerMessages(host([door()]), last).filter((x) => x.t === "set_doors")).toEqual([]); // the same doors again: nothing
    const open = viewerMessages(host([door({ open: true })]), last).find((x) => x.t === "set_doors") as Extract<ShellToViewer, { t: "set_doors" }>;
    expect(open.doors[0]!.open).toBe(true);
  });
  it("sends nothing for a world with no doors, and an empty list only to clear doors it was told about", () => {
    const last: { sky: string | null; doors?: string } = { sky: null };
    expect(viewerMessages(host([]), last).filter((x) => x.t === "set_doors")).toEqual([]);
    expect(viewerMessages(EMPTY_HOST, last).filter((x) => x.t === "set_doors")).toEqual([]);
    viewerMessages(host([door()]), last);
    expect(viewerMessages(host([]), last).filter((x) => x.t === "set_doors")).toEqual([{ t: "set_doors", doors: [] }]);
  });
  it("turns each wall square to the way between its two Zones when their places are known", () => {
    const m = sent(host([door({ a: "z1", b: "z2" })]), { sky: null }, { z1: { x: 0, z: 0 }, z2: { x: 4, z: 0 } })[0] as Extract<ShellToViewer, { t: "set_doors" }>;
    expect(Math.abs(m.doors[0]!.yaw)).toBeCloseTo(Math.PI / 2, 6); // the way runs along x, so the wall runs along z
  });
  it("Property: whatever the doors, every message passes the shell contract and carries nothing but the six fields", () => {
    const d = fc.record({ id: fc.stringMatching(DOOR_ID_PATTERN), at: fc.record({ x: fc.double({ min: -50, max: 50, noNaN: true }), z: fc.double({ min: -50, max: 50, noNaN: true }) }), width: fc.double({ min: 0.5, max: 3, noNaN: true }), a: fc.constant("z1"), b: fc.constant("z2"), lock: fc.constantFrom("knock", "heavy"), open: fc.boolean(), need: fc.integer({ min: 0, max: 4 }), have: fc.integer({ min: 0, max: 4 }) });
    fc.assert(fc.property(fc.array(d, { minLength: 1, maxLength: 3 }), (doors) => {
      for (const m of viewerMessages(host(doors), { sky: null })) {
        expect(ShellToViewerSchema.safeParse(m).success).toBe(true);
        if (m.t === "set_doors") for (const x of m.doors) expect(Object.keys(x).sort()).toEqual(["id", "open", "width", "x", "yaw", "z"]);
      }
    }), { numRuns: 40 });
  });
});

describe("HostPage tells the mounted Viewer when a door changes", () => {
  class FakePort {
    state = IDLE_HOST;
    listeners = new Set<() => void>();
    getState() { return this.state; }
    subscribe(l: () => void) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
    set(patch: Partial<typeof IDLE_HOST>) { this.state = { ...this.state, ...patch }; act(() => { for (const l of [...this.listeners]) l(); }); }
  }
  it("sends set_doors when a door shuts and when it opens, and not for an unchanged redraw", async () => {
    const messages: ShellToViewer[] = [];
    const extras: HostExtras = {
      origin: "https://lab.example", narration: null, reducedMotion: false, now: () => 0,
      soundDeps: { play: () => undefined, vibrate: () => undefined, available: soundAvailability([]), canVibrate: false, reducedMotion: false, now: () => 0, setTimer: () => 0, clearTimer: () => undefined },
      mountViewer: async () => ({ send: (m: ShellToViewer) => void messages.push(m), dispose: async () => undefined }),
    };
    const port = new FakePort();
    port.state = { ...IDLE_HOST, connection: "online", code: "K7M2", view: host([door({ open: false })]) };
    render(<HostPage port={port as never} extras={extras} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const doorMessages = () => messages.filter((m) => m.t === "set_doors") as Extract<ShellToViewer, { t: "set_doors" }>[];
    // the door that stood shut before the Viewer was there is told as soon as it is
    expect(doorMessages().map((m) => m.doors[0]?.open)).toEqual([false]);
    port.set({ view: host([door({ open: true })]) });
    await act(async () => { await Promise.resolve(); });
    expect(doorMessages().map((m) => m.doors[0]?.open)).toEqual([false, true]);
    port.set({ view: host([door({ open: true })]) }); // an unchanged redraw says nothing
    expect(doorMessages()).toHaveLength(2);
    port.set({ view: host([door({ open: false })]) }); // shut again (a Slam)
    expect(doorMessages().map((m) => m.doors[0]?.open)).toEqual([false, true, false]);
  });
  it("turns the wall by the Zone places the page was given", async () => {
    const messages: ShellToViewer[] = [];
    const extras: HostExtras = {
      origin: "https://lab.example", narration: null, reducedMotion: false, now: () => 0,
      soundDeps: { play: () => undefined, vibrate: () => undefined, available: soundAvailability([]), canVibrate: false, reducedMotion: false, now: () => 0, setTimer: () => 0, clearTimer: () => undefined },
      mountViewer: async () => ({ send: (m: ShellToViewer) => void messages.push(m), dispose: async () => undefined }),
      zonePlaces: { z1: { x: 0, z: 0 }, z2: { x: 4, z: 0 } },
    };
    const port = new FakePort();
    port.state = { ...IDLE_HOST, connection: "online", code: "K7M2", view: host([door()]) };
    render(<HostPage port={port as never} extras={extras} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const m = messages.find((x) => x.t === "set_doors") as Extract<ShellToViewer, { t: "set_doors" }>;
    expect(Math.abs(m.doors[0]!.yaw)).toBeCloseTo(Math.PI / 2, 6);
    port.set({ view: host([door({ open: true })]) }); // a change after the Viewer is mounted keeps the same angle
    const later = messages.filter((x) => x.t === "set_doors").at(-1) as Extract<ShellToViewer, { t: "set_doors" }>;
    expect(later.doors[0]!.open).toBe(true);
    expect(Math.abs(later.doors[0]!.yaw)).toBeCloseTo(Math.PI / 2, 6);
  });
});

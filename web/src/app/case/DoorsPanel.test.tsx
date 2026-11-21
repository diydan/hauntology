// @vitest-environment jsdom
import { createEngine, privateSnapshot, publicSnapshot, step, type EngineSeat, type EngineState, type PublicSnapshot } from "@hauntology/shared/party/engine";
import type { DoorSetup } from "@hauntology/shared/party/doors";
import { PRESET_GHOST_IDS } from "@hauntology/shared/party/preset-ghosts";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DoorsPanel, KnockPad } from "./DoorsPanel";
import { SoloTable } from "./host";
import { EMPTY_DOOR_FEED, openRoom, type DoorFeed, type RoomClient, type RoomSnapshot, type SocketLike } from "./room-client";
import { doorLine, doorResultLine, doorStatus, knockLine, knockMarks, namesOf } from "./words";

afterEach(() => { cleanup(); vi.useRealTimers(); });

const seats: EngineSeat[] = [1, 2, 3].map((seat) => ({ seat, nickname: seat === 1 ? "You" : `Bot${seat}`, bot: seat === 3, botLevel: "standard" as const }));
const SEED = 7;
const zoneIds = createEngine({ seed: SEED, seats, settings: { baseSeconds: 60, hauntMax: 10, puzzles: "medium" }, presetIds: PRESET_GHOST_IDS }).pool.zones.map((z) => z.id) as [string, string, string, string, string, string];
const setup: DoorSetup = {
  home: zoneIds[0], passages: [[zoneIds[2], zoneIds[3]], [zoneIds[3], zoneIds[4]], [zoneIds[4], zoneIds[5]]],
  doors: [
    { id: "cellar-door", at: { x: 1, z: 1 }, width: 1.2, a: zoneIds[0], b: zoneIds[1], lock: "knock" },
    { id: "iron-door", at: { x: 3, z: 1 }, width: 1.4, a: zoneIds[1], b: zoneIds[2], lock: "heavy", need: 2 },
  ],
};

/** The game at the start of seat 1's Turn, with the doors shut. */
function game(): { s: EngineState; now: number } {
  let s = createEngine({ seed: SEED, seats, settings: { baseSeconds: 60, hauntMax: 10, puzzles: "medium" }, presetIds: PRESET_GHOST_IDS, doors: setup });
  let r = step(s, { kind: "client", seat: 1, msg: { t: "start" } }, 0);
  s = r.state;
  let now = 0;
  for (let k = 0; k < 300 && s.turn?.seat !== 1; k++) { now = r.wakeAtMs ?? now + 1000; r = step(s, { kind: "alarm" }, now); s = r.state; }
  return { s, now };
}

function fakeClient(view: PublicSnapshot, priv: ReturnType<typeof privateSnapshot>, doors: DoorFeed = EMPTY_DOOR_FEED) {
  const sent: Record<string, unknown>[] = [];
  let snap: RoomSnapshot = { status: "playing", code: "ABCD", seat: 1, public: view, private: priv, refused: null, doors };
  const ls = new Set<() => void>();
  const client: RoomClient = { getSnapshot: () => snap, subscribe: (l) => { ls.add(l); return () => void ls.delete(l); }, send: (m) => void sent.push(m), close: () => {} };
  const set = (p: Partial<RoomSnapshot>) => { snap = { ...snap, ...p }; for (const l of ls) l(); };
  return { client, sent, set, snap: () => snap };
}

const names = (v: PublicSnapshot) => namesOf(v, 1);

describe("the doors on the solo table (knock-door 2.4, 4.4, 7.2, 7.3)", () => {
  it("shows nothing when the world has no doors", () => {
    const { s, now } = game();
    const none = { ...publicSnapshot(s, now), doors: [], closedZones: [], tvKnock: null };
    const f = fakeClient(none, privateSnapshot(s, 1));
    render(<DoorsPanel client={f.client} snap={f.snap()} view={none} n={names(none)} reducedMotion={false} />);
    expect(screen.queryByLabelText("Doors")).toBeNull();
  });

  it("says each door in words, shut or open, with how it opens and a heavy door's count", () => {
    const { s, now } = game();
    const v = publicSnapshot(s, now);
    const f = fakeClient(v, privateSnapshot(s, 1));
    render(<DoorsPanel client={f.client} snap={f.snap()} view={v} n={names(v)} reducedMotion={false} />);
    const items = within(screen.getByLabelText("Doors")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("is shut; it opens to the ghost's knock.");
    expect(items[1]!.textContent).toContain("needs 2 Players to push together.");
    expect(items[0]!.getAttribute("data-open")).toBe("false");
    expect(doorStatus({ ...v.doors[1]!, have: 1 }, names(v))).toContain("(1 of 2 now)");
    expect(doorStatus({ ...v.doors[0]!, open: true }, names(v))).toContain("is open;");
  });

  it("a heavy door's Push sends one act, and the live line says how many are pushing", () => {
    const { s, now } = game();
    const v = publicSnapshot(s, now);
    const f = fakeClient(v, privateSnapshot(s, 1));
    const { rerender } = render(<DoorsPanel client={f.client} snap={f.snap()} view={v} n={names(v)} reducedMotion={false} />);
    fireEvent.click(screen.getByRole("button", { name: /^Push the door between/ }));
    expect(f.sent).toEqual([{ t: "doorAct", doorId: "iron-door" }]);
    const feed: DoorFeed = { ...EMPTY_DOOR_FEED, events: [{ n: 1, id: "iron-door", open: false, reason: "act", need: 2, have: 1 }] };
    rerender(<DoorsPanel client={f.client} snap={{ ...f.snap(), doors: feed }} view={v} n={names(v)} reducedMotion={false} />);
    expect(screen.getByTestId("door-live").textContent).toMatch(/^1 of 2 are pushing the door between the .+ and the .+\. 1 more to go\.$/);
  });

  it("says each kind of change in words, and never the pattern", () => {
    const { s, now } = game();
    const v = publicSnapshot(s, now);
    const n = names(v);
    const ev = (open: boolean, reason: "knock" | "together" | "timeout" | "slam" | "skip" | "act", have = 0, need = 0) => ({ n: 1, id: "cellar-door", open, reason, need, have });
    expect(doorLine(ev(true, "knock"), v.doors, n)).toMatch(/^The door between the .+ opens to the knock\.$/);
    expect(doorLine(ev(true, "together"), v.doors, n)).toContain("gives way");
    expect(doorLine(ev(true, "timeout"), v.doors, n)).toContain("creaks open by itself");
    expect(doorLine(ev(true, "skip"), v.doors, n)).toMatch(/ opens\.$/);
    expect(doorLine(ev(false, "slam"), v.doors, n)).toContain("slams shut");
    expect(doorLine({ ...ev(true, "knock"), id: "nope" }, v.doors, n)).toBe("A door opens to the knock.");
    expect(doorResultLine({ doorId: "x", outcome: "wrong", heard: "You knocked 2, 3.", triesLeft: 2 })).toBe("You knocked 2, 3. Not that one. 2 tries left.");
    expect(doorResultLine({ doorId: "x", outcome: "wrong", heard: "You knocked 1.", triesLeft: 1 })).toContain("1 try left");
    expect(doorResultLine({ doorId: "x", outcome: "failed", heard: "You knocked 1.", triesLeft: 0 })).toContain("by itself next round");
    expect(doorResultLine({ doorId: "x", outcome: "opened", heard: "You knocked 3, 2.", triesLeft: 3 })).toContain("The door opens.");
    expect(knockLine([3, 2], null)).toBe("3, pause, 2");
    expect(knockLine([2, 1, 3], 0)).toBe("2, long pause, 1, pause, 3");
    expect(knockMarks([3, 2])).toBe("● ● ●   ● ●");
  });

  it("the door glyph holds still with reduced motion", () => {
    const { s, now } = game();
    const v = publicSnapshot(s, now);
    const f = fakeClient(v, privateSnapshot(s, 1));
    render(<DoorsPanel client={f.client} snap={f.snap()} view={v} n={names(v)} reducedMotion />);
    for (const li of screen.getAllByRole("listitem")) expect(li.getAttribute("data-still")).toBe("true");
  });
});

describe("the knock door and the ghost's knock (knock-door 3.2, 3.3, 3.4, 3.5)", () => {
  it("offers Knock only on your Turn, beside the door, and sends the knocks from the pad", () => {
    const { s, now } = game();
    const there = step(s, { kind: "client", seat: 1, msg: { t: "walk", zone: zoneIds[0] } }, now + 10).state;
    const away = publicSnapshot(s, now);
    const fa = fakeClient(away, privateSnapshot(s, 1));
    const a = render(<DoorsPanel client={fa.client} snap={fa.snap()} view={away} n={names(away)} reducedMotion={false} />);
    expect(screen.queryByRole("button", { name: /^Knock on/ })).toBeNull();
    expect(screen.getByText("Go to a room beside it to knock.")).toBeTruthy();
    a.unmount();
    const v = publicSnapshot(there, now + 10);
    const f = fakeClient(v, privateSnapshot(there, 1));
    render(<DoorsPanel client={f.client} snap={f.snap()} view={v} n={names(v)} reducedMotion={false} />);
    fireEvent.click(screen.getByRole("button", { name: /^Knock on the door between/ }));
    const pad = screen.getByRole("button", { name: /tap once for each knock/ });
    fireEvent.click(pad);
    fireEvent.click(pad);
    expect(screen.getByRole("img", { name: "Knocked so far: 2" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0]).toMatchObject({ t: "doorKnock", doorId: "cellar-door" });
    expect((f.sent[0]!.times as number[]).length).toBe(2);
  });

  it("shows the ghost's knock this phone heard in words and marks, and Got it puts it away", () => {
    const { s, now } = game();
    const v = publicSnapshot(s, now);
    const feed: DoorFeed = { ...EMPTY_DOOR_FEED, heard: [{ doorId: "cellar-door", groups: [3, 2], long: null }] };
    const f = fakeClient(v, privateSnapshot(s, 1), feed);
    render(<DoorsPanel client={f.client} snap={f.snap()} view={v} n={names(v)} reducedMotion={false} />);
    const card = screen.getByRole("group", { name: "The ghost's knock you heard" });
    expect(card.textContent).toContain("3, pause, 2");
    fireEvent.click(within(card).getByRole("button", { name: "Got it" }));
    expect(f.sent).toEqual([{ t: "sightAck", sightId: "door-cellar-door" }]);
    expect(screen.queryByRole("group", { name: "The ghost's knock you heard" })).toBeNull();
  });

  it("shows what a try heard and what it means", () => {
    const { s, now } = game();
    const v = publicSnapshot(s, now);
    const feed: DoorFeed = { ...EMPTY_DOOR_FEED, result: { doorId: "cellar-door", outcome: "wrong", heard: "You knocked 2, 3.", triesLeft: 2 } };
    const f = fakeClient(v, privateSnapshot(s, 1), feed);
    render(<DoorsPanel client={f.client} snap={f.snap()} view={v} n={names(v)} reducedMotion={false} />);
    expect(screen.getByRole("status").textContent).toBe("You knocked 2, 3. Not that one. 2 tries left.");
  });
});

describe("the knock pad (knock-door 7.2)", () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it("sends the times from the first tap after a quiet moment, by itself", () => {
    const sent: number[][] = [];
    let t = 1000;
    render(<KnockPad label="Knock" quietMs={500} clock={() => t} onSend={(x) => sent.push(x)} />);
    const tap = screen.getByRole("button", { name: /tap once/ });
    for (const at of [1000, 1260, 1520, 2700]) { t = at; fireEvent.click(tap); }
    expect(sent).toEqual([]);
    act(() => { vi.advanceTimersByTime(499); });
    expect(sent).toEqual([]);
    act(() => { vi.advanceTimersByTime(2); });
    expect(sent).toEqual([[0, 260, 520, 1700]]);
    expect(screen.getByRole("img", { name: "No knocks yet" })).toBeTruthy();
  });

  it("sends nothing with no taps, and Done sends at once and clears its timer", () => {
    const sent: number[][] = [];
    render(<KnockPad label="Knock" clock={() => 5} onSend={(x) => sent.push(x)} />);
    const done = screen.getByRole("button", { name: "Done" }) as HTMLButtonElement;
    expect(done.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /tap once/ }));
    expect(done.disabled).toBe(false);
    fireEvent.click(done);
    expect(sent).toEqual([[0]]);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(sent).toEqual([[0]]);
  });

  it("stops its timer when it goes away", () => {
    const sent: number[][] = [];
    const r = render(<KnockPad label="Knock" quietMs={500} clock={() => 0} onSend={(x) => sent.push(x)} />);
    fireEvent.click(screen.getByRole("button", { name: /tap once/ }));
    r.unmount();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(sent).toEqual([]);
  });
});

describe("the knock at the TV after a Slam (knock-door 5.3)", () => {
  const withTv = (answeredBy: number | null): PublicSnapshot => {
    const { s, now } = game();
    return { ...publicSnapshot(s, now), tvKnock: { groups: [2, 3], long: null, answeredBy } };
  };

  it("shows the knock in words and marks, and sends a knock-back from the pad", () => {
    const v = withTv(null);
    const { s } = game();
    const f = fakeClient(v, privateSnapshot(s, 1));
    render(<DoorsPanel client={f.client} snap={f.snap()} view={v} n={names(v)} reducedMotion={false} />);
    const box = screen.getByRole("group", { name: "The ghost knocks at the TV" });
    expect(box.textContent).toContain("2, pause, 3");
    fireEvent.click(within(box).getByRole("button", { name: /tap once/ }));
    fireEvent.click(within(box).getByRole("button", { name: "Done" }));
    expect(f.sent).toEqual([{ t: "tvKnock", times: [expect.any(Number)] }]);
  });

  it("says who got the Help, and that it is you when it is", () => {
    const { s } = game();
    const other = withTv(2);
    const f = fakeClient(other, privateSnapshot(s, 1));
    const a = render(<DoorsPanel client={f.client} snap={f.snap()} view={other} n={names(other)} reducedMotion={false} />);
    expect(screen.getByRole("group", { name: "The ghost knocks at the TV" }).textContent).toContain("knocked it back first and gets a Help.");
    expect(screen.queryByRole("button", { name: /tap once/ })).toBeNull();
    a.unmount();
    const mine = withTv(1);
    const g = fakeClient(mine, privateSnapshot(s, 1));
    render(<DoorsPanel client={g.client} snap={g.snap()} view={mine} n={names(mine)} reducedMotion={false} />);
    expect(screen.getByRole("group", { name: "The ghost knocks at the TV" }).textContent).toContain("You knocked it back first. You get a Help: 10 more seconds on your next turn.");
  });

  it("says a wrong knock-back was heard and lets you try again", () => {
    const v = withTv(null);
    const { s } = game();
    const f = fakeClient(v, privateSnapshot(s, 1), { ...EMPTY_DOOR_FEED, tvResult: { outcome: "wrong", heard: "You knocked 1, 1." } });
    render(<DoorsPanel client={f.client} snap={f.snap()} view={v} n={names(v)} reducedMotion={false} />);
    expect(screen.getByText("You knocked 1, 1. Not that one. Try again.")).toBeTruthy();
  });
});

describe("the solo table with doors", () => {
  it("disables rooms behind a shut door and names why, and shows the door panel", () => {
    const { s, now } = game();
    const f = fakeClient(publicSnapshot(s, now), privateSnapshot(s, 1));
    render(<SoloTable client={f.client} />);
    const rooms = within(screen.getByRole("group", { name: "Rooms" }));
    const view = publicSnapshot(s, now);
    for (const id of view.closedZones) {
      const name = view.zones.find((z) => z.id === id)!.name;
      expect((rooms.getByRole("button", { name: new RegExp(`${name}`) }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect((rooms.getByRole("button", { name: view.zones.find((z) => z.id === zoneIds[0])!.name }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByLabelText("Doors")).toBeTruthy();
  });

  it("offers the Slam as a choice in words, and shows no door panel when the world has none", () => {
    const { s, now } = game();
    const base = publicSnapshot(s, now);
    const priv = { ...privateSnapshot(s, 1)!, choose: { options: ["restless", "slam"] as const, deadlineMs: now + 15_000 } };
    const f = fakeClient(base, priv as ReturnType<typeof privateSnapshot>);
    render(<SoloTable client={f.client} />);
    fireEvent.click(screen.getByRole("button", { name: "Slam a door" }));
    expect(f.sent.at(-1)).toEqual({ t: "choose", option: "slam" });
    cleanup();
    const none = { ...base, doors: [], closedZones: [], tvKnock: null };
    const g = fakeClient(none, privateSnapshot(s, 1));
    render(<SoloTable client={g.client} />);
    expect(screen.queryByLabelText("Doors")).toBeNull();
  });
});

class FakeSocket implements SocketLike {
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  send() {}
  close() {}
  say(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

describe("the room client and doors", () => {
  const open = () => {
    const ws = new FakeSocket();
    const c = openRoom({ fetch: async () => new Response("{}"), openSocket: () => ws, socketOrigin: "ws://x" }, "ABCD", "t");
    return { ws, c };
  };

  it("keeps door changes in order (the last six), this Player's knock result, the knocks they heard, and the knock-back result", () => {
    const { ws, c } = open();
    for (let i = 0; i < 8; i++) ws.say({ t: "door", id: "d", open: i % 2 === 0, reason: "knock", need: 0, have: 0 });
    const events = c.getSnapshot().doors!.events;
    expect(events).toHaveLength(6);
    expect(events.map((e) => e.n)).toEqual([3, 4, 5, 6, 7, 8]);
    ws.say({ t: "doorResult", doorId: "d", outcome: "wrong", heard: "You knocked 1.", triesLeft: 2 });
    expect(c.getSnapshot().doors!.result).toEqual({ doorId: "d", outcome: "wrong", heard: "You knocked 1.", triesLeft: 2 });
    ws.say({ t: "sight", sightId: "door-d", sight: { kind: "knock", payload: { kind: "knock", groups: [3, 2], long: null }, showMs: 1 } });
    ws.say({ t: "sight", sightId: "door-d", sight: { kind: "knock", payload: { kind: "knock", groups: [1, 4], long: 0 }, showMs: 1 } });
    expect(c.getSnapshot().doors!.heard).toEqual([{ doorId: "d", groups: [1, 4], long: 0 }]);
    ws.say({ t: "tvKnockResult", outcome: "help", heard: "You knocked 2, 3." });
    expect(c.getSnapshot().doors!.tvResult).toEqual({ outcome: "help", heard: "You knocked 2, 3." });
  });

  it("ignores other Sights and malformed door messages", () => {
    const { ws, c } = open();
    ws.say({ t: "sight", sightId: "lock-1-sight", sight: { payload: { groups: [1] } } });
    ws.say({ t: "sight", sightId: "door-d", sight: { payload: { groups: ["x"] } } });
    ws.say({ t: "sight", sightId: "door-d" });
    ws.say({ t: "door", id: 5, open: "yes", reason: 1 });
    ws.say({ t: "doorResult", doorId: 1 });
    ws.say({ t: "tvKnockResult" });
    expect(c.getSnapshot().doors).toBeUndefined();
  });
});

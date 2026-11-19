// @vitest-environment jsdom
import { createEngine, privateSnapshot, publicSnapshot, step, type EngineState } from "@hauntology/shared/party/engine";
import { PRESET_GHOST_IDS } from "@hauntology/shared/party/preset-ghosts";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountHost, SoloTable } from "./host";
import type { RoomClient, RoomSnapshot } from "./room-client";
import { eventLine, namesOf, notebook } from "./words";

afterEach(() => cleanup());

/** A real game from the Engine: the visitor in seat 1 with two Bots. */
function game(): { s: EngineState; now: number } {
  const seats = [1, 2, 3].map((seat) => ({ seat, nickname: seat === 1 ? "You" : `Bot${seat}`, bot: seat !== 1, botLevel: "standard" as const }));
  let s = createEngine({ seed: 7, seats, settings: { baseSeconds: 60, hauntMax: 10, puzzles: "off" }, presetIds: PRESET_GHOST_IDS });
  let r = step(s, { kind: "client", seat: 1, msg: { t: "start" } }, 0);
  s = r.state;
  let now = 0;
  for (let k = 0; k < 300 && s.turn?.seat !== 1; k++) { now = r.wakeAtMs ?? now + 1000; r = step(s, { kind: "alarm" }, now); s = r.state; }
  return { s, now };
}

function fakeClient(s: EngineState, now: number) {
  const sent: Record<string, unknown>[] = [];
  let snap: RoomSnapshot = { status: "playing", code: "ABCD", seat: 1, public: publicSnapshot(s, now), private: privateSnapshot(s, 1), refused: null };
  const ls = new Set<() => void>();
  const client: RoomClient = {
    getSnapshot: () => snap,
    subscribe: (l) => { ls.add(l); return () => void ls.delete(l); },
    send: (m) => void sent.push(m),
    close: () => {},
  };
  const set = (p: Partial<RoomSnapshot>) => { snap = { ...snap, ...p }; for (const l of ls) l(); };
  return { client, sent, set };
}

describe("the solo table", () => {
  it("on your turn: go to a room, search it, ask about a ghost and a relic, and end the turn, each as one Room message", () => {
    const { s, now } = game();
    expect(s.turn?.seat).toBe(1);
    const { client, sent } = fakeClient(s, now);
    render(<SoloTable client={client} />);
    expect(screen.getByRole("status").textContent).toContain("Your turn");
    const zone = s.pool.zones[0]!;
    fireEvent.click(within(screen.getByRole("group", { name: "Rooms" })).getByRole("button", { name: zone.name }));
    expect(sent.at(-1)).toEqual({ t: "walk", zone: zone.id });
    // the server answers with a view where the visitor is in that room
    const walked = step(s, { kind: "client", seat: 1, msg: { t: "walk", zone: zone.id } }, now + 10).state;
    cleanup();
    const w = fakeClient(walked, now + 10);
    render(<SoloTable client={w.client} />);
    fireEvent.click(screen.getByRole("button", { name: "Search this room" }));
    expect(w.sent.at(-1)).toEqual({ t: "inspect" });
    const ghost = walked.pool.suspects[2]!;
    const relic = walked.pool.relics[1]!;
    const ask = screen.getByRole("button", { name: "Ask" });
    expect((ask as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getAllByLabelText("Ghost")[0]!, { target: { value: ghost.id } });
    fireEvent.change(screen.getAllByLabelText("Relic")[0]!, { target: { value: relic.id } });
    fireEvent.click(ask);
    expect(w.sent.at(-1)).toEqual({ t: "suggest", suspect: ghost.id, relic: relic.id });
    fireEvent.click(screen.getByRole("button", { name: "End turn" }));
    expect(w.sent.at(-1)).toEqual({ t: "endTurn" });
  });

  it("an accusation needs a second press, and sends all three cards", () => {
    const { s, now } = game();
    const { client, sent } = fakeClient(s, now);
    render(<SoloTable client={client} />);
    const form = screen.getByRole("region", { name: "Accuse" });
    const [g, z, r] = [s.pool.suspects[0]!, s.pool.zones[1]!, s.pool.relics[2]!];
    fireEvent.change(within(form).getByLabelText("Ghost"), { target: { value: g.id } });
    fireEvent.change(within(form).getByLabelText("Room"), { target: { value: z.id } });
    fireEvent.change(within(form).getByLabelText("Relic"), { target: { value: r.id } });
    fireEvent.click(within(form).getByRole("button", { name: "Seal accusation" }));
    expect(sent.filter((m) => m.t === "seal")).toEqual([]);
    fireEvent.click(within(form).getByRole("button", { name: "Yes, seal it" }));
    expect(sent.at(-1)).toEqual({ t: "seal", suspect: g.id, zone: z.id, relic: r.id });
  });

  it("shows a refusal in words, and the ending with the answer", () => {
    const { s, now } = game();
    const f = fakeClient(s, now);
    render(<SoloTable client={f.client} />);
    act(() => f.set({ refused: "not_your_turn" }));
    expect(screen.getByRole("alert").textContent).toBe("It is not your turn.");
    const sol = s.deal!.solution;
    act(() => f.set({ status: "ended", public: { ...publicSnapshot(s, now), phase: "ended", ending: { solution: sol, residueAt: {}, winners: [1], houseWins: false, mostHaunting: null, scare: {}, nudges: { help: 0, spook: 0 }, recap: { entries: [], counts: {}, solution: sol, reveal: [] } } } }));
    const n = namesOf(publicSnapshot(s, now), 1);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("The case is solved");
    expect(document.body.textContent).toContain(`It was ${n.card(sol.suspect)}, in the ${n.card(sol.zone)}, with the ${n.card(sol.relic)}.`);
    expect(document.body.textContent).toContain("First DetectiveYou");
  });

  it("shows subtitles before audio unlock, unlocks on tap, toggles Ghost voice as Master, and uses prefetched audio (4.6, 4.8)", async () => {
    const { s, now } = game();
    const f = fakeClient(s, now);
    f.set({ hostToken: "host-tok-1", speechOn: false, prefetch: [] });
    const fetchSpeech = vi.fn(async (req: { roomCode: string; lineId: string; prefetch?: boolean }) => ({
      ok: true as const,
      value: { audio: new Blob([req.lineId], { type: "audio/mpeg" }) },
    }));
    const played: Array<{ paused: boolean }> = [];
    const createAudio = () => {
      const a = { paused: false, onended: null as (() => void) | null, play: async () => {}, pause() { this.paused = true; } };
      played.push(a);
      return { audio: a, release: () => {} };
    };

    render(<SoloTable client={f.client} fetchSpeech={fetchSpeech} createAudio={createAudio} />);

    // Before unlock: voice cue updates polite live-region subtitle without fetching audio.
    await act(async () => {
      f.set({ voice: { seq: 1, lineId: "l-1", text: "A cold draft passes.", kind: "haunt" } });
    });
    const sub = document.querySelector("[data-host-subtitle]")!;
    expect(sub.getAttribute("aria-live")).toBe("polite");
    expect(sub.textContent).toBe("A cold draft passes.");
    expect(fetchSpeech).not.toHaveBeenCalled();

    // Tapping Ghost voice as seat 1 Master sends speech on & unlocks Host audio.
    const voiceBtn = screen.getByRole("button", { name: "Ghost voice" });
    expect(voiceBtn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(voiceBtn);
    expect(f.sent.at(-1)).toEqual({ t: "speech", action: "on" });
    await act(async () => {
      f.set({ speechOn: true, prefetch: ["p-1"] });
    });
    expect(fetchSpeech).toHaveBeenCalledWith({ roomCode: "ABCD", lineId: "p-1", prefetch: true }, "host-tok-1");

    // Subsequent voice cue for prefetched id plays immediately without a second fetch!
    const callsAfterPrefetch = fetchSpeech.mock.calls.length;
    await act(async () => {
      f.set({ voice: { seq: 2, lineId: "p-1", text: "It whispers from the hall.", kind: "whisper" } });
    });
    expect(fetchSpeech).toHaveBeenCalledTimes(callsAfterPrefetch);
    expect(played).toHaveLength(1);
    expect(played[0]!.paused).toBe(false);

    // Turning speech off stops the playing clip.
    await act(async () => { f.set({ speechOn: false }); });
    expect(played[0]!.paused).toBe(true);
  });

  it("wires SongControls into SoloTable for Master setting/mute/skip, Sing my name, captions, and hint log (game-songs 3.3)", async () => {
    const { s, now } = game();
    const f = fakeClient(s, now);
    f.set({ hostToken: "host-tok-2" });
    render(<SoloTable client={f.client} />);

    fireEvent.click(screen.getByRole("radio", { name: "On" }));
    expect(f.sent.at(-1)).toEqual({ t: "songsSetting", setting: "on" });
    fireEvent.click(screen.getByLabelText("Sing my name"));
    expect(f.sent.at(-1)).toEqual({ t: "singMyName", yes: true });

    await act(async () => {
      f.set({
        songsSetting: "on",
        activeSong: { seq: 1, key: "clue-1", title: "A Quiet Drift", captions: "Nothing stirs in the Attic.", hintLogLine: "A song drifted: Attic is clear." },
      });
    });
    const cap = document.querySelector("[data-song-captions]")!;
    expect(cap.textContent).toContain("A Quiet Drift: Nothing stirs in the Attic.");
    expect(document.body.textContent).toContain("A song drifted: Attic is clear.");

    fireEvent.click(screen.getByRole("button", { name: "Skip song" }));
    expect(f.sent.at(-1)).toEqual({ t: "songSkip" });
  });
});

describe("words", () => {
  it("the notebook strikes your own cards, and the log never names the card a Player showed", () => {
    const { s, now } = game();
    const view = publicSnapshot(s, now);
    const me = privateSnapshot(s, 1)!;
    const rows = notebook(view, me).flatMap((g) => g.rows);
    for (const c of me.hand) expect(rows.find((r) => r.id === c.id)?.mark).toBe("mine");
    expect(rows.filter((r) => r.mark !== null)).toHaveLength(me.hand.length);
    const n = namesOf(view, 1);
    const line = eventLine({ id: 9, kind: "suggest", seat: 2, zone: view.zones[0]!.id, suspect: view.suspects[0]!.id, relic: view.relics[0]!.id, passed: [], refuter: 1 }, n);
    expect(line).toBe(`Bot2 asked: ${view.suspects[0]!.name}, in the ${view.zones[0]!.name}, with the ${view.relics[0]!.name}? You showed a card.`);
  });
});

describe("mountHost", () => {
  it("a world too small for a case sends the reason back and makes no Room", async () => {
    const calls: string[] = [];
    const got: unknown[] = [];
    const deps = {
      fetch: async (url: string) => { calls.push(url); return new Response(JSON.stringify({ manifest: { bounds: { min: [-4, 0, -4], max: [4, 3, 4] } } }), { status: 200 }); },
      openSocket: () => { throw new Error("no socket"); },
      socketOrigin: "ws://x",
    };
    const h = await mountHost({ container: document.createElement("div"), worldId: "w1", setup: { preset: "classic", bots: 2 }, sky: undefined, onMessage: (m) => got.push(m) }, deps);
    await Promise.resolve();
    expect(got).toEqual([{ t: "refused", code: "world_too_small" }]);
    expect(calls).toEqual(["/api/worlds/w1"]);
    await h.dispose();
  });

  it("mounts the world beside the table, shows the Haunt rising, and releases both on exit", async () => {
    const sent: unknown[] = [];
    let disposed = 0;
    const sockets: { onopen: (() => void) | null; onmessage: ((e: { data: string }) => void) | null; send(t: string): void; close(): void; onclose: null }[] = [];
    const deps = {
      fetch: async (url: string) => new Response(JSON.stringify(url.startsWith("/api/worlds") ? { manifest: { bounds: { min: [-9, 0, -9], max: [9, 3, 9] } } } : url.endsWith("/join") ? { ok: true, seat: 1, token: "t".repeat(32) } : { code: "ABCD" }), { status: 200 }),
      openSocket: () => { const ws = { onopen: null, onmessage: null, onclose: null, send() {}, close() {} }; sockets.push(ws); return ws as never; },
      socketOrigin: "ws://x",
    };
    const container = document.createElement("div");
    document.body.append(container);
    const h = await act(() => mountHost({
      container, worldId: "w1", setup: { preset: "classic", bots: 2 }, sky: undefined, onMessage: () => {},
      loadViewer: async () => ({ mountViewer: ({ container: c }) => { c.append(Object.assign(document.createElement("canvas"), { id: "world" })); return { send: (m) => void sent.push(m), dispose: async () => void disposed++ }; } }),
    }, deps));
    expect(container.querySelector(".case-split .case-world #world")).not.toBeNull();
    const { s, now } = game();
    act(() => sockets[0]!.onmessage?.({ data: JSON.stringify({ t: "public", view: { ...publicSnapshot(s, now), haunt: { ...publicSnapshot(s, now).haunt, level: 5, max: 10 } } }) }));
    expect(sent.at(-1)).toEqual({ t: "apply_view", found: [], anchors: [], hauntLevel: 0.5, ghostVisible: false });
    await act(() => h.dispose());
    expect(disposed).toBe(1);
    expect(container.querySelector(".case-split")).toBeNull();
  });

  it("forwards Public View worldClues to the Viewer and forwards viewer clue_seen back to the Room", async () => {
    const sentToViewer: unknown[] = [];
    const sentToSocket: string[] = [];
    let emitViewerMessage: ((m: unknown) => void) | null = null;
    const sockets: { onopen: (() => void) | null; onmessage: ((e: { data: string }) => void) | null; send(t: string): void; close(): void; onclose: null }[] = [];
    const deps = {
      fetch: async (url: string) => new Response(JSON.stringify(url.startsWith("/api/worlds") ? { manifest: { bounds: { min: [-9, 0, -9], max: [9, 3, 9] } } } : url.endsWith("/join") ? { ok: true, seat: 1, token: "t".repeat(32) } : { code: "ABCD" }), { status: 200 }),
      openSocket: () => { const ws = { onopen: null, onmessage: null, onclose: null, send(t: string) { sentToSocket.push(t); }, close() {} }; sockets.push(ws); return ws as never; },
      socketOrigin: "ws://x",
    };
    const container = document.createElement("div");
    document.body.append(container);
    const h = await act(() => mountHost({
      container, worldId: "w1", setup: { preset: "classic", bots: 2 }, sky: undefined, onMessage: () => {},
      loadViewer: async () => ({
        mountViewer: ({ container: c, onMessage }) => {
          emitViewerMessage = onMessage;
          c.append(Object.assign(document.createElement("canvas"), { id: "world" }));
          return { send: (m) => void sentToViewer.push(m), dispose: async () => {} };
        },
      }),
    }, deps));
    const { s, now } = game();
    sockets[0]!.onopen?.();
    const clues = [{ zone: "z2", sign: "moon" as const, sight: { kind: "clock" as const, h: 4, m: 20 } }];
    act(() => sockets[0]!.onmessage?.({ data: JSON.stringify({ t: "public", view: { ...publicSnapshot(s, now), cluePlace: "world", worldClues: clues } }) }));
    expect(sentToViewer).toContainEqual({ t: "set_world_clues", clues });
    act(() => emitViewerMessage?.({ t: "clue_seen", sign: "moon" }));
    expect(sentToSocket).toContain(JSON.stringify({ t: "clueSeen", sign: "moon" }));
    await act(() => h.dispose());
  });
});

describe("SoloTable doors (knock-door 1.4, 2.8)", () => {
  it("disables closed Zones in the Turn Room picker and shows doorProblems to the Master", () => {
    const { s, now } = game();
    const base = publicSnapshot(s, now);
    const closedId = base.zones[1]!.id;
    const snap = {
      status: "playing" as const,
      code: "ABCD",
      seat: 1,
      public: { ...base, active: 1, closedZones: [closedId], doorProblems: ["0:width"] },
      private: privateSnapshot(s, 1),
      refused: null,
    };
    const client = {
      getSnapshot: () => snap,
      subscribe: () => () => {},
      send() {},
      close() {},
    };
    const { container } = render(<SoloTable client={client} />);
    const rooms = within(container).getByRole("group", { name: "Rooms" });
    const closedBtn = within(rooms).getByRole("button", { name: base.zones[1]!.name });
    const openBtn = within(rooms).getByRole("button", { name: base.zones[0]!.name });
    expect(closedBtn.hasAttribute("disabled")).toBe(true);
    expect(openBtn.hasAttribute("disabled")).toBe(false);
    expect(within(container).getByText(/Door 1 width must be between/)).toBeTruthy();
  });
});

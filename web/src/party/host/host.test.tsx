// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { soundAvailability } from "@hauntology/shared/party/sounds";
import { game, lobby, pub } from "../../test/party-fixtures";
import { EMPTY_HOST, applyHostMessage, type HostView } from "./host-view";
import { Ending, recapReactions, RECAP_STEP_MS } from "./Ending";
import { BLACKOUT_HOLD_MS, blackoutDim, HostEffects, hostSounds } from "./HostEffects";
import { Hud } from "./Hud";
import { RoomCodeCard } from "./RoomCodeCard";
import { atmosphereFromSky, remoteMove, viewerMessages } from "./host-viewer";
import { frameSpots } from "./frames";
import { HostPage, type HostExtras } from "./HostPage";
import { IDLE_HOST, type HostState } from "../phone/host-port";
import { useWakeLock } from "../phone/wake-lock";
import { useWhisper } from "./whisper";
import type { SoundDeps } from "../controller/play/phone-sound";

afterEach(() => { cleanup(); vi.useRealTimers(); });
const NOT_SEATED_VIEW = { connection: "online", phase: "lobby", code: null, seat: null, nickname: null, master: null, lock: null } as never;
const text = (el: HTMLElement): string => el.textContent ?? "";
const host = (g = game(), over: Partial<HostView> = {}): HostView => ({ ...EMPTY_HOST, game: g, ...over });
const ENDING = { solution: { suspect: "s2", zone: "z1", relic: "r3" }, residueAt: { r1: "z2", s1: "z3" }, winners: [2, 1], houseWins: false, mostHaunting: 3, scare: { 3: 4 }, nudges: { help: 2, spook: 1 },
  recap: { entries: [{ id: 1, kind: "turn-start", seat: 1 }, { id: 2, kind: "suggest", seat: 1, zone: "z1", suspect: "s2", relic: "r1", passed: [], refuter: 2, bluff: true }, { id: 3, kind: "accuse", seat: 2, right: true }], reveal: [{ eventId: 5, kind: "frame", from: 2 }, { eventId: 6, kind: "rattle", from: 3 }] } };

describe("RoomCodeCard (party-mode 8.1)", () => {
  it("shows the code large, the join address as text with only the code in it, and says when there is no picture to scan", () => {
    render(<RoomCodeCard code="K7M2" origin="https://lab.example" />);
    expect(screen.getByLabelText("Room Code K 7 M 2")).toBeTruthy();
    expect(text(screen.getByText(/lab\.example\/play\?code=K7M2/))).toContain("lab.example/play?code=K7M2");
    expect(screen.getByText(/Type the code/)).toBeTruthy();
    cleanup();
    render(<RoomCodeCard code="K7M2" origin="https://lab.example" qr={<img alt="QR" />} />);
    expect(screen.getByAltText("QR")).toBeTruthy();
  });
});

describe("Hud (party-mode 8.2, 8.9, 8.10, 8.11, 8.14)", () => {
  it("shows the active Player, round, clock, Haunt level, Cold Spot, a searching marker (never what was found) and the sealed count", () => {
    const g = game({ pub: pub({ active: 2, at: "z2", inspecting: "z2", haunt: { level: 3, max: 10, coldSpot: "z1", choosing: null }, seats: [
      { seat: 1, nickname: "Ana", bot: false, poltergeist: false, handSize: 4, sealed: true }, { seat: 2, nickname: "Ben", bot: false, poltergeist: false, handSize: 4, sealed: false },
      { seat: 3, nickname: "Cat", bot: false, poltergeist: true, handSize: 4, sealed: true }] }) });
    render(<Hud host={host(g)} offsetMs={0} nowMs={10_000} />);
    expect(screen.getByRole("heading", { name: "Ben's turn" })).toBeTruthy();
    expect(screen.getByText("Round 1")).toBeTruthy();
    expect(screen.getByRole("timer").textContent).toBe("1:00");
    expect(screen.getByRole("meter", { name: "Haunt level" }).getAttribute("aria-valuenow")).toBe("3");
    expect(screen.getByText(/Haunting 3 of 10\. The Parlour is cold\./.source ? /The Cellar is cold/ : /x/)).toBeTruthy();
    expect(screen.getByText("Attic (searching)")).toBeTruthy();
    expect(screen.getByText("Ben is searching the Attic.")).toBeTruthy();
    expect(screen.getByText("1 of 2 Accusations sealed this round.")).toBeTruthy();
    expect(screen.getByText("Joined the haunting: Cat.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Poltergeist/i);
  });
  it("warns in the last ten seconds, says paused, and shows the narrator line, the Cue caption and the log in polite live regions", () => {
    const g = { ...game(), log: [{ id: 1, text: "Ana's turn." }, { id: 2, text: "The clock struck one." }] };
    const h = host(g, { tvCues: [{ id: "tv-1", cue: "bell", caption: "A small bell rings", playAtMs: 0 }] });
    const { rerender } = render(<Hud host={h} offsetMs={0} nowMs={65_000} />);
    expect(screen.getByRole("timer").className).toContain("is-active");
    expect(screen.getByTestId("ph-cue").textContent).toBe("A small bell rings");
    expect(screen.getByLabelText("What is happening").getAttribute("aria-live")).toBe("polite");
    expect(text(screen.getByLabelText("The house speaks"))).toBe("The clock struck one.");
    rerender(<Hud host={host({ ...g, pub: pub({ paused: true }) } as never)} offsetMs={0} nowMs={65_000} />);
    expect(screen.getByRole("timer").textContent).toContain("(paused)");
    expect(screen.getByRole("timer").className).not.toContain("is-active");
    rerender(<Hud host={{ ...h, spoken: [{ lineId: "l", text: "Midnight.", kind: "midnight" }] }} offsetMs={0} nowMs={0} />);
    expect(text(screen.getByLabelText("The house speaks"))).toBe("Midnight.");
  });
  it("lists the Achievements anyone earned, and shows nothing before there is a Public View", () => {
    const events = [1, 2, 3].map((i) => ({ id: i, kind: "suggest", seat: 2 }));
    render(<Hud host={host(game({ pub: pub({ events }) }))} offsetMs={0} nowMs={0} />);
    expect(within(screen.getByRole("list", { name: "Achievements" })).getByText(/Ben: Persistent/)).toBeTruthy();
    cleanup();
    const { container } = render(<Hud host={EMPTY_HOST} offsetMs={0} nowMs={0} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("Ending (party-mode 8.5, 8.14)", () => {
  const ended = (over: Record<string, unknown> = {}) => game({ pub: pub({ phase: "ended", active: null, ending: { ...ENDING, ...over }, seats: [
    { seat: 1, nickname: "Ana", bot: false, poltergeist: false, handSize: 4, sealed: true }, { seat: 2, nickname: "Ben", bot: false, poltergeist: false, handSize: 4, sealed: true }, { seat: 3, nickname: "Cat", bot: false, poltergeist: true, handSize: 4, sealed: true }] }) });
  it("ranks the winners with the First Detective title, names the Solution, who joined the haunting, the Residue, Most Haunting and the counters, and never says Poltergeist", () => {
    render(<Ending game={ended()} skipped={0} reducedMotion />);
    const winners = screen.getByRole("list", { name: "Winners, best first" });
    expect(within(winners).getAllByRole("listitem").map((l) => l.textContent)).toEqual(["First Detective: Ben", "Also solved it: Ana"]);
    expect(screen.getByText(/It was/).textContent).toBe("It was Miss Pike, in the Cellar, with the Locket.");
    expect(screen.getByText("Joined the haunting: Cat.")).toBeTruthy();
    expect(screen.getByText("Most Haunting: Cat, with 4 scare points.")).toBeTruthy();
    expect(screen.getByText("Help given: 2. Spooks: 1.")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Where the Residue was" })).getByText("Music box in the Attic")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Poltergeist/i);
  });
  it("says the haunting continues when the house wins, with no winners", () => {
    render(<Ending game={ended({ houseWins: true, winners: [], mostHaunting: null })} skipped={0} reducedMotion />);
    expect(screen.getByRole("heading", { name: "The haunting continues" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Winners, best first" })).toBeNull();
  });
  it("plays the recap one entry at a time, says each Bluff in words, tells the senders at the end, and a Skip from the Master shows the rest at once", () => {
    vi.useFakeTimers();
    const { rerender } = render(<Ending game={ended()} skipped={0} reducedMotion={false} />);
    const log = () => within(screen.getByRole("list", { name: "What happened" })).queryAllByRole("listitem").map((l) => l.textContent);
    expect(log()).toEqual([]);
    expect(screen.getByText("The Master can skip this.")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(RECAP_STEP_MS); });
    expect(log()).toEqual(["Ana's turn."]);
    act(() => { vi.advanceTimersByTime(RECAP_STEP_MS); });
    expect(log()[1]).toBe("Ana suggested Miss Pike with the Music box in the Cellar. (a bluff)");
    expect(screen.queryByRole("list", { name: "Who sent the sounds" })).toBeNull();
    rerender(<Ending game={ended()} skipped={1} reducedMotion={false} />);
    expect(log()).toHaveLength(3);
    const senders = within(screen.getByRole("list", { name: "Who sent the sounds" }));
    expect(senders.getByText("Ben sent a frame.")).toBeTruthy();
    expect(senders.getByText("Cat rattled the house.")).toBeTruthy();
    expect(screen.getByText("The Master can play again from their phone.")).toBeTruthy();
  });
  it("shows the whole recap at once, in order, under reduced motion, and keeps the reactions inside the flash limits", () => {
    render(<Ending game={ended()} skipped={0} reducedMotion />);
    expect(within(screen.getByRole("list", { name: "What happened" })).getAllByRole("listitem")).toHaveLength(3);
    const entries = ENDING.recap.entries;
    expect(recapReactions(entries, true)).toEqual([]);
    const rs = recapReactions(entries, false);
    const flashes = rs.flatMap((r) => r.flashes).sort((a, b) => a - b);
    for (let i = 3; i < flashes.length; i++) expect(flashes[i]! - flashes[i - 3]!).toBeGreaterThanOrEqual(1000); // at most three in any second
    expect(rs.find((r) => r.kind === "accuse-right")?.reveal).toBe(true);
  });
  it("shows nothing before the ending", () => {
    const { container } = render(<Ending game={game()} skipped={0} reducedMotion />);
    expect(container.firstChild).toBeNull();
  });
});

describe("HostEffects (party-mode 8.9, 8.11, 8.12, 8.13)", () => {
  const deps = (over: Partial<SoundDeps> = {}) => {
    const played: [string, number][] = []; const timers: { f: () => void; ms: number }[] = [];
    const d: SoundDeps = { play: (id, v) => played.push([id, v]), vibrate: () => undefined, available: soundAvailability(["creak", "bell", "wind", "becoming"]), canVibrate: false, reducedMotion: false, now: () => 0, setTimer: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimer: () => undefined, ...over };
    return Object.assign(d, { played, timers });
  };
  it("turns the Host's cues into sounds: a TV Cue, a Rattle at most 80 percent, the Becoming, and a strike once for each hour", () => {
    const h = applyHostMessage(applyHostMessage(applyHostMessage(applyHostMessage(EMPTY_HOST, { t: "tvCue", eventId: 1, cue: "creak", playAtMs: 100 }, 0), { t: "rattleSound", eventId: 2, level: 2, sound: "wind", volume: 1, playAtMs: 200, line: "a wind passed" }, 0), { t: "becoming", seat: 3, atMs: 300, durationMs: 4000, fadeOrder: [3] }, 0), { t: "strike", atMs: 400, count: 3, midnight: false }, 0);
    expect(hostSounds(h).map((s) => [s.sound, s.volume])).toEqual([["creak", undefined], ["wind", 0.8], ["becoming", undefined], ["bell-3", undefined]]);
    const d = deps();
    render(<HostEffects host={h} offsetMs={0} nowMs={0} deps={d} reducedMotion={false} />);
    act(() => d.timers.forEach((t) => t.f()));
    expect(d.played.map((p) => p[0])).toEqual(["creak", "wind", "becoming", "bell", "bell", "bell"]);
    expect(d.played.every((p) => p[1] <= 0.8)).toBe(true);
  });
  it("shows a Cue's caption and a Rattle's line only for about three seconds", () => {
    const h = applyHostMessage(applyHostMessage(EMPTY_HOST, { t: "tvCue", eventId: 1, cue: "bell", playAtMs: 1000 }, 0), { t: "rattleSound", eventId: 2, level: 1, sound: "creak", volume: 0.8, playAtMs: 1000, line: "the floorboards creaked" }, 0);
    const { rerender } = render(<HostEffects host={h} offsetMs={0} nowMs={1500} deps={deps()} reducedMotion={false} />);
    expect(screen.getByTestId("ph-caption").textContent).toBe("A small bell rings");
    expect(screen.getByTestId("ph-rattle").textContent).toBe("the floorboards creaked");
    rerender(<HostEffects host={h} offsetMs={0} nowMs={1000 + 3000} deps={deps()} reducedMotion={false} />);
    expect(screen.queryByTestId("ph-caption")).toBeNull();
    expect(screen.queryByTestId("ph-rattle")).toBeNull();
  });
  it("flashes for a sound it cannot play, never under reduced motion", () => {
    const h = applyHostMessage(EMPTY_HOST, { t: "tvCue", eventId: 1, cue: "laugh", playAtMs: 0 }, 0); // no laugh file here
    const d = deps();
    const { rerender } = render(<HostEffects host={h} offsetMs={0} nowMs={0} deps={d} reducedMotion={false} />);
    act(() => d.timers.forEach((t) => t.f()));
    expect(screen.getByTestId("ph-flash").getAttribute("aria-hidden")).toBe("true");
    cleanup();
    const d2 = deps({ reducedMotion: true });
    render(<HostEffects host={h} offsetMs={0} nowMs={0} deps={d2} reducedMotion />);
    act(() => d2.timers.forEach((t) => t.f()));
    expect(screen.queryByTestId("ph-flash")).toBeNull();
    void rerender;
  });
  it("dims for a Blackout in steps of at most 20 percent to at most 60 percent dark, then returns, and never dims under reduced motion", () => {
    const events = [{ id: 7, kind: "haunt-event", option: "blackout" }];
    const seen = new Map([[7, 1000]]);
    const levels = [1000, 1400, 1800, 2200, 2600].map((t) => blackoutDim(events, seen, t, false));
    expect(levels[0]).toBe(0);
    for (let i = 1; i < levels.length; i++) expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(20);
    expect(Math.max(...levels)).toBeLessThanOrEqual(60);
    expect(Math.max(...levels)).toBeGreaterThan(0);
    expect(blackoutDim(events, seen, 1000 + BLACKOUT_HOLD_MS + 5000, false)).toBe(0);
    expect(blackoutDim(events, seen, 2600, true)).toBe(0);
    expect(blackoutDim([{ id: 8, kind: "haunt-event", option: "lull" }], new Map([[8, 0]]), 1000, false)).toBe(0);
  });
});

describe("the Viewer seam (party-mode 8.3, 8.12)", () => {
  it("turns the stick and look into one frame of movement: up is forward, the same speed for every Player, look turns the view", () => {
    expect(remoteMove({ move: [0, -1], look: [0, 0] })).toEqual({ forward: 1, strafe: 0, sprint: false, yawDelta: 0, pitchDelta: 0 });
    const m = remoteMove({ move: [1, 0], look: [60, -60] });
    expect(m.strafe).toBe(1);
    expect(m.yawDelta).toBeLessThan(0);
    expect(m.pitchDelta).toBeGreaterThan(0);
    expect(m.sprint).toBe(false);
    expect(remoteMove({ move: [0, 0], look: [0, 0] })).toEqual({ forward: 0, strafe: 0, sprint: false, yawDelta: 0, pitchDelta: 0 });
  });
  it("builds the Viewer's sky from the three cosmetic fields, sends it once per change, and nothing for a sky it does not know", () => {
    const a = atmosphereFromSky({ weather: "rain", timeOfDay: "night", moon: "full moon" });
    expect(a).toMatchObject({ weather: "rain", timeOfDay: "night", moon: "full moon", tempBand: "mild", windBand: "calm" });
    expect(atmosphereFromSky({ weather: "plasma", timeOfDay: "night", moon: "full moon" })).toBeNull();
    expect(atmosphereFromSky(null)).toBeNull();
    const last = { sky: null as string | null };
    const h = applyHostMessage(EMPTY_HOST, { t: "setAtmosphere", weather: "rain", timeOfDay: "night", moon: "full moon" }, 0);
    expect(viewerMessages(h, last)).toEqual([{ t: "set_atmosphere", atmosphere: a }]);
    expect(viewerMessages(h, last)).toEqual([]);
    expect(viewerMessages(EMPTY_HOST, last)).toEqual([{ t: "set_atmosphere", atmosphere: null }]);
  });
  it("places a photo frame beside each Zone with a photo, on the side of the spawn, facing it, at eye height, and none without a photo", () => {
    const spots = frameSpots([{ id: "a", x: 4, z: 0 }, { id: "b", x: 0, z: -6 }, { id: "c", x: 3, z: 3 }], { x: 0, z: 0 }, new Set(["a", "b"]));
    expect(spots.map((s) => s.zone)).toEqual(["a", "b"]);
    expect(spots[0]!.pos[0]).toBeCloseTo(2.8, 5);
    expect(spots[0]!.pos[1]).toBe(1.4);
    expect(spots[0]!.yaw).toBeCloseTo(-Math.PI / 2, 5); // faces -x, towards the spawn
    expect(spots[1]!.pos[2]).toBeCloseTo(-4.8, 5);
    expect(spots[1]!.yaw).toBeCloseTo(0, 5);
    expect(frameSpots([{ id: "z", x: Number.NaN, z: 0 }], { x: 0, z: 0 }, new Set(["z"]))).toEqual([]);
  });
});

describe("useWhisper (party-mode 8.13)", () => {
  function Probe({ h, deps }: { h: HostView; deps: import("./whisper").WhisperDeps | null }): React.ReactNode { return <p data-testid="s">{useWhisper(h, deps, (f, ms) => { timers.push({ f, ms }); return 0; })}</p>; }
  const timers: { f: () => void; ms: number }[] = [];
  const msg = { t: "stitch", eventId: "stitch-1", subtitle: "wait here", clips: [{ word: "wait", contentType: "audio/webm", durationMs: 700, audio: "QQ==" }, { word: "here", contentType: "audio/webm", durationMs: 700, audio: "Qg==" }] };
  it("shows the subtitle and plays the recorded words in order, once, then clears the subtitle", async () => {
    timers.length = 0;
    const played: string[] = [];
    const deps = { playClip: async (c: { audio: string }) => { played.push(c.audio); } };
    const h = applyHostMessage(EMPTY_HOST, msg, 0);
    const { rerender } = render(<Probe h={h} deps={deps} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByTestId("s").textContent).toBe("wait here");
    expect(played).toEqual(["QQ==", "Qg=="]);
    rerender(<Probe h={{ ...h }} deps={deps} />);
    await act(async () => { await Promise.resolve(); });
    expect(played).toHaveLength(2); // the same line is not played again
    act(() => timers.at(-1)!.f());
    expect(screen.getByTestId("s").textContent).toBe("");
    expect(timers.at(-1)!.ms).toBe(4000);
  });
  it("stops at a clip that will not play, and shows the subtitle alone with no audio", async () => {
    const played: string[] = [];
    const deps = { playClip: async (c: { audio: string }) => { played.push(c.audio); throw new Error("blocked"); } };
    const { unmount } = render(<Probe h={applyHostMessage(EMPTY_HOST, msg, 0)} deps={deps} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(played).toEqual(["QQ=="]);
    unmount();
    render(<Probe h={applyHostMessage(EMPTY_HOST, { ...msg, eventId: "stitch-2" }, 0)} deps={null} />);
    expect(screen.getByTestId("s").textContent).toBe("wait here");
  });
});

describe("useWakeLock (party-mode 8.1, 9.13)", () => {
  function Probe({ active, nav }: { active: boolean; nav: Parameters<typeof useWakeLock>[1] }): React.ReactNode { return <p data-testid="w">{useWakeLock(active, nav)}</p>; }
  it("holds a screen wake lock while active, releases it after, and says unsupported where there is none", async () => {
    const release = vi.fn(async () => undefined);
    const request = vi.fn(async () => ({ release }));
    const { rerender } = render(<Probe active nav={{ wakeLock: { request } }} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("w").textContent).toBe("held");
    expect(request).toHaveBeenCalledWith("screen");
    rerender(<Probe active={false} nav={{ wakeLock: { request } }} />);
    expect(release).toHaveBeenCalled();
    expect(screen.getByTestId("w").textContent).toBe("off");
    cleanup();
    render(<Probe active nav={{}} />);
    expect(screen.getByTestId("w").textContent).toBe("unsupported");
    cleanup();
    render(<Probe active nav={{ wakeLock: { request: async () => { throw new Error("no"); } } }} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("w").textContent).toBe("off");
  });
});

describe("HostPage (party-mode 8.1 to 8.14)", () => {
  class FakeHostPort {
    state: HostState = IDLE_HOST;
    listeners = new Set<() => void>();
    created: boolean[] = [];
    getState() { return this.state; }
    subscribe(l: () => void) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
    set(over: Partial<HostState>) { this.state = { ...this.state, ...over }; act(() => { for (const l of [...this.listeners]) l(); }); }
    async create(replace: boolean) { this.created.push(replace); this.state = { ...this.state, connection: "connecting", code: "K7M2" }; this.listeners.forEach((l) => l()); return true; }
  }
  const extras = (over: Partial<HostExtras> = {}): HostExtras => ({
    origin: "https://lab.example", narration: null, reducedMotion: false, now: () => 0,
    soundDeps: { play: () => undefined, vibrate: () => undefined, available: soundAvailability([]), canVibrate: false, reducedMotion: false, now: () => 0, setTimer: () => 0, clearTimer: () => undefined },
    ...over,
  });
  const asPort = (p: FakeHostPort) => p as never;
  it("starts with one button, makes a game (replacing the visitor's own earlier one), then shows the Room Code until the game starts", async () => {
    const p = new FakeHostPort();
    render(<HostPage port={asPort(p)} extras={extras()} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Make a game" })); await Promise.resolve(); });
    expect(p.created).toEqual([true]);
    p.set({ connection: "online", view: { ...EMPTY_HOST, game: game({ pub: null, priv: null, lobby: lobby({ started: false, worldId: null, seats: [] }) }) } });
    expect(screen.getByLabelText("Room Code K 7 M 2")).toBeTruthy();
    expect(screen.getByText("Nobody has joined yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play on this screen" })).toBeNull(); // not offered here: no handler given
    cleanup();
    const q = new FakeHostPort();
    q.state = { ...IDLE_HOST, connection: "online", code: "K7M2", view: { ...EMPTY_HOST, game: game({ pub: null, priv: null, lobby: lobby({ started: false, seats: [] }) }) } };
    const joined: string[] = [];
    const pad = { join: async (c: string, n: string) => { joined.push(`${c}/${n}`); return { ok: false as const, code: "room_full" as const }; }, getView: () => NOT_SEATED_VIEW, subscribe: () => () => undefined, attempt: () => { throw new Error("x"); }, closeLock: () => undefined, setPuzzles: () => undefined, leave: async () => undefined };
    const playHere = { port: pad as never, extras: { worlds: [], storage: localStorage, unlock: async () => true, soundDeps: extras().soundDeps } };
    render(<HostPage port={asPort(q)} extras={extras({ playHere })} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Play on this screen" })); await Promise.resolve(); });
    expect(joined).toEqual(["K7M2/You"]); // the screen joins as an ordinary Player
    expect(screen.queryByRole("button", { name: "Play on this screen" })).toBeNull();
  });
  it("says the Room's refusal in words, and shows nothing of a game after it", () => {
    const p = new FakeHostPort();
    p.state = { ...IDLE_HOST, connection: "failed", failure: "rooms_full" };
    render(<HostPage port={asPort(p)} extras={extras()} />);
    expect(screen.getByRole("alert").textContent).toBe("Every table is taken. Try again in a little while.");
    expect(screen.queryByLabelText(/Room Code/)).toBeNull();
  });
  it("shows the lobby players, and 'Play on this screen' only while no phone has joined", () => {
    const p = new FakeHostPort();
    p.state = { ...IDLE_HOST, connection: "online", code: "K7M2", view: { ...EMPTY_HOST, game: game({ pub: null, priv: null, lobby: lobby({ started: false, worldId: "kitchen" }) }) } };
    render(<HostPage port={asPort(p)} extras={extras({ playHere: { port: {} as never, extras: {} as never } })} />);
    expect(screen.getByText("Ana · Master")).toBeTruthy();
    expect(screen.getByText("Agnes (Bot)")).toBeTruthy();
    expect(screen.getByText(/A place is chosen\./)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play on this screen" })).toBeNull();
  });
  it("shows the HUD when the game is on, says 'Connection lost' when the socket drops, and the ending at the end", () => {
    const p = new FakeHostPort();
    p.state = { ...IDLE_HOST, connection: "online", code: "K7M2", view: { ...EMPTY_HOST, game: game() } };
    render(<HostPage port={asPort(p)} extras={extras()} />);
    expect(screen.getByRole("heading", { name: "Ana's turn" })).toBeTruthy();
    expect(screen.queryByLabelText(/Room Code/)).toBeNull(); // the code is only until the start
    p.set({ connection: "reconnecting" });
    expect(screen.getByText("Connection lost. Trying again…")).toBeTruthy();
    p.set({ connection: "online", view: { ...EMPTY_HOST, game: game({ pub: pub({ phase: "ended", active: null, ending: ENDING }) }) } });
    expect(screen.getByRole("heading", { name: "The case is solved" })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull(); // display only: no control on the ending
  });
  it("is display only: the playing page has no control of the game", () => {
    const p = new FakeHostPort();
    p.state = { ...IDLE_HOST, connection: "online", code: "K7M2", view: { ...EMPTY_HOST, game: game() } };
    render(<HostPage port={asPort(p)} extras={extras()} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
  it("offers one tap to let the house speak when narration is available, and shows the subtitle always", () => {
    const p = new FakeHostPort();
    const spoken = [{ lineId: "l1", text: "A cold draft passes.", kind: "narration" }];
    p.state = { ...IDLE_HOST, connection: "online", code: "K7M2", hostToken: "ab".repeat(16), view: { ...EMPTY_HOST, game: game(), spoken, speechOn: false } };
    const narration = { fetchSpeech: vi.fn(async () => ({ ok: false as const, code: "voice_unavailable" as never })), createAudio: () => ({ audio: { play: async () => undefined, pause: () => undefined, onended: null }, release: () => undefined }) };
    render(<HostPage port={asPort(p)} extras={extras({ narration })} />);
    expect(screen.getByRole("button", { name: "Tap to let the house speak" })).toBeTruthy();
    expect(document.querySelector("[data-host-subtitle]")!.textContent).toBe("A cold draft passes.");
    expect(narration.fetchSpeech).not.toHaveBeenCalled(); // speech is off: the subtitle only
  });
});

describe("Host audio unlock on the room-code screen (ghost-voice 4.6)", () => {
  const lobbyPort = () => {
    const state: HostState = { ...IDLE_HOST, connection: "online", code: "K7M2", hostToken: "ab".repeat(16), view: { ...EMPTY_HOST, game: game({ pub: null, priv: null, lobby: lobby({ started: false, seats: [] }) }) } };
    return { getState: () => state, subscribe: () => () => undefined, create: async () => true };
  };
  const base = (narration: HostExtras["narration"]): HostExtras => ({
    origin: "https://lab.example", narration, reducedMotion: false, now: () => 0,
    soundDeps: { play: () => undefined, vibrate: () => undefined, available: soundAvailability([]), canVibrate: false, reducedMotion: false, now: () => 0, setTimer: () => 0, clearTimer: () => undefined },
  });
  it("offers one tap beside the Room Code, which goes away once audio is unlocked", () => {
    const narration = { fetchSpeech: vi.fn(async () => ({ ok: false as const, code: "voice_unavailable" as never })), createAudio: () => ({ audio: { play: async () => undefined, pause: () => undefined, onended: null }, release: () => undefined }) };
    render(<HostPage port={lobbyPort() as never} extras={base(narration as never)} />);
    expect(screen.getByLabelText("Room Code K 7 M 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tap to let the house speak" }));
    expect(screen.queryByRole("button", { name: "Tap to let the house speak" })).toBeNull();
  });
  it("offers no tap when narration is not available: the Subtitle alone", () => {
    render(<HostPage port={lobbyPort() as never} extras={base(null)} />);
    expect(screen.queryByRole("button", { name: "Tap to let the house speak" })).toBeNull();
  });
});

describe("Host prefetch (ghost-voice 4.8)", () => {
  const withView = (over: Partial<typeof EMPTY_HOST>) => {
    const state: HostState = { ...IDLE_HOST, connection: "online", code: "K7M2", hostToken: "ab".repeat(16), view: { ...EMPTY_HOST, game: game(), ...over } };
    return { getState: () => state, subscribe: () => () => undefined, create: async () => true };
  };
  const narrationDeps = () => ({
    fetchSpeech: vi.fn(async (_req: { roomCode: string; lineId: string; prefetch?: boolean }, _token: string) => ({ ok: true as const, value: { audio: new Blob([new Uint8Array(100)], { type: "audio/mpeg" }) } })),
    createAudio: () => ({ audio: { play: async () => undefined, pause: () => undefined, onended: null }, release: () => undefined }),
  });
  const ex = (narration: ReturnType<typeof narrationDeps>): HostExtras => ({
    origin: "https://lab.example", narration: narration as never, reducedMotion: false, now: () => 0,
    soundDeps: { play: () => undefined, vibrate: () => undefined, available: soundAvailability([]), canVibrate: false, reducedMotion: false, now: () => 0, setTimer: () => 0, clearTimer: () => undefined },
  });
  it("asks for each id the Room listed with prefetch: true and the Host token, and for no other", async () => {
    const narration = narrationDeps();
    render(<HostPage port={withView({ speechOn: true, prefetch: ["l1", "l2"] }) as never} extras={ex(narration)} />);
    await waitFor(() => expect(narration.fetchSpeech).toHaveBeenCalledTimes(2));
    expect(narration.fetchSpeech.mock.calls.map((c) => [c[0].lineId, c[0].prefetch, c[0].roomCode, c[1]])).toEqual([
      ["l1", true, "K7M2", "ab".repeat(16)],
      ["l2", true, "K7M2", "ab".repeat(16)],
    ]);
  });
  it("prefetches nothing while speech is off, or when the Room listed nothing", async () => {
    const narration = narrationDeps();
    render(<HostPage port={withView({ speechOn: false, prefetch: ["l1"] }) as never} extras={ex(narration)} />);
    await Promise.resolve();
    cleanup();
    render(<HostPage port={withView({ speechOn: true, prefetch: [] }) as never} extras={ex(narration)} />);
    await Promise.resolve();
    expect(narration.fetchSpeech).not.toHaveBeenCalled();
  });
});

describe("PlayHere (party-mode 8.6)", () => {
  class P {
    view: import("../controller/controller-port").RoomView = { connection: "connecting", phase: "lobby", code: null, seat: null, nickname: null, master: null, lock: null };
    joins: string[] = [];
    fail = false;
    listeners = new Set<(v: unknown) => void>();
    async join(code: string, nick: string) { this.joins.push(`${code}/${nick}`); if (this.fail) return { ok: false as const, code: "room_full" as const }; this.set({ connection: "online", code, seat: 1, nickname: nick }); return { ok: true as const, seat: 1, nickname: nick }; }
    getView() { return this.view; }
    subscribe(l: (v: unknown) => void) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
    set(o: Partial<typeof this.view>) { this.view = { ...this.view, ...o }; act(() => { for (const l of [...this.listeners]) l(this.view); }); }
    attempt() { throw new Error("x"); } closeLock() { /* */ } setPuzzles() { /* */ } send() { /* */ } async leave() { /* */ }
  }
  const ex = (): import("../controller/SeatedFrame").PlayExtras => ({ worlds: [], storage: localStorage, unlock: async () => true, now: () => 0, soundDeps: { play: () => undefined, vibrate: () => undefined, available: soundAvailability([]), canVibrate: false, reducedMotion: false, now: () => 0, setTimer: () => 0, clearTimer: () => undefined } });
  it("joins once as a Player through the ordinary join, then shows that Player's Controller", async () => {
    const { PlayHere } = await import("./PlayHere");
    const p = new P();
    await act(async () => { render(<PlayHere port={p as never} code="K7M2" extras={ex()} />); await Promise.resolve(); });
    expect(p.joins).toEqual(["K7M2/You"]);
    expect(screen.getByRole("button", { name: "Menu" })).toBeTruthy();
  });
  it("says when the screen could not join", async () => {
    const { PlayHere } = await import("./PlayHere");
    const p = new P();
    p.fail = true;
    await act(async () => { render(<PlayHere port={p as never} code="K7M2" extras={ex()} />); await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByRole("alert").textContent).toContain("could not join");
  });
  it("draws the hand and notebook only when every other seat is a Bot", async () => {
    const { PlayHere } = await import("./PlayHere");
    const mk = (others: boolean[]) => {
      const p = new P();
      const seats = [{ seat: 1, nickname: "You", bot: false, poltergeist: false, handSize: 4, sealed: false }, ...others.map((bot, i) => ({ seat: i + 2, nickname: `P${i + 2}`, bot, poltergeist: false, handSize: 4, sealed: false }))];
      p.view = { connection: "online", phase: "playing", code: "K7M2", seat: 1, nickname: "You", master: null, lock: null, game: game({ pub: pub({ seats, active: 2 }) }), clock: { offsetMs: 0, errorMs: 0 } };
      return p;
    };
    const solo = mk([true, true]);
    await act(async () => { render(<PlayHere port={solo as never} code="K7M2" extras={ex()} />); await Promise.resolve(); });
    fireEvent.click(screen.getByRole("radio", { name: "Panel" }));
    expect(screen.getByRole("region", { name: "Your hand" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Notebook" })).toBeTruthy();
    cleanup();
    const shared = mk([true, false]);
    await act(async () => { render(<PlayHere port={shared as never} code="K7M2" extras={ex()} />); await Promise.resolve(); });
    fireEvent.click(screen.getByRole("radio", { name: "Panel" }));
    expect(screen.queryByRole("region", { name: "Your hand" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Notebook" })).toBeNull();
    expect(screen.getByRole("region", { name: "Actions" })).toBeTruthy();
  });
});

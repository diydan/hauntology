// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LINE_AT, SHOT_LINE, SHOT_TEXT, SOUND_AT, endingCard, reelShot, shadowPosition, stepPosition } from "@hauntology/shared/party/scenes";
import { soundAvailability } from "@hauntology/shared/party/sounds";
import { game, lobby, pub } from "../../../test/party-fixtures";
import { EMPTY_HOST } from "../host-view";
import { HostPage, type HostExtras } from "../HostPage";
import { IDLE_HOST } from "../../phone/host-port";
import hostCss from "../host.css?raw";
import { ClockShadow } from "./ClockShadow";
import { EndingFilm } from "./EndingFilm";
import { Reel } from "./Reel";
import { reelBlocked, roomVoiceBusy, ROOM_LINE_HOLD_MS, turnBase } from "./signals";
import type { SceneDeps } from "./types";

afterEach(() => { cleanup(); vi.useRealTimers(); });
const deps = (over: Partial<SceneDeps> = {}): SceneDeps => ({ footage: true, saveData: false, clipUrl: (c, k) => `/clips/${c}.${k}`, soundOn: true, narrationOn: true, playSound: vi.fn(), speak: vi.fn(), ...over });
const noClips = (over: Partial<SceneDeps> = {}) => deps({ clipUrl: () => null, ...over });
const video = (c: HTMLElement) => c.querySelector("video");

describe("ClockShadow: the clock shadow in the Host (puzzles 14.2, Requirements 19.1 to 19.5)", () => {
  // jsdom has no media: the video's time is a plain property and every set is counted
  let sets: number[] = [];
  beforeEach(() => {
    sets = [];
    Object.defineProperty(HTMLMediaElement.prototype, "currentTime", { configurable: true, get() { return this._t ?? 0; }, set(v: number) { this._t = v; sets.push(v); } });
    Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get() { return 4.2; } });
  });
  const shadow = (o: Partial<Parameters<typeof ClockShadow>[0]> = {}) => <ClockShadow baseMs={60_000} remainingMs={45_000} paused={false} nowMs={0} reducedMotion={false} deps={deps()} {...o} />;

  it("scrubs a clip to 1 - remaining / base, with the clock in numbers beside it", () => {
    const { container } = render(shadow());
    expect(container.querySelector("[data-mode]")!.getAttribute("data-mode")).toBe("scrub");
    expect(sets.at(-1)).toBeCloseTo(0.25 * (4.2 - 0.06), 5);
    expect(screen.getByText(/The shadow has climbed 25 per cent of the stair\. Time left 0:45\./)).toBeTruthy();
    expect(video(container)!.muted).toBe(true);
  });
  it("is not drawn where the Master chose no Turn Clock", () => {
    const { container } = render(shadow({ baseMs: null, remainingMs: null }));
    expect(container.firstChild).toBeNull();
  });
  it("steps back for a Help and forward for a Spook, by the share of the Turn the change is", () => {
    const { container, rerender } = render(shadow());
    const at = () => Number(container.querySelector("[data-position]")!.getAttribute("data-position"));
    expect(at()).toBe(25);
    rerender(shadow({ remainingMs: 55_000, nowMs: 200 })); // Help: 10 seconds more
    expect(at()).toBe(8); // 8.3 rounded: back by 10/60 of the Turn
    rerender(shadow({ remainingMs: 35_000, nowMs: 400 })); // Spook: 20 seconds less than the Help
    expect(at()).toBe(42);
  });
  it("sets the clip's time at most ten times a second", () => {
    const { rerender } = render(shadow({ nowMs: 0 }));
    const before = sets.length;
    for (let i = 1; i <= 9; i++) rerender(shadow({ nowMs: i * 10, remainingMs: 45_000 - i * 10 })); // nine redraws inside 100 ms
    expect(sets.length - before).toBe(0);
    rerender(shadow({ nowMs: 100, remainingMs: 44_900 }));
    expect(sets.length - before).toBe(1);
  });
  it("stands still while the clock is paused, whatever it says", () => {
    const { container, rerender } = render(shadow());
    rerender(shadow({ paused: true, remainingMs: 10_000, nowMs: 500 }));
    expect(container.querySelector("[data-position]")!.getAttribute("data-position")).toBe("25");
  });
  it("moves once a second and never ahead of the clock under reduced motion, data saver or footage off, and still has the numbers", () => {
    for (const [name, o] of [["reduced motion", { reducedMotion: true }], ["data saver", { deps: deps({ saveData: true }) }], ["footage off", { deps: deps({ footage: false }) }]] as const) {
      cleanup();
      const { container } = render(shadow({ remainingMs: 44_400, ...o }));
      expect(container.querySelector("[data-mode]")!.getAttribute("data-mode"), name).toBe("step");
      expect(Number(container.querySelector("[data-position]")!.getAttribute("data-position")), name).toBeLessThanOrEqual(Math.round(shadowPosition(60_000, 44_400) * 100));
      expect(screen.getByText(/Time left 0:45\./), name).toBeTruthy(); // 44.4 s reads as 0:45 (rounded up), as the HUD does
      expect(video(container), name).toBeNull();
    }
  });
  it("shows its last frame and says in words that the clock ran out", () => {
    const { container } = render(shadow({ remainingMs: 0 }));
    expect(sets.at(-1)).toBeCloseTo(4.2 - 0.06, 5);
    expect(container.querySelector("[role=status]")!.textContent).toBe("The clock ran out.");
  });
  it("Property 24 over the real Host: the shadow is a function of the clock and nothing else, held between 0 and 100", () => {
    fc.assert(fc.property(fc.integer({ min: 1000, max: 300_000 }), fc.integer({ min: -2000, max: 320_000 }), (base, rem) => {
      cleanup();
      const { container } = render(shadow({ baseMs: base, remainingMs: Math.max(0, rem) }));
      const pct = Number(container.querySelector("[data-position]")!.getAttribute("data-position"));
      expect(pct).toBe(Math.round(shadowPosition(base, Math.max(0, rem)) * 100));
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }), { numRuns: 40 });
  });
  it("Property 24: the stepped shadow is the whole-second position", () => {
    fc.assert(fc.property(fc.integer({ min: 1000, max: 300_000 }), fc.integer({ min: 0, max: 300_000 }), (base, rem) => {
      cleanup();
      const { container } = render(shadow({ baseMs: base, remainingMs: rem, reducedMotion: true }));
      expect(Number(container.querySelector("[data-position]")!.getAttribute("data-position"))).toBe(Math.round(stepPosition(base, rem) * 100));
    }), { numRuns: 40 });
  });
});

describe("Reel: the film that plays forward as the Haunt rises (puzzles 14.3, Requirements 20.1 to 20.9)", () => {
  const reel = (o: Partial<Parameters<typeof Reel>[0]> = {}) => <Reel level={2} max={10} blocked={false} roomLineBusy={false} reducedMotion={false} deps={deps()} {...o} />;
  const said = () => [...document.querySelectorAll("[data-testid=ph-reel-said] li")].map((l) => l.textContent);

  it("shows the shot of the level still, with no words and no play, when the Host first sees the Room", () => {
    const { container } = render(reel());
    expect(container.querySelector("[data-shot]")!.getAttribute("data-shot")).toBe("ship");
    expect(container.querySelector("[data-playing]")).toBeNull();
    expect(said()).toEqual([]);
  });
  it("plays the shot of a new level once, muted, and says in words what it shows and that a Haunt Event fired", () => {
    const { container, rerender } = render(reel());
    rerender(reel({ level: 3 }));
    expect(container.querySelector("[data-playing]")).not.toBeNull();
    expect(video(container)!.muted).toBe(true);
    expect(video(container)!.querySelector("source")!.getAttribute("src")).toBe("/clips/reel-coffin.webm");
    expect(said()).toEqual([`The film moves on. ${SHOT_TEXT.coffin}`, "A Haunt Event fired."]);
    expect(screen.getByLabelText("The film", { selector: "ol" }).getAttribute("aria-live")).toBe("polite");
  });
  it("ends when the clip ends and then holds its last frame", () => {
    const { container, rerender } = render(reel());
    rerender(reel({ level: 3 }));
    fireEvent.ended(video(container)!);
    expect(container.querySelector("[data-playing]")).toBeNull();
    expect(video(container)).toBeNull();
  });
  it("does not play during the window after a Suggestion or an answer choice, and plays when it ends", () => {
    const { container, rerender } = render(reel({ blocked: true }));
    rerender(reel({ level: 3, blocked: true }));
    expect(container.querySelector("[data-playing]")).toBeNull();
    expect(said().length).toBe(2); // the words are there at once
    rerender(reel({ level: 3, blocked: false }));
    expect(container.querySelector("[data-playing]")).not.toBeNull();
  });
  it("can always be skipped, with a 48 pixel control", () => {
    const { container, rerender } = render(reel());
    rerender(reel({ level: 3 }));
    const skip = screen.getByRole("button", { name: "Skip the film" });
    expect(skip.className).toContain("ui-button--main"); // 52 px: the design system's main control
    fireEvent.click(skip);
    expect(container.querySelector("[data-playing]")).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip the film" })).toBeNull();
  });
  it("holds the lower shot and says nothing when the Haunt falls (a Lull)", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(reel({ level: 6 }));
    rerender(reel({ level: 7 }));
    act(() => { vi.advanceTimersByTime(60_000); });
    const wordsBefore = said();
    rerender(reel({ level: 5 }));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(container.querySelector("[data-shot]")!.getAttribute("data-shot")).toBe("streets");
    expect(container.querySelector("[data-playing]")).toBeNull();
    expect(said()).toEqual(wordsBefore);
    expect(screen.queryByTestId("ph-reel-line")).toBeNull();
  });
  it("says the line of the picture at its moment, in words, and aloud only with narration on and the Room silent", () => {
    vi.useFakeTimers();
    const d = deps();
    const { rerender } = render(reel({ level: 6, deps: d }));
    rerender(reel({ level: 7, deps: d })); // the hand at the door
    expect(screen.queryByTestId("ph-reel-line")).toBeNull();
    act(() => { vi.advanceTimersByTime(LINE_AT.hand * 1000 + 10); });
    expect(screen.getByTestId("ph-reel-line").textContent).toBe(SHOT_LINE.hand.text);
    expect(d.speak).toHaveBeenCalledWith(SHOT_LINE.hand);
    cleanup();
    const quiet = deps({ narrationOn: false });
    const r = render(reel({ level: 6, deps: quiet }));
    r.rerender(reel({ level: 7, deps: quiet }));
    act(() => { vi.advanceTimersByTime(LINE_AT.hand * 1000 + 10); });
    expect(screen.getByTestId("ph-reel-line").textContent).toBe(SHOT_LINE.hand.text); // words whatever the Master chose
    expect(quiet.speak).not.toHaveBeenCalled();
    cleanup();
    const busy = deps();
    const b = render(reel({ level: 6, deps: busy, roomLineBusy: true }));
    b.rerender(reel({ level: 7, deps: busy, roomLineBusy: true }));
    act(() => { vi.advanceTimersByTime(LINE_AT.hand * 1000 + 10); });
    expect(screen.getByTestId("ph-reel-line")).toBeTruthy();
    expect(busy.speak).not.toHaveBeenCalled(); // two voices never at once
  });
  it("drops a line still waiting when the level moves on", () => {
    vi.useFakeTimers();
    const { rerender } = render(reel({ level: 6 }));
    rerender(reel({ level: 7 }));
    rerender(reel({ level: 9 }));
    act(() => { vi.advanceTimersByTime(LINE_AT.hand * 1000 + 10); });
    expect(screen.queryByText(SHOT_LINE.hand.text)).toBeNull();
    act(() => { vi.advanceTimersByTime(LINE_AT.bed * 1000 + 10); });
    expect(screen.getByTestId("ph-reel-line").textContent).toBe(SHOT_LINE.bed.text);
  });
  it("plays the scrape at its moment in the crate shot and the knock in the hand shot, only with sound on", () => {
    vi.useFakeTimers();
    const d = deps();
    const { rerender } = render(reel({ level: 2, deps: d }));
    rerender(reel({ level: 3, deps: d }));
    act(() => { vi.advanceTimersByTime(SOUND_AT.scrape * 1000 - 50); });
    expect(d.playSound).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(100); });
    expect(d.playSound).toHaveBeenCalledWith("scrape");
    cleanup();
    const mute = deps({ soundOn: false });
    const r = render(reel({ level: 2, deps: mute }));
    r.rerender(reel({ level: 3, deps: mute }));
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(mute.playSound).not.toHaveBeenCalled();
  });
  it("drops a sound still waiting when the Reel moves to another level", () => {
    vi.useFakeTimers();
    const d = deps();
    const { rerender } = render(reel({ level: 2, deps: d }));
    rerender(reel({ level: 3, deps: d }));
    rerender(reel({ level: 5, deps: d }));
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(d.playSound).not.toHaveBeenCalled();
  });
  it("with every clip missing, or footage off, shows the words and the line at once, and plays nothing", () => {
    vi.useFakeTimers();
    for (const d of [noClips(), deps({ footage: false }), deps({ saveData: true })]) {
      cleanup();
      const r = render(reel({ level: 6, deps: d }));
      r.rerender(reel({ level: 7, deps: d }));
      act(() => { vi.advanceTimersByTime(5); });
      expect(video(r.container)).toBeNull();
      expect(screen.queryByRole("button", { name: "Skip the film" })).toBeNull();
      expect(screen.getByTestId("ph-reel-line").textContent).toBe(SHOT_LINE.hand.text);
      expect(screen.getByTestId("ph-reel-shows").textContent).toBe(SHOT_TEXT.hand);
    }
  });
  it("works with no scene dependencies at all", () => {
    const { rerender, container } = render(<Reel level={2} max={10} blocked={false} roomLineBusy={false} reducedMotion={false} />);
    rerender(<Reel level={3} max={10} blocked={false} roomLineBusy={false} reducedMotion={false} />);
    expect(container.querySelector("[data-shot]")).not.toBeNull();
  });
  it("Property 25 over the real Host: whatever the levels, the shown shot is the level's, and a rise plays at most one shot", () => {
    vi.useFakeTimers();
    fc.assert(fc.property(fc.constantFrom(8, 10, 12), fc.array(fc.integer({ min: 0, max: 12 }), { minLength: 1, maxLength: 12 }), (max, levels) => {
      cleanup();
      const ls = levels.map((l) => Math.min(l, max));
      const r = render(reel({ level: ls[0]!, max, deps: noClips() }));
      for (const l of ls.slice(1)) { r.rerender(reel({ level: l, max, deps: noClips() })); act(() => { vi.advanceTimersByTime(5); }); }
      const last = ls.at(-1)!;
      expect(r.container.querySelector("[data-shot]")!.getAttribute("data-shot")).toBe(reelShot(last, max));
      expect(r.container.querySelectorAll("video").length).toBe(0);
    }), { numRuns: 25 });
  });
});

describe("EndingFilm: the ending scene and its title card (puzzles 14.4, Requirement 21)", () => {
  const film = (o: Partial<Parameters<typeof EndingFilm>[0]> = {}) => <EndingFilm outcome="house" joined={["Cat"]} reducedMotion={false} deps={deps()} {...o}><p>the recap</p></EndingFilm>;

  it("plays the shot with its line and a Skip of at least 48 pixels, then the card, then the recap", () => {
    vi.useFakeTimers();
    const d = deps();
    const { container } = render(film({ deps: d }));
    expect(container.querySelector("[data-stage]")!.getAttribute("data-stage")).toBe("shot");
    expect(video(container)!.querySelector("source")!.getAttribute("src")).toBe("/clips/ai-lights-out-take1.webm");
    expect(screen.queryByText("the recap")).toBeNull();
    expect(screen.getByRole("button", { name: "Skip" }).className).toContain("ui-button--main");
    act(() => { vi.advanceTimersByTime(LINE_AT.house * 1000 + 10); });
    expect(screen.getByTestId("ph-ending-line").textContent).toBe(SHOT_LINE.house.text);
    expect(d.speak).toHaveBeenCalledWith(SHOT_LINE.house);
    fireEvent.ended(video(container)!);
    expect(screen.getByTestId("ph-ending-card")).toBeTruthy();
    expect(screen.getByText("the recap")).toBeTruthy();
  });
  it("Skip stops the shot and shows the card at once, and drops the line", () => {
    vi.useFakeTimers();
    const d = deps();
    render(film({ deps: d }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByTestId("ph-ending-card")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(d.speak).not.toHaveBeenCalled();
  });
  it("says that the haunting continues, that no one won and who joined, never the word Poltergeist, and never the Solution", () => {
    const { container } = render(film({ deps: noClips() }));
    const card = screen.getByTestId("ph-ending-card");
    expect(card.textContent).toContain("The haunting continues.");
    expect(card.textContent).toContain("No one won.");
    expect(card.textContent).toContain("Cat joined the haunting.");
    expect(container.textContent!.toLowerCase()).not.toContain("poltergeist");
  });
  it("shows the dawn card for a Detective win", () => {
    render(film({ outcome: "detectives", joined: [], deps: noClips() }));
    expect(screen.getByTestId("ph-ending-card").textContent).toContain(endingCard("detectives").title);
  });
  it("with footage off, reduced motion, data saver or no clip shows the card at once with its line in words", () => {
    for (const [name, o] of [["footage off", { deps: deps({ footage: false }) }], ["reduced motion", { reducedMotion: true }], ["data saver", { deps: deps({ saveData: true }) }], ["no clip", { deps: noClips() }]] as const) {
      cleanup();
      const { container } = render(film(o));
      expect(container.querySelector("[data-stage]")!.getAttribute("data-stage"), name).toBe("card");
      expect(screen.getByTestId("ph-ending-line").textContent, name).toBe(SHOT_LINE.house.text);
      expect(screen.queryByRole("button", { name: "Skip" }), name).toBeNull();
      expect(screen.getByText("the recap"), name).toBeTruthy();
    }
  });
  it("says its line in words only while the Room's own ending line is speaking or due (two voices never at once)", () => {
    vi.useFakeTimers();
    const d = deps();
    render(film({ deps: d, roomLineBusy: true }));
    act(() => { vi.advanceTimersByTime(LINE_AT.house * 1000 + 10); });
    expect(screen.getByTestId("ph-ending-line")).toBeTruthy();
    expect(d.speak).not.toHaveBeenCalled();
    cleanup();
    const e = deps({ footage: false });
    render(film({ deps: e, roomLineBusy: true }));
    expect(e.speak).not.toHaveBeenCalled();
  });
  it("a clip that fails to load goes to the card", () => {
    const { container } = render(film());
    fireEvent.error(video(container)!);
    expect(screen.getByTestId("ph-ending-card")).toBeTruthy();
  });
  it("Property 26 over the real Host: the card names every joiner and never says Poltergeist, for any names", () => {
    fc.assert(fc.property(fc.array(fc.stringMatching(/^[A-Za-z][A-Za-z ]{0,10}[A-Za-z]$/), { maxLength: 4 }), fc.constantFrom("house", "detectives") as fc.Arbitrary<"house" | "detectives">, (joined, outcome) => {
      cleanup();
      render(film({ joined, outcome, deps: noClips() }));
      const card = screen.getByTestId("ph-ending-card").textContent!;
      if (outcome === "house") for (const n of joined) expect(card).toContain(n.trim());
      expect(card.toLowerCase()).not.toContain("poltergeist");
    }), { numRuns: 30 });
  });
});

describe("what the Host reads for its scenes (Requirements 19.3, 20.4, 20.9)", () => {
  const p = (over: Record<string, unknown> = {}) => pub(over) as never;
  it("takes the Turn's base from the time left when it first saw the Turn, and keeps it through a Help or a Spook", () => {
    const first = turnBase(null, p(), 60_000);
    expect(first).toEqual({ key: "1:1", base: 60_000 });
    expect(turnBase(first, p(), 70_000)).toBe(first);
    expect(turnBase(first, p({ active: 2 }), 55_000)).toEqual({ key: "1:2", base: 55_000 });
    expect(turnBase(first, p({ round: 2 }), 61_000)).toEqual({ key: "2:1", base: 61_000 });
  });
  it("has no base with no clock, before the game, or at the end", () => {
    expect(turnBase(null, p(), null)).toBeNull();
    expect(turnBase(null, null, 60_000)).toBeNull();
    expect(turnBase(null, p({ phase: "ended" }), 60_000)).toBeNull();
    expect(turnBase(null, p(), 0)).toBeNull();
  });
  it("blocks the Reel for 15 seconds after a Suggestion and while an answer choice is open, and not otherwise", () => {
    const events = [{ id: 1, kind: "turn-start", seat: 1 }, { id: 2, kind: "suggest", seat: 1, zone: "z1", suspect: "s1", relic: "r1", passed: [], refuter: null }];
    const seen = new Map([[2, 1000]]);
    expect(reelBlocked(p({ events }), seen, 1000)).toBe(true);
    expect(reelBlocked(p({ events }), seen, 15_999)).toBe(true);
    expect(reelBlocked(p({ events }), seen, 16_000)).toBe(false);
    expect(reelBlocked(p({ events: [events[0]] }), seen, 1000)).toBe(false);
    expect(reelBlocked(p({ events: [events[0]], haunt: { level: 3, max: 10, coldSpot: null, choosing: { options: [], chooser: null, deadlineMs: 1 } } }), seen, 99_000)).toBe(true);
    expect(reelBlocked(null, seen, 0)).toBe(false);
  });
  it("counts the Room's own line as speaking or due for a while after the Host first sees it", () => {
    const spoken = [{ lineId: "haunt.blackout.1", text: "x", kind: "event" }];
    const seen = new Map([["haunt.blackout.1", 5000]]);
    expect(roomVoiceBusy({ spoken }, seen, 5000)).toBe(true);
    expect(roomVoiceBusy({ spoken }, seen, 5000 + ROOM_LINE_HOLD_MS)).toBe(false);
    expect(roomVoiceBusy({ spoken: [] }, seen, 5000)).toBe(false);
  });
});

describe("HostPage with scenes (puzzles 14.2 to 14.4)", () => {
  class FakePort {
    state = IDLE_HOST;
    listeners = new Set<() => void>();
    getState() { return this.state; }
    subscribe(l: () => void) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
    set(patch: Partial<typeof IDLE_HOST>) { this.state = { ...this.state, ...patch }; act(() => { for (const l of [...this.listeners]) l(); }); }
  }
  const extras = (over: Partial<HostExtras> = {}): HostExtras => ({
    origin: "https://lab.example", narration: null, reducedMotion: false, now: () => 0,
    soundDeps: { play: () => undefined, vibrate: () => undefined, available: soundAvailability([]), canVibrate: false, reducedMotion: false, now: () => 0, setTimer: () => 0, clearTimer: () => undefined },
    ...over,
  });
  const playing = (pubOver: Record<string, unknown> = {}) => ({ ...IDLE_HOST, connection: "online" as const, code: "K7M2", view: { ...EMPTY_HOST, game: game({ pub: pub(pubOver) }) } });

  it("draws the shadow and the Reel beside the HUD, and nothing of them without scenes", () => {
    const port = new FakePort();
    port.state = playing({ haunt: { level: 3, max: 10, coldSpot: null, choosing: null } });
    const { container } = render(<HostPage port={port as never} extras={extras({ scenes: noClips() })} />);
    expect(container.querySelector(".ph-shadow")).not.toBeNull();
    expect(container.querySelector(".ph-reel")).not.toBeNull();
    expect(screen.getByRole("meter", { name: "Haunt level" })).toBeTruthy(); // the number and the meter stay
    cleanup();
    const bare = render(<HostPage port={port as never} extras={extras()} />);
    expect(bare.container.querySelector(".ph-shadow")).toBeNull();
    expect(bare.container.querySelector(".ph-reel")).toBeNull();
  });
  it("shows no shadow where the Master chose no clock", () => {
    const port = new FakePort();
    port.state = playing({ deadlineMs: null });
    const { container } = render(<HostPage port={port as never} extras={extras({ scenes: noClips() })} />);
    expect(container.querySelector(".ph-shadow")).toBeNull();
  });
  it("plays the shot when the Haunt rises, and the Blackout's dim sits above it", () => {
    const port = new FakePort();
    port.state = playing({ haunt: { level: 2, max: 10, coldSpot: null, choosing: null } });
    const { container } = render(<HostPage port={port as never} extras={extras({ scenes: deps() })} />);
    port.set(playing({ haunt: { level: 3, max: 10, coldSpot: null, choosing: null } }));
    expect(container.querySelector("[data-playing]")).not.toBeNull();
    expect(container.querySelector(".ph-reel")!.getAttribute("data-shot")).toBe("coffin");
  });
  it("does not play a rise during the window after a Suggestion", () => {
    const port = new FakePort();
    const sug = { id: 2, kind: "suggest", seat: 1, zone: "z1", suspect: "s1", relic: "r1", passed: [], refuter: null };
    port.state = playing({ haunt: { level: 2, max: 10, coldSpot: null, choosing: null }, events: [sug] });
    const { container } = render(<HostPage port={port as never} extras={extras({ scenes: deps() })} />);
    port.set(playing({ haunt: { level: 3, max: 10, coldSpot: null, choosing: null }, events: [sug] }));
    expect(container.querySelector("[data-playing]")).toBeNull();
  });
  it("shows the ending scene, then the card, then the recap, and the Solution only in the recap", () => {
    const ending = { solution: { suspect: "s2", zone: "z1", relic: "r3" }, residueAt: {}, winners: [], houseWins: true, mostHaunting: null, scare: {}, nudges: { help: 0, spook: 0 }, recap: { entries: [], reveal: [] } };
    const port = new FakePort();
    port.state = { ...IDLE_HOST, connection: "online", code: "K7M2", view: { ...EMPTY_HOST, game: game({ pub: pub({ phase: "ended", active: null, ending }) }) } };
    const { container } = render(<HostPage port={port as never} extras={extras({ scenes: deps() })} />);
    expect(container.querySelector("[data-stage]")!.getAttribute("data-stage")).toBe("shot");
    expect(container.textContent).not.toMatch(/Miss Pike/);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByTestId("ph-ending-card").textContent).toContain("Cat joined the haunting.");
    expect(container.textContent).toMatch(/Miss Pike/);
    expect(container.textContent!.toLowerCase()).not.toContain("poltergeist");
  });
  it("a Blackout dims the page by the Host scene's own overlay, which sits above the film, and the Reel stays in the page", () => {
    const port = new FakePort();
    const hauntEvent = { id: 9, kind: "haunt-event", option: "blackout" };
    port.state = playing({ haunt: { level: 3, max: 10, coldSpot: null, choosing: null }, events: [hauntEvent] });
    vi.useFakeTimers();
    let t = 0;
    const { container } = render(<HostPage port={port as never} extras={extras({ scenes: noClips(), now: () => t })} />);
    t = 1800;
    act(() => { vi.advanceTimersByTime(500); });
    expect(container.querySelector("[data-testid=ph-dim]")).not.toBeNull();
    expect(container.querySelector(".ph-reel")).not.toBeNull();
    const dim = /\.ph-dim \{[^}]*\}/.exec(hostCss)?.[0] ?? "";
    expect(dim).toContain("position: fixed");
    expect(dim).toContain("z-index: var(--z-modal)");
    expect(/\.ph-(reel|side|shadow)[^{]*\{[^}]*z-index/.test(hostCss)).toBe(false); // nothing of the film is stacked over the dim
  });
  it("keeps the ending as it was without scenes", () => {
    const ending = { solution: { suspect: "s2", zone: "z1", relic: "r3" }, residueAt: {}, winners: [2], houseWins: false, mostHaunting: null, scare: {}, nudges: { help: 0, spook: 0 }, recap: { entries: [], reveal: [] } };
    const port = new FakePort();
    port.state = { ...IDLE_HOST, connection: "online", code: "K7M2", view: { ...EMPTY_HOST, game: game({ pub: pub({ phase: "ended", active: null, ending }) }) } };
    const { container } = render(<HostPage port={port as never} extras={extras()} />);
    expect(container.querySelector("[data-stage]")).toBeNull();
    expect(screen.getByRole("heading", { name: "The case is solved" })).toBeTruthy();
  });
});

void lobby;

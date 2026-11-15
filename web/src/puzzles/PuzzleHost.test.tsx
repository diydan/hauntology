// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import { fadedFor } from "@hauntology/shared/puzzles/sight";
import type { Kind, Transcript } from "@hauntology/shared/puzzles/types";
import { createFakeFeel } from "./feel/fakes";
import { PuzzleHost, type AttemptReply, type PuzzleHostProps } from "./PuzzleHost";
import { stubGeometry, wait } from "./test-utils";

let restore = (): void => {};
beforeEach(() => { restore = stubGeometry(); });
afterEach(() => { cleanup(); restore(); });

function host(kind: Kind = "clock", over: Partial<PuzzleHostProps> = {}) {
  const lock = makeLock(kind, "easy", 4);
  const feel = createFakeFeel();
  const attempts: Transcript[] = [];
  const onAttempt = vi.fn((t: Transcript): AttemptReply => { attempts.push(t); return { outcome: "wrong", attemptsLeft: 2 }; });
  const props: PuzzleHostProps = {
    kind, view: lock.view, faded: null, capMs: 25_000, attempts: 3, feel, assist: false, reducedMotion: false,
    onAttempt, onGiveUp: vi.fn(), ...over,
  };
  const utils = render(<PuzzleHost {...props} />);
  return { ...utils, feel, attempts, props, onAttempt };
}
const screenReady = async (kind: Kind): Promise<void> => {
  if (kind === "clock") await screen.findByRole("application", { name: "Clock to set" });
  else await screen.findByText(/not built yet|screen/i).catch(() => undefined);
};
const send = async (): Promise<void> => {
  await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Set this time" })); });
};

describe("PuzzleHost", () => {
  it("loads the Kind's screen when needed, with three tries shown and a live status line", async () => {
    host("clock");
    await screenReady("clock");
    expect(screen.getByRole("img", { name: "3 of 3 tries left" })).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Give up" })).toBeTruthy();
  });

  it("sends the Transcript with the kind and the elapsed time added", async () => {
    let t = 1000;
    const h = host("clock", { now: () => t });
    await screenReady("clock");
    t = 6500;
    await send();
    expect(h.attempts).toHaveLength(1);
    expect(h.attempts[0]).toMatchObject({ kind: "clock", h: 12, m: 0, elapsedMs: 5500 });
  });

  it("a wrong Attempt buzzes, zaps, counts a try and says only how many are left", async () => {
    const h = host("clock");
    await screenReady("clock");
    await send();
    expect(h.feel.haptics.buzzes).toContain("buzz");
    expect(h.feel.synth.played).toContain("zap");
    expect(screen.getByRole("status").textContent).toBe("Not right. 2 tries left.");
    expect(screen.getByRole("img", { name: "2 of 3 tries left" })).toBeTruthy();
    expect(screen.queryByText("Done")).toBeNull();
  });

  it("a solved Attempt shows Opened and Done reports the reply", async () => {
    const onFinish = vi.fn();
    const h = host("clock", { onAttempt: () => ({ outcome: "solved" }), onFinish });
    await screenReady("clock");
    await send();
    expect(screen.getByText("Opened", { selector: ".pz-result-title" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(""); // not said a second time on screen
    expect(document.querySelector(".pz-sr")?.textContent).toBe("Opened."); // but said to a screen reader
    expect(h.feel.haptics.buzzes).toContain("thunk");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onFinish).toHaveBeenCalledWith({ outcome: "solved" });
    expect(screen.queryByRole("button", { name: "Give up" })).toBeNull();
  });

  it("a failed Lock shows nothing came loose", async () => {
    const onFinish = vi.fn();
    host("clock", { onAttempt: () => ({ outcome: "failed", reason: "attempts" }), onFinish });
    await screenReady("clock");
    await send();
    expect(screen.getByText("Nothing came loose", { selector: ".pz-result-title" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("");
    expect(document.querySelector(".pz-sr")?.textContent).toBe("Nothing came loose.");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onFinish).toHaveBeenCalledWith({ outcome: "failed", reason: "attempts" });
  });

  it("sends one Attempt at a time, and says so when it did not go through", async () => {
    let release: (r: AttemptReply) => void = () => {};
    const onAttempt = vi.fn((): Promise<AttemptReply> => new Promise((r) => { release = r; }));
    host("clock", { onAttempt });
    await screenReady("clock");
    const button = await screen.findByRole("button", { name: "Set this time" });
    await act(async () => { fireEvent.click(button); fireEvent.click(button); });
    expect(onAttempt).toHaveBeenCalledTimes(1);
    await act(async () => { release({ outcome: "wrong", attemptsLeft: 1 }); });
    expect(screen.getByRole("status").textContent).toBe("Not right. 1 try left.");
    cleanup();
    const failing = vi.fn(() => Promise.reject<AttemptReply>(new Error("net")));
    host("clock", { onAttempt: failing });
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Set this time" })); });
    expect(screen.getByRole("status").textContent).toMatch(/did not go through/i);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Set this time" })); });
    expect(failing).toHaveBeenCalledTimes(2); // it can be tried again
  });

  it("shows the faded clue first, and starts the clock only after it closes", async () => {
    const lock = makeLock("clock", "easy", 4);
    const faded = fadedFor(lock);
    if (!faded) throw new Error("faded");
    let t = 0;
    host("clock", { faded, now: () => t });
    expect(screen.getByRole("dialog", { name: "A faded memory…" })).toBeTruthy();
    expect(screen.queryByRole("application")).toBeNull();
    t = 50_000; // a long time passes behind the clue
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    await screenReady("clock");
    expect(screen.queryByRole("dialog")).toBeNull();
    t = 53_000;
    const attempts: Transcript[] = [];
    cleanup();
    host("clock", { faded, now: () => t, onAttempt: (x) => { attempts.push(x); return { outcome: "wrong", attemptsLeft: 2 }; } });
    t = 60_000;
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    await screenReady("clock");
    t = 62_000;
    await send();
    expect(attempts[0]?.elapsedMs).toBe(2000); // counted from the Lock, not from the clue
  });

  it("calls onTimeUp once when the Cap runs out, and shows the timer", async () => {
    let t = 0;
    const onTimeUp = vi.fn();
    host("clock", { capMs: 500, onTimeUp, now: () => t });
    await screenReady("clock");
    t = 200;
    await wait(300);
    expect(onTimeUp).not.toHaveBeenCalled();
    t = 900;
    await wait(300);
    await wait(300);
    expect(onTimeUp).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".pz-timer")?.textContent).toMatch(/Time .*s of 1 s/);
  });

  it("has no clock text of a Cap in Wander, and offers Skip after two wrong Attempts", async () => {
    const onSkip = vi.fn();
    host("clock", { capMs: null, onSkip });
    await screenReady("clock");
    expect(screen.queryByText(/ \/ /)).toBeNull();
    expect(screen.queryByRole("button", { name: "Let the ghost open it" })).toBeNull();
    await send();
    await send();
    fireEvent.click(screen.getByRole("button", { name: "Let the ghost open it" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("gives up on request", async () => {
    const h = host("clock");
    await screenReady("clock");
    fireEvent.click(screen.getByRole("button", { name: "Give up" }));
    expect(h.props.onGiveUp).not.toHaveBeenCalled(); // it asks first, so a stray tap near Use tilt costs nothing
    expect(screen.getByText(/Give up on this lock\? Nothing will open\. The time you used still counts\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep playing" }));
    expect(screen.queryByText(/Give up on this lock/)).toBeNull();
    expect(h.props.onGiveUp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Give up" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, give up" }));
    expect(h.props.onGiveUp).toHaveBeenCalledTimes(1);
  });

  it("says nothing about the clock when the Lock has no clock (Wander), and keeps Give up apart from the tilt controls", async () => {
    host("lockpick", { capMs: null });
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole("button", { name: "Give up" }));
    expect(screen.getByText(/Nothing will open\.$/)).toBeTruthy();
    const play = document.querySelector(".pz-foot");
    const give = document.querySelector(".pz-give");
    expect(play?.contains(screen.getByRole("button", { name: "Use tilt" }))).toBe(true);
    expect(play?.contains(screen.getByRole("button", { name: "Yes, give up" }))).toBe(false);
    expect(give?.contains(screen.getByRole("button", { name: "Yes, give up" }))).toBe(true);
  });

  it("names the tries and the time, so the dots and the counter explain themselves", async () => {
    host("clock");
    await screenReady("clock");
    expect(document.querySelector(".pz-tries")?.textContent).toMatch(/Tries/);
    expect(document.querySelector(".pz-timer")?.textContent).toMatch(/^Time /);
  });

  it("keeps what a screen says to a screen reader out of the visible status, which holds the host's own messages", async () => {
    host("safe");
    await screen.findByRole("application", { name: "Safe dial" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Set" })); });
    expect(document.querySelector(".pz-sr")?.textContent).toMatch(/Digit 1 of 3 set to 0/);
    expect(screen.getByRole("status").textContent).toBe(""); // the screen's own text is not drawn a second time
    expect(document.querySelector(".pz-sr")?.getAttribute("aria-live")).toBe("polite");
    const h = host("clock", { onAttempt: () => ({ outcome: "wrong", attemptsLeft: 2 }) });
    await screenReady("clock");
    await send();
    expect(screen.getAllByRole("status").at(-1)?.textContent).toBe("Not right. 2 tries left.");
    h.unmount();
  });

  it("shows the visual twin of a buzz and of a muted sound, and glows only without reduced motion", async () => {
    const h = host("clock");
    await screenReady("clock");
    await act(async () => { h.feel.haptics.buzz("tick"); });
    expect(screen.getByText("Buzz: tick")).toBeTruthy();
    expect(document.querySelector(".pz-host")?.className).toMatch(/pz-glow-/);
    cleanup();
    const quiet = host("clock", { reducedMotion: true });
    await screenReady("clock");
    quiet.feel.synth.state = "locked";
    await act(async () => { quiet.feel.synth.play("click"); });
    expect(screen.getByText("♪ click · sound is off")).toBeTruthy();
    await act(async () => { quiet.feel.haptics.buzz("thunk"); });
    expect(document.querySelector(".pz-host")?.className).not.toMatch(/pz-glow-/);
  });

  it("stops the microphone when the Lock closes", async () => {
    const h = host("clock");
    await screenReady("clock");
    h.feel.breath.state = "on";
    h.unmount();
    expect(h.feel.breath.state).toBe("off");
  });
});

describe("PuzzleHost keeps the screen awake while the Lock is open", () => {
  function stubWakeLock() {
    const state = { requests: 0, released: 0 };
    const request = vi.fn(() => { state.requests++; return Promise.resolve({ release: () => { state.released++; return Promise.resolve(); } }); });
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
    return state;
  }
  afterEach(() => { Reflect.deleteProperty(navigator, "wakeLock"); });
  const flush = async (): Promise<void> => { await act(async () => { await Promise.resolve(); }); };

  it("asks once when the Lock appears and lets go when it unmounts", async () => {
    const wl = stubWakeLock();
    const { unmount } = host("clock");
    await screenReady("clock");
    await flush();
    expect(wl.requests).toBe(1);
    expect(wl.released).toBe(0);
    unmount();
    expect(wl.released).toBe(1);
  });

  it("does not hold the screen during the faded clue, takes it when the Lock starts, and lets go at the result", async () => {
    const wl = stubWakeLock();
    const lock = makeLock("clock", "easy", 4);
    const faded = fadedFor(lock, false);
    if (faded === null) throw new Error("clock has a Sight");
    host("clock", { faded });
    await flush();
    expect(wl.requests).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    await screenReady("clock");
    await flush();
    expect(wl.requests).toBe(1);
  });

  it("lets go once the Lock is solved", async () => {
    const wl = stubWakeLock();
    host("clock", { onAttempt: () => ({ outcome: "solved" }) });
    await screenReady("clock");
    await flush();
    expect(wl.requests).toBe(1);
    await send();
    await flush();
    expect(wl.released).toBe(1);
  });
});

describe("PuzzleHost and the clue", () => {
  const sightOf = (kind: Kind) => {
    const lock = makeLock(kind, "easy", 4);
    const sight = fadedFor(lock, false);
    if (sight === null) throw new Error("memory kind");
    return sight;
  };

  it("offers the clue again only with Assist on, shows it, keeps the puzzle where it was, and goes back to it", async () => {
    const clue = sightOf("clock");
    const off = host("clock", { clue, assist: false });
    await screenReady("clock");
    expect(screen.queryByRole("button", { name: "See the clue again" })).toBeNull();
    off.unmount();

    host("clock", { clue, assist: true });
    await screenReady("clock");
    fireEvent.click(screen.getByRole("button", { name: "Hour forward" }));
    expect(screen.getByRole("img", { name: "The clock shows 1:00" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "See the clue again" }));
    const dialog = screen.getByRole("dialog", { name: "The clue" });
    expect(within(dialog).getByRole("img", { name: /A stopped clock showing/ })).toBeTruthy();
    expect(within(dialog).getByText("The clock keeps running.")).toBeTruthy();
    expect((document.querySelector(".pz-stage") as HTMLElement).hidden).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Back to the puzzle" }));
    expect(screen.queryByRole("dialog", { name: "The clue" })).toBeNull();
    expect((document.querySelector(".pz-stage") as HTMLElement).hidden).toBe(false);
    expect(screen.getByRole("img", { name: "The clock shows 1:00" })).toBeTruthy(); // the Player's work was kept
  });

  it("offers no clue to look at when the Lock has none, even with Assist on, and says nothing of a clock in Wander", async () => {
    host("clock", { assist: true });
    await screenReady("clock");
    expect(screen.queryByRole("button", { name: "See the clue again" })).toBeNull();
    cleanup();
    host("clock", { clue: sightOf("clock"), assist: true, capMs: null });
    await screenReady("clock");
    fireEvent.click(screen.getByRole("button", { name: "See the clue again" }));
    expect(screen.queryByText("The clock keeps running.")).toBeNull();
  });
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeLock } from "@hauntology/shared/puzzles/make";
import { fadedFor } from "@hauntology/shared/puzzles/sight";
import { KINDS, type Kind, type Transcript } from "@hauntology/shared/puzzles/types";
import { createFakeFeel } from "./feel/fakes";
import { COMMON_HELP, KIND_HELP } from "./help";
import { PuzzleHost, type AttemptReply, type PuzzleHostProps } from "./PuzzleHost";
import { stubCanvas, stubGeometry, wait } from "./test-utils";

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

  it("a door has Skip at once, says door, and an ordinary Lock still waits", async () => {
    const onSkip = vi.fn();
    host("clock", { capMs: null, onSkip, door: true });
    await screenReady("clock");
    expect(screen.queryByRole("button", { name: "Let the ghost open it" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Skip the door" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Give up" }));
    expect(screen.getByText(/Give up on this door\?/)).toBeTruthy();
  });

  it("gives up on request", async () => {
    const h = host("clock");
    await screenReady("clock");
    fireEvent.click(screen.getByRole("button", { name: "Give up" }));
    expect(h.props.onGiveUp).not.toHaveBeenCalled(); // it asks first, so a stray tap near Use tilt costs nothing
    expect(screen.getByText(/Give up on this lock\? Nothing will open\. The time you used still counts\./)).toBeTruthy();
    const keep = screen.getByRole("button", { name: "Keep playing" });
    const yes = screen.getByRole("button", { name: "Yes, give up" });
    expect(keep.parentElement).toBe(yes.parentElement); // side by side in one row, not stacked
    expect(keep.parentElement?.className).toMatch(/pz-grid2/);
    expect([...(keep.parentElement?.children ?? [])]).toEqual([keep, yes]);
    fireEvent.click(keep);
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
    const give = document.querySelector(".pz-give");
    expect(give?.contains(screen.getByRole("button", { name: "Yes, give up" }))).toBe(true);
  });

  it("puts what the hosting page gives it (the Controller's Menu) in its own bar after the time, and has no extra box when it is given nothing", () => {
    const { container, unmount } = host("clock", { barExtra: <button type="button">Menu</button> });
    const bar = container.querySelector("header.pz-bar-row") as HTMLElement;
    const right = bar.querySelector(".pz-bar-right") as HTMLElement;
    expect([...right.children].map((c) => c.className)).toEqual(["pz-timer", "pz-bar-extra"]); // the time, then the extra
    expect(right.querySelector(".pz-bar-extra")?.textContent).toBe("Menu");
    expect(bar.querySelector(".pz-bar-left")).not.toBeNull(); // the ? and the tries stay where they were
    unmount();
    const plain = host("clock");
    expect(plain.container.querySelector(".pz-bar-right")).toBeNull();
    expect(plain.container.querySelector("header.pz-bar-row > .pz-timer")).not.toBeNull();
  });

  it("puts Tilt in the puzzle, in one row with the puzzle's own buttons, and Give up alone outside it", async () => {
    const unstub = stubCanvas();
    for (const [kind, mine] of [["lockpick", "Tension (hold)"], ["words", "Clear"], ["board", "Clear"], ["maze", null]] as const) {
      const feel = createFakeFeel();
      feel.motion.wish = false; // tilt would start by itself: this test is about the button
      const onTiltChoice = vi.fn();
      host(kind, { feel, onTiltChoice });
      await screenReady(kind);
      const tilt = screen.getByRole("button", { name: "Tilt" });
      expect(tilt.getAttribute("aria-pressed")).toBe("false");
      expect(document.querySelector(".pz-stage")?.contains(tilt)).toBe(true);
      expect(document.querySelector(".pz-foot")?.contains(tilt)).toBe(false);
      if (mine !== null) expect(screen.getByRole("button", { name: mine }).parentElement).toBe(tilt.parentElement);
      expect(document.querySelector(".pz-stage")?.contains(screen.getByRole("button", { name: "Give up" }))).toBe(false);
      await act(async () => { fireEvent.click(tilt); await Promise.resolve(); });
      expect(feel.motion.state, kind).toBe("on");
      const on = screen.getByRole("button", { name: "Tilt: on" });
      expect(on.getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("button", { name: "Hold level" }).parentElement).toBe(on.parentElement);
      await act(async () => { fireEvent.click(on); });
      expect(feel.motion.state).not.toBe("on");
      expect(onTiltChoice.mock.calls).toEqual([[true], [false]]); // the Player's choice goes to the device's settings
      cleanup();
    }
    host("safe");
    await screenReady("safe");
    expect(screen.queryByRole("button", { name: /^Tilt/ })).toBeNull(); // a Kind that does not steer with tilt has no Tilt button
    unstub();
  }, 20_000);

  it("keeps a line for the buzz and sound twin even when there is none, so the buttons below never jump", async () => {
    const h = host("clock");
    await screenReady("clock");
    const line = document.querySelector(".pz-twin");
    expect(line).toBeTruthy();
    expect(line?.textContent).toBe("");
    await act(async () => { h.feel.haptics.buzz("tick"); });
    expect(document.querySelector(".pz-twin")).toBe(line); // the same element, filled in
    expect(line?.textContent).toBe("Buzz: tick");
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

describe("PuzzleHost turns tilt on by itself where the phone has a sensor", () => {
  const SENSOR = ["lockpick", "words", "board", "maze", "safe", "clock"] as const;
  const NO_SENSOR = ["candles", "wires", "moved", "musicbox", "photo"] as const;
  let unstub = (): void => {};
  beforeEach(() => { unstub = stubCanvas(); });
  afterEach(() => { unstub(); });
  const settle = async (): Promise<void> => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

  it("starts tilt when the Lock opens, for the four tilt Kinds and the Safe and the Clock, with no tap", async () => {
    for (const kind of SENSOR) {
      const h = host(kind);
      await screenReady(kind);
      await settle();
      expect(h.feel.motion.autoCalls, kind).toEqual([false]);
      expect(h.feel.motion.state, kind).toBe("on");
      if (kind === "safe" || kind === "clock") expect(screen.getByRole("button", { name: "Twist: on" }), kind).toBeTruthy();
      else expect(screen.getByRole("button", { name: "Tilt: on" }), kind).toBeTruthy();
      cleanup();
    }
  }, 30_000);

  it("never asks for a Kind that has no use for the sensor, not even from a tap", async () => {
    for (const kind of NO_SENSOR) {
      const h = host(kind);
      await screenReady(kind);
      await settle();
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Give up" })); });
      expect(h.feel.motion.autoCalls, kind).toEqual([]);
      expect(h.feel.motion.enabled, kind).toBe(0);
      expect(h.feel.motion.state, kind).toBe("off");
      cleanup();
    }
  }, 30_000);

  it("asks from the first tap where the phone must be asked (an iPhone), and not before", async () => {
    const feel = createFakeFeel();
    feel.motion.needsTap = true;
    host("lockpick", { feel });
    await screenReady("lockpick");
    await settle();
    expect(feel.motion.autoCalls).toEqual([false]);
    expect(feel.motion.state).toBe("off"); // nothing asked outside a tap
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "How this puzzle works" })); });
    expect(feel.motion.autoCalls).toEqual([false, true]); // the first tap asks
    expect(feel.motion.state).toBe("on");
  });

  it("asks inside the tap that ends the faded clue, and not while the clue shows", async () => {
    const lock = makeLock("safe", "easy", 4);
    const faded = fadedFor(lock);
    if (!faded) throw new Error("faded");
    const feel = createFakeFeel();
    feel.motion.needsTap = true;
    host("safe", { faded, feel });
    await settle();
    expect(feel.motion.autoCalls).toEqual([]); // the clue is showing: no Lock yet
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Got it" })); });
    await screenReady("safe");
    await settle();
    expect(feel.motion.autoCalls[0]).toBe(true); // the tap that starts the Lock
    expect(feel.motion.state).toBe("on");
    expect(screen.getByRole("button", { name: "Twist: on" })).toBeTruthy();
  });

  it("stays off once the Player turned tilt off, under Touch only, and after they pressed the Tilt button off", async () => {
    const wish = createFakeFeel();
    wish.motion.wish = false;
    host("maze", { feel: wish });
    await screenReady("maze");
    await settle();
    expect(wish.motion.state).toBe("off");
    expect(wish.motion.enabled).toBe(0);
    cleanup();

    const touch = createFakeFeel();
    touch.motion.touchOnly = true;
    host("maze", { feel: touch });
    await screenReady("maze");
    await settle();
    expect(touch.motion.enabled).toBe(0);
    cleanup();

    const feel = createFakeFeel();
    const onTiltChoice = vi.fn();
    host("maze", { feel, onTiltChoice });
    await screenReady("maze");
    await settle();
    expect(feel.motion.state).toBe("on");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Tilt: on" })); });
    expect(onTiltChoice).toHaveBeenLastCalledWith(false);
    expect(feel.motion.state).toBe("off");
    await act(async () => { fireEvent.click(document.querySelector(".pz-stage") as Element); }); // another tap in the Lock
    await settle();
    expect(feel.motion.state).toBe("off"); // it does not start again by itself
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Tilt" })); }); // the Player turns it on, on purpose
    expect(feel.motion.state).toBe("on");
    expect(onTiltChoice).toHaveBeenLastCalledWith(true);
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

describe("PuzzleHost help", () => {
  const helpButton = (): HTMLElement => screen.getByRole("button", { name: "How this puzzle works" });

  it("has a ? on every puzzle that opens a card for that Kind, and shuts the puzzle away behind it", async () => {
    for (const kind of KINDS) {
      const h = host(kind);
      expect(helpButton().textContent, kind).toBe("?");
      expect(helpButton().getAttribute("aria-expanded"), kind).toBe("false");
      fireEvent.click(helpButton());
      const dialog = screen.getByRole("dialog", { name: `How ${KIND_HELP[kind].title} works` });
      for (const step of KIND_HELP[kind].steps) expect(within(dialog).getByText(step), `${kind}: ${step}`).toBeTruthy();
      for (const extra of KIND_HELP[kind].extras) expect(within(dialog).getByText(extra), `${kind}: ${extra}`).toBeTruthy();
      for (const line of COMMON_HELP) expect(within(dialog).getByText(line)).toBeTruthy();
      expect(helpButton().getAttribute("aria-expanded"), kind).toBe("true");
      expect((document.querySelector(".pz-stage") as HTMLElement).hidden, kind).toBe(true);
      h.unmount();
    }
  });

  it("lists the phone extras under a heading that says they are optional, only for a Kind that has some", async () => {
    host("candles");
    fireEvent.click(helpButton());
    expect(screen.getByRole("heading", { name: "Phone extras (all optional)" })).toBeTruthy();
    cleanup();
    host("clock");
    fireEvent.click(helpButton());
    expect(screen.getByRole("heading", { name: "Phone extras (all optional)" })).toBeTruthy(); // Twist
  });

  it("keeps the puzzle where it was, says the clock keeps running (with a clock only), and closes with its button, the ? or Escape", async () => {
    host("clock");
    await screenReady("clock");
    fireEvent.click(screen.getByRole("button", { name: "Hour forward" }));
    fireEvent.click(helpButton());
    expect(screen.getByText("The clock keeps running while you read this.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to the puzzle" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((document.querySelector(".pz-stage") as HTMLElement).hidden).toBe(false);
    expect(screen.getByRole("img", { name: "The clock shows 1:00" })).toBeTruthy(); // the Player's work was kept
    expect(document.activeElement).toBe(helpButton()); // focus goes back to the ?
    fireEvent.click(helpButton());
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(helpButton()); // the ? toggles
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(helpButton());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" }); // nothing open: nothing happens
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();
    host("clock", { capMs: null });
    fireEvent.click(helpButton());
    expect(screen.queryByText(/The clock keeps running/)).toBeNull();
  });

  it("moves focus into the card when it opens", async () => {
    host("clock");
    fireEvent.click(helpButton());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Back to the puzzle" }));
  });

  it("shows the help and the clue one at a time", async () => {
    const lock = makeLock("clock", "easy", 4);
    const clue = fadedFor(lock, false);
    if (clue === null) throw new Error("clock has a Sight");
    host("clock", { clue, assist: true });
    await screenReady("clock");
    fireEvent.click(screen.getByRole("button", { name: "See the clue again" }));
    expect(screen.getByRole("dialog", { name: "The clue" })).toBeTruthy();
    fireEvent.click(helpButton());
    expect(screen.queryByRole("dialog", { name: "The clue" })).toBeNull();
    expect(screen.getByRole("dialog", { name: /^How .* works$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "See the clue again" }));
    expect(screen.queryByRole("dialog", { name: /^How .* works$/ })).toBeNull();
    expect(screen.getByRole("dialog", { name: "The clue" })).toBeTruthy();
  });

  it("is still there after a wrong answer and at the result", async () => {
    host("clock", { onAttempt: () => ({ outcome: "solved" }) });
    await screenReady("clock");
    expect(helpButton()).toBeTruthy();
    await send();
    expect(helpButton()).toBeTruthy();
  });
});

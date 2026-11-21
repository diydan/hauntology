// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { game, lobby, priv, pub } from "../../../test/party-fixtures";
import { HauntingPanel } from "./Haunting";
import { LobbyPanel } from "./LobbyPanel";
import { MasterMenu } from "./MasterMenu";
import { Pad, usePadInput } from "./Pad";
import { SoundLightSettings } from "./PlayerSettings";
import { RelicScanner } from "./RelicScanner";
import { StitchPanel } from "./StitchPanel";
import { TableControls } from "./TableControls";
import { delayFor, lightLevel, soundOf, usePhoneSound, type SoundDeps } from "./phone-sound";
import { PhoneEffects } from "./PhoneEffects";
import { soundAvailability } from "@hauntology/shared/party/sounds";

afterEach(() => { cleanup(); vi.useRealTimers(); });
const text = (el: HTMLElement): string => el.textContent ?? "";
const WORLDS = [{ id: "kitchen", name: "The kitchen", walkRadius: 9, authoredZones: false }, { id: "closet", name: "The closet", walkRadius: 5, authoredZones: false }];

describe("HauntingPanel (party-mode 9.12, 9.19)", () => {
  const haunting = (rattle: { allowed: boolean; on: boolean }, scare = 2) => game({ priv: priv({ seat: 3, rattle, scare }), pub: pub({ active: 1 }) });
  it("says you are haunting now, shows only your own scare points, and offers Rattle first as an opt-in", async () => {
    const send = vi.fn();
    const motion = vi.fn(async () => "granted" as const);
    render(<HauntingPanel game={haunting({ allowed: true, on: false })} send={send} sensors onMotion={motion} />);
    expect(screen.getByRole("heading", { name: "You are haunting now" })).toBeTruthy();
    expect(text(screen.getByText(/Your scare points/))).toContain("2");
    fireEvent.click(screen.getByRole("button", { name: "Turn on Rattle" }));
    await waitFor(() => expect(send).toHaveBeenCalledWith({ t: "rattleOn", on: true }));
    expect(motion).toHaveBeenCalledTimes(1); // the permission is asked from the tap
  });
  it("with Rattle on, offers the hold-to-rattle button and says shake works after the motion is granted; a phone with no sensors uses the button", async () => {
    const send = vi.fn();
    const { rerender } = render(<HauntingPanel game={haunting({ allowed: true, on: true })} send={send} sensors={false} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Hold to rattle" }));
    expect(send).toHaveBeenCalledWith({ t: "rattle", via: "button" });
    expect(screen.getByText("Use the button to rattle the house.")).toBeTruthy();
    rerender(<HauntingPanel game={haunting({ allowed: true, on: true })} send={send} sensors />);
    fireEvent.click(screen.getByRole("button", { name: "Turn Rattle off" }));
    expect(send).toHaveBeenLastCalledWith({ t: "rattleOn", on: false });
  });
  it("says the Master turned Rattle off and offers nothing, and shows nothing to a Detective", () => {
    const { container, rerender } = render(<HauntingPanel game={haunting({ allowed: false, on: false })} send={() => undefined} sensors />);
    expect(screen.getByText("The Master turned Rattle off.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Turn on Rattle" })).toBeNull();
    rerender(<HauntingPanel game={game()} send={() => undefined} sensors />);
    expect(container.firstChild).toBeNull();
  });
  it("a shake (three swings in 1.5 s) from the motion sensor sends one Rattle", async () => {
    const send = vi.fn();
    const target = new EventTarget();
    // render with the sensors granted by an 'unneeded' permission so the shake listener is live
    const { useShake } = await import("../../phone/sensors");
    function Probe(): null { useShake(true, () => send({ t: "rattle", via: "shake" }), target, () => clock); return null; }
    let clock = 0;
    render(<Probe />);
    const swing = (a: number): void => { clock += 200; target.dispatchEvent(Object.assign(new Event("devicemotion"), { acceleration: { x: a, y: 0, z: 0 } })); };
    swing(20); swing(-20); expect(send).not.toHaveBeenCalled();
    swing(20);
    expect(send).toHaveBeenCalledTimes(1);
    swing(20); // a single bump after it does not repeat
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("MasterMenu (party-mode 9.10, 9.15, 9.21)", () => {
  const lobbyG = (over: Record<string, unknown> = {}, started = false) => game({ pub: null, priv: null, lobby: lobby({ started, worldId: null, ...over }) });
  it("is shown to the Master only", () => {
    const { container, rerender } = render(<MasterMenu game={lobbyG()} me={2} send={() => undefined} worlds={WORLDS} />);
    expect(container.firstChild).toBeNull();
    rerender(<MasterMenu game={lobbyG()} me={1} send={() => undefined} worlds={WORLDS} />);
    expect(screen.getByRole("region", { name: "Master controls" })).toBeTruthy();
  });
  it("chooses the world, and says so when the Room refuses it as too small; Start waits for a world and two players", () => {
    const send = vi.fn();
    const { rerender } = render(<MasterMenu game={lobbyG()} me={1} send={send} worlds={WORLDS} />);
    expect((screen.getByRole("button", { name: "Start the game" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Choose a place first.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("World"), { target: { value: "kitchen" } });
    expect(send).toHaveBeenCalledWith({ t: "world", id: "kitchen", walkRadius: 9, authoredZones: false });
    rerender(<MasterMenu game={{ ...lobbyG(), refusal: { code: "world_too_small", n: 1 } }} me={1} send={send} worlds={WORLDS} />);
    expect(screen.getByRole("alert").textContent).toContain("too small");
    rerender(<MasterMenu game={lobbyG({ worldId: "kitchen" })} me={1} send={send} worlds={WORLDS} />);
    fireEvent.click(screen.getByRole("button", { name: "Start the game" }));
    expect(send).toHaveBeenLastCalledWith({ t: "start" });
  });
  it("sends the presets and each separate switch as the Room's own settings", () => {
    const send = vi.fn();
    render(<MasterMenu game={lobbyG({ worldId: "kitchen" })} me={1} send={send} worlds={WORLDS} />);
    const radio = (group: string, name: string) => fireEvent.click(within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", { name }));
    radio("Preset", "Gentle");
    radio("Time per turn", "No clock");
    radio("Time per turn", "45 s");
    radio("Haunt maximum", "12");
    radio("Nudges", "Help only");
    radio("Bot level", "Gentle");
    radio("Sky", "A place");
    fireEvent.click(screen.getByRole("switch", { name: /Frames/ }));
    fireEvent.click(screen.getByRole("switch", { name: /Allow phone sounds/ }));
    fireEvent.click(screen.getByRole("switch", { name: /Auto-cross/ }));
    fireEvent.click(screen.getByRole("switch", { name: /Hour strike/ }));
    fireEvent.click(screen.getByRole("switch", { name: /Light bar/ }));
    fireEvent.click(screen.getByRole("switch", { name: /Rattle/ }));
    fireEvent.click(screen.getByRole("switch", { name: /Stitch/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add a Bot" }));
    expect(send.mock.calls.map((c) => c[0])).toEqual([
      { t: "settings", preset: "gentle" }, { t: "settings", baseSeconds: null }, { t: "settings", baseSeconds: 45 }, { t: "settings", hauntMax: 12 }, { t: "settings", nudges: "help-only" },
      { t: "settings", botLevel: "gentle" }, { t: "roomSettings", conditions: "place" }, { t: "settings", frames: false }, { t: "settings", sounds: false }, { t: "settings", autoCross: true },
      { t: "roomSettings", hourStrike: false }, { t: "roomSettings", lightBar: false }, { t: "roomSettings", rattle: false }, { t: "roomSettings", stitch: true }, { t: "stitchSetting", on: true }, { t: "addBot" },
    ]);
  });
  it("shows the voice's own controls only while it is on, and the recap skip only at the end", () => {
    const send = vi.fn();
    const { rerender } = render(<MasterMenu game={game()} me={1} send={send} worlds={WORLDS} />);
    expect(screen.queryByRole("group", { name: "The house's voice" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Skip the recap/ })).toBeNull();
    rerender(<MasterMenu game={{ ...game(), speechOn: true }} me={1} send={send} worlds={WORLDS} />);
    const voice = within(screen.getByRole("group", { name: "The house's voice" }));
    for (const action of ["Mute", "Unmute", "Replay", "Skip"]) fireEvent.click(voice.getByRole("button", { name: action }));
    expect(send.mock.calls.map((c) => c[0])).toEqual(["mute", "unmute", "replay", "skip"].map((action) => ({ t: "speech", action })));
    expect((screen.getByRole("switch", { name: /Spoken narration/ })).getAttribute("aria-checked")).toBe("true");
    rerender(<MasterMenu game={game({ pub: pub({ phase: "ended" }) })} me={1} send={send} worlds={WORLDS} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip the recap on the big screen" }));
    expect(send).toHaveBeenLastCalledWith({ t: "recapSkip" });
  });
  it("in a game offers Pause or Resume, hand-over to another human only, End for everyone, and Play again after the end; the clock and Haunt maximum no longer change", () => {
    const send = vi.fn();
    const { rerender } = render(<MasterMenu game={game()} me={1} send={send} worlds={WORLDS} />);
    expect(screen.queryByRole("radiogroup", { name: "Time per turn" })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Haunt maximum" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(send).toHaveBeenLastCalledWith({ t: "pause" });
    rerender(<MasterMenu game={game({ pub: pub({ paused: true }) })} me={1} send={send} worlds={WORLDS} />);
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(send).toHaveBeenLastCalledWith({ t: "resume" });
    const hand = screen.getByLabelText("Hand the Master role to") as HTMLSelectElement;
    expect([...hand.options].map((o) => o.textContent)).toEqual(["Hand over to…", "Ben", "Cat"]); // no Bot, not yourself
    fireEvent.change(hand, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Hand over" }));
    expect(send).toHaveBeenLastCalledWith({ t: "handOver", seat: 2 });
    fireEvent.click(screen.getByRole("button", { name: "End the game for everyone" }));
    expect(send).toHaveBeenLastCalledWith({ t: "end" });
    rerender(<MasterMenu game={game({ pub: pub({ phase: "ended" }) })} me={1} send={send} worlds={WORLDS} />);
    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    expect(send).toHaveBeenLastCalledWith({ t: "playAgain" });
  });
});

describe("TableControls (party-mode 9.16)", () => {
  it("sends a Cue to the screen or this phone, Help and Spook with their cost, and a Frame to another human", () => {
    const send = vi.fn();
    render(<TableControls game={game({ pub: pub({ active: 2 }), priv: priv({ resolve: 2 }) })} me={1} send={send} />);
    fireEvent.click(screen.getByRole("radio", { name: "A small bell rings" }));
    fireEvent.click(screen.getByRole("button", { name: "Play it" }));
    expect(send).toHaveBeenLastCalledWith({ t: "cue", cue: "bell", place: "tv" });
    fireEvent.click(screen.getByRole("radio", { name: "On my phone" }));
    fireEvent.click(screen.getByRole("button", { name: "Play it" }));
    expect(send).toHaveBeenLastCalledWith({ t: "cue", cue: "bell", place: "phone" });
    fireEvent.click(screen.getByRole("button", { name: "Help (+10 s, costs 1)" }));
    expect(send).toHaveBeenLastCalledWith({ t: "nudge", kind: "help" });
    fireEvent.click(screen.getByRole("button", { name: "Spook (−10 s, costs 2)" }));
    expect(send).toHaveBeenLastCalledWith({ t: "nudge", kind: "spook" });
    const frame = screen.getByLabelText("Player") as HTMLSelectElement;
    expect([...frame.options].map((o) => o.textContent)).toEqual(["Choose a player", "Ben"]); // not you, not a Bot, not a haunting Player
    expect((screen.getByRole("button", { name: "Play it on their phone" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(frame, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Play it on their phone" }));
    expect(send).toHaveBeenLastCalledWith({ t: "frame", target: 2, cue: "bell" });
  });
  it("on your own turn there is no sound or Nudge to play, Spook needs 2 Resolve, and help-only has no Spook", () => {
    const { rerender } = render(<TableControls game={game({ priv: priv({ resolve: 1 }) })} me={1} send={() => undefined} />);
    expect((screen.getByRole("button", { name: "Play it" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("You cannot play a sound on your own turn.")).toBeTruthy();
    rerender(<TableControls game={game({ pub: pub({ active: 2 }), priv: priv({ resolve: 1 }) })} me={1} send={() => undefined} />);
    expect((screen.getByRole("button", { name: "Help (+10 s, costs 1)" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Spook (−10 s, costs 2)" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<TableControls game={game({ pub: pub({ active: 2 }), lobby: lobby({ settings: { nudges: "help-only" } }) })} me={1} send={() => undefined} />);
    expect(screen.queryByRole("button", { name: /Spook/ })).toBeNull();
    rerender(<TableControls game={game({ pub: pub({ active: 2 }), lobby: lobby({ settings: { nudges: "off", frames: false } }) })} me={1} send={() => undefined} />);
    expect(screen.queryByText("Change the clock")).toBeNull();
    expect(screen.queryByText("Frame a friend")).toBeNull();
  });
  it("says in words why the Room refused, and offers no Nudges or Frames to a solo player", () => {
    const { rerender } = render(<TableControls game={game({ pub: pub({ active: 2 }), refusal: { code: "nudge_denied:spook_round_limit", n: 1 } })} me={1} send={() => undefined} />);
    expect(screen.getByRole("alert").textContent).toContain("A Spook was already used this round.");
    rerender(<TableControls game={game({ pub: pub({ active: 2 }) })} me={1} send={() => undefined} offersNudges={false} offersFrames={false} />);
    expect(screen.queryByText("Change the clock")).toBeNull();
    expect(screen.queryByText("Frame a friend")).toBeNull();
  });
});

describe("StitchPanel (party-mode 9.20)", () => {
  const stitchG = (extra: Record<string, unknown> = {}) => game({ lobby: lobby({ switches: { stitch: true } }), ...extra });
  it("asks nothing until the Master turned Stitch on", () => {
    const { container } = render(<StitchPanel game={game()} send={() => undefined} />);
    expect(container.firstChild).toBeNull();
  });
  it("asks in plain words with the tick, sends the Player's own answer, and offers the words only after yes and the tick", () => {
    const send = vi.fn();
    render(<StitchPanel game={stitchG()} send={send} record={async () => null} />);
    expect(screen.getByRole("heading", { name: "Let the ghost whisper in your voice?" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Record the word/ })).toBeNull();
    fireEvent.click(screen.getByLabelText("Yes, you may use my voice"));
    expect(send).toHaveBeenLastCalledWith({ t: "stitchAnswer", yes: true, tick: false });
    expect(screen.queryByRole("button", { name: /Record the word/ })).toBeNull();
    fireEvent.click(screen.getByLabelText("I am 16 or older, or a parent or guardian is saying yes for me"));
    expect(send).toHaveBeenLastCalledWith({ t: "stitchAnswer", yes: true, tick: true });
    expect(screen.getAllByRole("button", { name: /Record the word/ })).toHaveLength(12);
  });
  it("records a word, sends it as base64 at most 2 s, and says in words when the word was not heard; a phone that cannot record says so", async () => {
    const send = vi.fn();
    const rec = vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3, 4]), contentType: "audio/webm", durationMs: 2600 }));
    const { rerender } = render(<StitchPanel game={stitchG()} send={send} record={rec} />);
    fireEvent.click(screen.getByLabelText("Yes, you may use my voice"));
    fireEvent.click(screen.getByLabelText(/16 or older/));
    fireEvent.click(screen.getByRole("button", { name: "Record the word here" }));
    await waitFor(() => expect(send).toHaveBeenLastCalledWith({ t: "stitchClip", word: "here", audio: "AQIDBA==", contentType: "audio/webm", durationMs: 2000 }));
    expect(rec).toHaveBeenCalledWith(2000);
    rerender(<StitchPanel game={stitchG({ stitch: { word: "here", ok: false, reason: "not_heard" } })} send={send} record={rec} />);
    expect(screen.getByRole("alert").textContent).toContain("That did not sound like the word.");
    rerender(<StitchPanel game={stitchG({ stitch: { word: "here", ok: true } })} send={send} record={rec} />);
    expect(screen.getByRole("button", { name: "Record the word here again" })).toBeTruthy();
    expect(text(screen.getByText(/1 of 12 done/))).toContain("1 of 12");
    const none = vi.fn(async () => null);
    rerender(<StitchPanel game={stitchG()} send={send} record={none} />);
    fireEvent.click(screen.getByRole("button", { name: "Record the word wait" }));
    await waitFor(() => expect(screen.getByText("This phone could not record. You can skip this.")).toBeTruthy());
  });
  it("Delete my recordings says goodbye to the Room and takes the yes back", () => {
    const send = vi.fn();
    render(<StitchPanel game={stitchG()} send={send} record={async () => null} />);
    fireEvent.click(screen.getByLabelText("Yes, you may use my voice"));
    fireEvent.click(screen.getByLabelText(/16 or older/));
    fireEvent.click(screen.getByRole("button", { name: "Delete my recordings" }));
    expect(send.mock.calls.slice(-2).map((c) => c[0])).toEqual([{ t: "stitchLeave" }, { t: "stitchAnswer", yes: false, tick: false }]);
    expect(screen.queryByRole("button", { name: /Record the word/ })).toBeNull();
  });
});

/** jsdom has no PointerEvent: a plain event carrying the fields the pad reads. */
const ptr = (type: string, el: Element, p: { pointerId: number; clientX?: number; clientY?: number }): void => { act(() => { el.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), { clientX: 0, clientY: 0, ...p })); }); };

describe("usePadInput and the pad (party-mode 9.3)", () => {
  beforeEach(() => vi.useFakeTimers());
  function Harness({ send, active = true, online = true, clock }: { send: (m: never) => void; active?: boolean; online?: boolean; clock: () => number }): React.ReactNode {
    const pad = usePadInput({ active, online, send: send as never, now: clock });
    return <div><button onClick={() => pad.stick([3, 4])}>stick</button><button onClick={() => pad.look(500, -500)}>look</button><button onClick={() => pad.look(10, 10)}>nudge</button><button onClick={pad.release}>release</button></div>;
  }
  it("sends at most 30 a second, clamps the stick and the look, folds looks that came between sends, and lets go once on release", () => {
    let t = 0;
    const send = vi.fn();
    render(<Harness send={send} clock={() => t} />);
    fireEvent.click(screen.getByText("stick"));
    fireEvent.click(screen.getByText("look"));
    fireEvent.click(screen.getByText("nudge"));
    t = 40; act(() => { vi.advanceTimersByTime(34); });
    expect(send).toHaveBeenCalledTimes(1);
    const first = send.mock.calls[0]![0] as { t: string; move: number[]; look: number[]; seq: number };
    expect(first.t).toBe("input");
    expect(Math.hypot(first.move[0]!, first.move[1]!)).toBeCloseTo(1, 5);
    expect(first.look).toEqual([60, -50]); // 60 (clamped) plus 10 folded, never past the clamp
    for (let i = 0; i < 20; i++) { t += 34; act(() => { vi.advanceTimersByTime(34); }); }
    expect(send.mock.calls.length).toBeLessThanOrEqual(22);
    const calls = send.mock.calls.length;
    fireEvent.click(screen.getByText("release"));
    expect(send.mock.calls.length).toBe(calls + 1);
    expect((send.mock.calls.at(-1)![0] as { move: number[] }).move).toEqual([0, 0]);
    t += 34; act(() => { vi.advanceTimersByTime(34); });
    expect(send.mock.calls.length).toBe(calls + 1); // idle: nothing more is sent
  });
  it("lets go when the page loses focus or hides, when the connection drops and when the turn passes", () => {
    let t = 0;
    const clock = () => t; // one clock for every render: a new one would re-make the hook and let go by itself
    const send = vi.fn();
    const { rerender } = render(<Harness send={send} clock={clock} />);
    const go = (): void => { fireEvent.click(screen.getByText("stick")); t += 40; act(() => { vi.advanceTimersByTime(34); }); };
    go();
    const base = send.mock.calls.length;
    fireEvent(window, new Event("blur"));
    expect((send.mock.calls.at(-1)![0] as { move: number[] }).move).toEqual([0, 0]);
    expect(send.mock.calls.length).toBe(base + 1);
    go();
    rerender(<Harness send={send} clock={clock} online={false} />);
    expect((send.mock.calls.at(-1)![0] as { move: number[] }).move).toEqual([0, 0]);
    rerender(<Harness send={send} clock={clock} />);
    go();
    rerender(<Harness send={send} clock={clock} active={false} />);
    expect((send.mock.calls.at(-1)![0] as { move: number[] }).move).toEqual([0, 0]);
    const n = send.mock.calls.length;
    fireEvent.click(screen.getByText("stick"));
    t += 40; act(() => { vi.advanceTimersByTime(100); });
    expect(send.mock.calls.length).toBe(n); // not the active Detective: nothing is sent
  });
  it("the stick follows one finger and releases when it lifts; a second finger on the look area does not disturb it", () => {
    let t = 0;
    const send = vi.fn();
    render(<Pad active online send={send} />);
    const stick = screen.getByTestId("pc-stick");
    const look = screen.getByTestId("pc-look");
    ptr("pointerdown", stick, { pointerId: 1, clientX: 100, clientY: 100 });
    ptr("pointermove", stick, { pointerId: 1, clientX: 156, clientY: 100 });
    ptr("pointerdown", look, { pointerId: 2, clientX: 300, clientY: 100 });
    ptr("pointermove", look, { pointerId: 2, clientX: 309, clientY: 112 });
    t += 40; act(() => { vi.advanceTimersByTime(40); });
    const m = send.mock.calls.map((c) => c[0] as { move: number[]; look: number[] });
    expect(m.some((x) => x.move[0] === 1 && x.look[0] === 3 && x.look[1] === 4)).toBe(true);
    ptr("pointerup", stick, { pointerId: 1 });
    act(() => { vi.advanceTimersByTime(40); });
    expect((send.mock.calls.at(-1)![0] as { move: number[] }).move).toEqual([0, 0]);
    void t;
  });
  it("is dark when it is not your turn", () => {
    render(<Pad active={false} online send={() => undefined} />);
    expect(screen.getAllByText("Not your turn")).toHaveLength(2);
    expect(screen.getByTestId("pc-stick").getAttribute("aria-disabled")).toBe("true");
  });
  it("tilt aim is off until a tap, asks the permission from the tap, and says so when it is refused or missing", async () => {
    vi.useRealTimers();
    const w = window as unknown as { DeviceOrientationEvent?: unknown };
    const had = w.DeviceOrientationEvent;
    w.DeviceOrientationEvent = { requestPermission: async () => "denied" };
    render(<Pad active online send={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Aim with tilt" }));
    await waitFor(() => expect(screen.getByText("Tilt is not allowed on this phone, so use the look area.")).toBeTruthy());
    w.DeviceOrientationEvent = { requestPermission: async () => "granted" };
    fireEvent.click(screen.getByRole("button", { name: "Aim with tilt" }));
    await waitFor(() => expect(screen.getByRole("switch", { name: /Aim with tilt/ }).getAttribute("aria-checked")).toBe("true"));
    delete w.DeviceOrientationEvent;
    cleanup();
    render(<Pad active online send={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Aim with tilt" }));
    await waitFor(() => expect(screen.getByText("This phone has no tilt sensor, so use the look area.")).toBeTruthy());
    if (had !== undefined) w.DeviceOrientationEvent = had;
  });
});

describe("phone sound and light (party-mode 9.14, 9.18)", () => {
  const fakeDeps = (over: Partial<SoundDeps> = {}, files = ["creak", "bell", "rumble", "wind"]): SoundDeps & { played: [string, number][]; buzzes: number[]; timers: { f: () => void; ms: number }[] } => {
    const played: [string, number][] = []; const buzzes: number[] = []; const timers: { f: () => void; ms: number }[] = [];
    return { play: (id, v) => played.push([id, v]), vibrate: (ms) => buzzes.push(ms), available: soundAvailability(files), canVibrate: true, reducedMotion: false, now: () => 1000, setTimer: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimer: () => undefined, ...over, played, buzzes, timers };
  };
  function Probe({ sounds, deps, offset = 0 }: { sounds: Parameters<typeof usePhoneSound>[0]; deps: SoundDeps; offset?: number }): React.ReactNode {
    const flashing = usePhoneSound(sounds, offset, deps);
    return <p data-testid="f">{flashing ? "flash" : "calm"}</p>;
  }
  const ev = (over: Record<string, unknown>) => ({ id: "cue-1", kind: "cue", sound: "creak", playAtMs: 1000, plan: "play", ...over }) as never;
  it("schedules a sound at the Room's time on the Room's clock, once, capped at 80 percent volume", () => {
    const d = fakeDeps();
    const { rerender } = render(<Probe sounds={[ev({ playAtMs: 3000, volume: 1 })]} deps={d} offset={500} />);
    expect(d.timers[0]!.ms).toBe(1500);
    act(() => d.timers[0]!.f());
    expect(d.played).toEqual([["creak", 0.8]]);
    rerender(<Probe sounds={[ev({ playAtMs: 3000 })]} deps={d} offset={500} />);
    expect(d.timers).toHaveLength(1); // the same cue is not scheduled again
  });
  it("drops a cue that is more than 1.5 s late or far in the future, and delay is never negative", () => {
    expect(delayFor(1000, 3000, 0)).toBeNull();
    expect(delayFor(2600, 3000, 0)).toBe(0);
    expect(delayFor(3000, 3000, 0)).toBe(0);
    expect(delayFor(99_000, 3000, 0)).toBeNull();
    expect(delayFor(Number.NaN, 3000, 0)).toBeNull();
    const d = fakeDeps();
    render(<Probe sounds={[ev({ id: "late", playAtMs: -5000 })]} deps={d} />);
    expect(d.timers).toHaveLength(0);
  });
  it("flashes and buzzes when the file is missing or the phone has no audio, never flashes under reduced motion, and plays nothing for plan none", () => {
    const flash = fakeDeps({}, ["bell"]);
    render(<Probe sounds={[ev({ sound: "creak" })]} deps={flash} />);
    expect(flash.timers[0]!.ms).toBe(0);
    act(() => flash.timers[0]!.f());
    expect(screen.getByTestId("f").textContent).toBe("flash");
    expect(flash.played).toEqual([]);
    expect(flash.buzzes).toEqual([120]);
    cleanup();
    const calm = fakeDeps({ reducedMotion: true }, ["bell"]);
    render(<Probe sounds={[ev({ plan: "flash" })]} deps={calm} />);
    act(() => calm.timers.forEach((t) => t.f()));
    expect(screen.getByTestId("f").textContent).toBe("calm");
    expect(calm.buzzes).toEqual([120]);
    cleanup();
    const none = fakeDeps();
    render(<Probe sounds={[ev({ plan: "none" })]} deps={none} />);
    expect(none.timers).toHaveLength(0);
  });
  it("rings a strike once for each hour on the dial, 1.2 s apart", () => {
    expect(soundOf({ id: "s", kind: "strike", sound: "bell-3", playAtMs: 0, plan: "play" })).toEqual({ id: "bell", rings: 3 });
    expect(soundOf({ id: "s", kind: "strike", sound: "bell-99", playAtMs: 0, plan: "play" })).toEqual({ id: "bell", rings: 12 });
    expect(soundOf({ id: "s", kind: "cue", sound: "zzz", playAtMs: 0, plan: "play" })).toEqual({ id: null, rings: 1 });
    const d = fakeDeps();
    render(<Probe sounds={[ev({ id: "st", kind: "strike", sound: "bell-3", playAtMs: 1000 })]} deps={d} />);
    expect(d.timers.map((t) => t.ms)).toEqual([0, 1200, 2400]);
  });
  it("the light bar follows the newest plan inside its time, fades between steps, stays under 0.9 and is dark under reduced motion", () => {
    const plan = { id: "l", cue: "glow", startAtMs: 1000, durationMs: 4500, steps: [{ atMs: 0, level: 0 }, { atMs: 1500, level: 0.45 }, { atMs: 4500, level: 0 }] };
    expect(lightLevel([plan], 900, 0, false)).toBe(0);
    expect(lightLevel([plan], 1000 + 1500, 0, false)).toBeCloseTo(0.45, 5);
    expect(lightLevel([plan], 1000 + 750, 0, false)).toBeCloseTo(0.225, 5);
    expect(lightLevel([plan], 1000 + 5000, 0, false)).toBe(0);
    expect(lightLevel([plan], 2500, 0, true)).toBe(0);
    expect(lightLevel([{ ...plan, steps: [{ atMs: 0, level: 5 }] }], 1100, 0, false)).toBe(0.9);
    expect(lightLevel([plan], 2500 - 100, 100, false)).toBeCloseTo(0.45, 5); // on the Room's clock
  });
  it("PhoneEffects draws the flash and the grey as hidden overlays, and the grey only when the light bar is on", () => {
    const d = fakeDeps();
    const g = game({ lights: [{ id: "l", cue: "glow", startAtMs: 0, durationMs: 4000, steps: [{ atMs: 0, level: 0.5 }] }] } as never);
    const { rerender } = render(<PhoneEffects game={g} offsetMs={0} nowMs={100} deps={d} lightOn />);
    const light = screen.getByTestId("pc-light");
    expect(light.getAttribute("aria-hidden")).toBe("true");
    expect(light.style.opacity).toBe("0.5");
    rerender(<PhoneEffects game={g} offsetMs={0} nowMs={100} deps={d} lightOn={false} />);
    expect(screen.queryByTestId("pc-light")).toBeNull();
  });
});

describe("SoundLightSettings (party-mode 9.14, 9.18)", () => {
  it("yes to sound unlocks audio from the tap and tells the Room, and says honestly when it could not", async () => {
    const send = vi.fn();
    const unlock = vi.fn(async () => true);
    const { rerender } = render(<SoundLightSettings send={send} unlock={unlock} vibrates />);
    fireEvent.click(screen.getByRole("switch", { name: /Phone sounds/ }));
    await waitFor(() => expect(send).toHaveBeenCalledWith({ t: "sound", consent: true, audio: true }));
    expect(unlock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("switch", { name: /Phone sounds/ }));
    expect(send).toHaveBeenLastCalledWith({ t: "sound", consent: false });
    rerender(<SoundLightSettings send={send} unlock={async () => false} vibrates />);
    fireEvent.click(screen.getByRole("switch", { name: /Phone sounds/ }));
    await waitFor(() => expect(send).toHaveBeenLastCalledWith({ t: "sound", consent: true, audio: false }));
    expect(screen.getByText("This phone could not start sound, so it flashes and buzzes instead.")).toBeTruthy();
  });
  it("light is its own yes, sent with the reduced-motion preference", () => {
    const send = vi.fn();
    render(<SoundLightSettings send={send} unlock={async () => true} />);
    fireEvent.click(screen.getByRole("switch", { name: /Light bar/ }));
    expect(send).toHaveBeenCalledWith({ t: "light", consent: true, reducedMotion: false });
  });
});

describe("RelicScanner (party-mode 9.7)", () => {
  it("says when the phone cannot scan, scans a Relic token, ignores a token that is not a Relic, and says when the camera is not allowed", async () => {
    const { rerender } = render(<RelicScanner onRelic={() => undefined} available={false} />);
    expect(screen.getByText("This phone cannot scan. Choose the relic from the list.")).toBeTruthy();
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    const onRelic = vi.fn();
    let n = 0;
    const detect = vi.fn(async () => (++n < 2 ? "hw:zzz" : "hw:r2"));
    rerender(<RelicScanner onRelic={onRelic} available detect={detect} getStream={async () => stream} />);
    fireEvent.click(screen.getByRole("button", { name: "Scan a relic" }));
    await waitFor(() => expect(screen.getByText(/That is not a relic from this game/)).toBeTruthy());
    expect(stop).toHaveBeenCalled(); // the camera is off after a bad read
    fireEvent.click(screen.getByRole("button", { name: "Scan a relic" }));
    await waitFor(() => expect(onRelic).toHaveBeenCalledWith("r2"));
    rerender(<RelicScanner onRelic={onRelic} available getStream={async () => { throw new Error("no"); }} />);
    fireEvent.click(screen.getByRole("button", { name: "Scan a relic" }));
    await waitFor(() => expect(screen.getByText("The camera is not allowed. Choose the relic from the list.")).toBeTruthy());
  });
});

describe("LobbyPanel", () => {
  it("lists the players, shows the Master controls to the Master and a waiting line to the others", () => {
    const view = (seat: number) => ({ connection: "online", phase: "lobby", code: "K7M2", seat, nickname: "x", master: null, lock: null, game: game({ pub: null, priv: null, lobby: lobby({ started: false, worldId: null }) }) }) as never;
    const { rerender } = render(<LobbyPanel view={view(1)} send={() => undefined} worlds={WORLDS} />);
    expect(screen.getByRole("region", { name: "Master controls" })).toBeTruthy();
    expect(screen.getByText("Ana · Master")).toBeTruthy();
    expect(screen.getByText("Agnes (Bot)")).toBeTruthy();
    rerender(<LobbyPanel view={view(2)} send={() => undefined} worlds={WORLDS} />);
    expect(screen.queryByRole("region", { name: "Master controls" })).toBeNull();
    expect(screen.getByText("Waiting for the Master to start the game.")).toBeTruthy();
  });
});

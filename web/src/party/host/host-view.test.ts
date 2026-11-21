import { describe, expect, it } from "vitest";
import { applyHostMessage, EMPTY_HOST, type HostView } from "./host-view";

const run = (h: HostView, ...msgs: unknown[]) => msgs.reduce<HostView>((a, m) => applyHostMessage(a, m, 1000), h);

describe("the Host view (party-mode 8)", () => {
  it("shows the frozen sky from setAtmosphere and nothing else of it", () => {
    const h = run(EMPTY_HOST, { t: "setAtmosphere", weather: "rain", timeOfDay: "night", moon: "full", lat: 5 });
    expect(h.game.atmosphere).toEqual({ weather: "rain", timeOfDay: "night", moon: "full" });
    expect(run(EMPTY_HOST, { t: "setAtmosphere", weather: 4 })).toBe(EMPTY_HOST);
  });
  it("keeps a TV Cue with its caption (only the four known cues), a Rattle at most 80 percent, and the Becoming at most 4 s", () => {
    const h = run(EMPTY_HOST, { t: "tvCue", eventId: 3, cue: "bell", playAtMs: 5000 }, { t: "tvCue", eventId: 4, cue: "nonsense", playAtMs: 5 }, { t: "rattleSound", eventId: 5, level: 2, sound: "wind", volume: 1, playAtMs: 6000, line: "a wind passed" }, { t: "becoming", seat: 3, atMs: 7000, durationMs: 9000, fadeOrder: [3, 2, 1] });
    expect(h.tvCues).toEqual([{ id: "tv-3", cue: "bell", caption: "A small bell rings", playAtMs: 5000 }]);
    expect(h.rattles[0]).toMatchObject({ level: 2, sound: "wind", volume: 0.8, line: "a wind passed" });
    expect(h.becomings[0]).toMatchObject({ seat: 3, durationMs: 4000, fadeOrder: [3, 2, 1] });
  });
  it("counts twelve strikes at most, keeps the whispered line with its clips, and the spoken lines", () => {
    const h = run(EMPTY_HOST, { t: "strike", atMs: 100, count: 40, midnight: true, hour: 0 }, { t: "stitch", eventId: "stitch-1", subtitle: "wait here", clips: [{ word: "wait", contentType: "audio/webm", durationMs: 800, audio: "AA==" }] }, { t: "voice", lineId: "l1", text: "Midnight.", kind: "midnight" }, { t: "speech", on: true });
    expect(h.strikes[0]).toEqual({ id: "strike-100", atMs: 100, count: 12, midnight: true });
    expect(h.whispers[0]).toMatchObject({ subtitle: "wait here" });
    expect(h.spoken).toEqual([{ lineId: "l1", text: "Midnight.", kind: "midnight" }]);
    expect(h.speechOn).toBe(true);
  });
  it("counts speech controls and recap skips, and ignores an action it does not know", () => {
    let h = run(EMPTY_HOST, { t: "speechControl", action: "skip" }, { t: "speechControl", action: "replay" }, { t: "speechControl", action: "explode" }, { t: "recapSkip" });
    expect(h.speechAction).toEqual({ action: "replay", n: 2 });
    expect(h.recapSkipped).toBe(1);
    h = run(h, { t: "song", key: "k", title: "T", captions: "words" });
    expect(h.songs).toHaveLength(1);
  });
  it("holds the active Detective's input and ignores a malformed one", () => {
    const h = run(EMPTY_HOST, { t: "input", seat: 2, input: { seq: 1, move: [1, 0], look: [3, 4] } });
    expect(h.input).toEqual({ seat: 2, move: [1, 0], look: [3, 4] });
    expect(run(h, { t: "input", seat: 2, input: { move: "x", look: [1, 1] } })).toBe(h);
  });
  it("hands every other message to the shared game reducer, so the lobby and Public View arrive as on a phone", () => {
    const h = run(EMPTY_HOST, { t: "lobby", code: "K7M2", masterSeat: 1, started: false, worldId: null, settings: {}, switches: {}, seats: [] }, { t: "scripted", line: "The clock struck one." });
    expect(h.game.lobby?.code).toBe("K7M2");
    expect(h.game.log.map((l) => l.text)).toEqual(["The clock struck one."]);
    expect(run(EMPTY_HOST, null, 5, { t: 3 })).toBe(EMPTY_HOST);
  });
});

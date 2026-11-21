import { describe, expect, it } from "vitest";
import { applyRoomMessage, clearPrompt, EMPTY_GAME, eventLine, type GameView } from "./game-view";

const pub = (events: unknown[], extra: object = {}) => ({ t: "public", view: { phase: "playing", round: 1, active: 1, at: null, deadlineMs: 5000, paused: false, seats: [{ seat: 1, nickname: "Ana", bot: false, poltergeist: false, handSize: 4, sealed: false }, { seat: 2, nickname: "Ben", bot: false, poltergeist: false, handSize: 4, sealed: false }], haunt: { level: 0, max: 10, coldSpot: null, choosing: null }, zones: [{ id: "z1", name: "Cellar" }], suspects: [{ id: "s1", name: "Mr Vane" }], relics: [{ id: "r1", name: "Bell" }], events, ending: null, doors: [], closedZones: [], puzzleSetting: "off", tvKnock: null, doorProblems: [], ...extra } });
const run = (g: GameView, ...msgs: unknown[]) => msgs.reduce<GameView>((acc, m) => applyRoomMessage(acc, m, 1000), g);

describe("game view reducer (party-mode 9)", () => {
  it("turns public events into plain lines once each, in order, using the Room's own names", () => {
    const ev = [{ id: 0, kind: "turn-start", seat: 1 }, { id: 1, kind: "suggest", seat: 1, zone: "z1", suspect: "s1", relic: "r1", passed: [], refuter: 2 }];
    let g = run(EMPTY_GAME, pub(ev));
    expect(g.log.map((l) => l.text)).toEqual(["Ana's turn.", "Ana suggested Mr Vane with the Bell in the Cellar."]);
    g = run(g, pub([...ev, { id: 2, kind: "timeout", seat: 2, turn: 1 }]));
    expect(g.log.map((l) => l.text)).toEqual(["Ana's turn.", "Ana suggested Mr Vane with the Bell in the Cellar.", "Ben ran out of time."]);
    expect(run(g, pub(ev)).log).toBe(g.log); // the same events again add nothing
  });
  it("keeps the newest 60 lines and never invents a line for an event it has no words for", () => {
    const ev = Array.from({ length: 80 }, (_, i) => ({ id: i, kind: "turn-start", seat: 1 }));
    expect(run(EMPTY_GAME, pub(ev)).log).toHaveLength(60);
    expect(eventLine(EMPTY_GAME, { id: 1, kind: "something-new" })).toBeNull();
  });
  it("says a Rattle by its level in three anonymous lines and a phone cue only by whose phone", () => {
    expect(eventLine(EMPTY_GAME, { id: 1, kind: "rattle", level: 1, target: 1 })).toBe("The floorboards creaked.");
    expect(eventLine(EMPTY_GAME, { id: 1, kind: "rattle", level: 2, target: 1 })).toBe("A wind passed.");
    expect(eventLine(EMPTY_GAME, { id: 1, kind: "rattle", level: 3, target: 1 })).toBe("The house rumbled.");
    expect(eventLine(run(EMPTY_GAME, pub([])), { id: 1, kind: "phone-cue", target: 2, cue: "bell" })).toBe("A sound came from Ben's phone.");
  });
  it("holds the views, the sky and the ended flag from the Room", () => {
    const g = run(EMPTY_GAME, pub([], { atmosphere: { weather: "rain", timeOfDay: "night", moon: "full" } }), { t: "private", view: { seat: 1, hand: [], resolve: 1 } });
    expect(g.atmosphere).toEqual({ weather: "rain", timeOfDay: "night", moon: "full" });
    expect(g.priv).toMatchObject({ seat: 1 });
    expect(g.ended).toBe(false);
    expect(run(g, pub([], { phase: "ended" })).ended).toBe(true);
    expect(run(g, { t: "ended" }).ended).toBe(true);
  });
  it("queues sounds with their plan, caps the Rattle volume at 80 percent, and keeps only the last few", () => {
    let g = run(EMPTY_GAME, { t: "cue", eventId: 4, cue: "creak", playAtMs: 5000, plan: "flash" }, { t: "rattleSound", eventId: 5, level: 1, sound: "creak", volume: 1, playAtMs: 6000, plan: "play" }, { t: "strike", atMs: 7000, count: 3, plan: "play", hour: 3, midnight: false });
    expect(g.sounds.map((s) => [s.kind, s.sound, s.plan, s.volume])).toEqual([["cue", "creak", "flash", undefined], ["rattle", "creak", "play", 0.8], ["strike", "bell-3", "play", undefined]]);
    for (let i = 0; i < 12; i++) g = run(g, { t: "cue", eventId: 10 + i, cue: "bell", playAtMs: i, plan: "play" });
    expect(g.sounds).toHaveLength(8);
  });
  it("plays the Becoming sting only with this phone's own yes to sound", () => {
    const yes = run(EMPTY_GAME, { t: "private", view: { seat: 2, soundConsent: true, hand: [] } }, { t: "becoming", atMs: 500, durationMs: 4000, offerRattle: true });
    expect(yes.sounds).toEqual([{ id: "becoming-500", kind: "cue", sound: "becoming", playAtMs: 500, plan: "play" }]);
    const no = run(EMPTY_GAME, { t: "becoming", atMs: 500, durationMs: 4000, offerRattle: true });
    expect(no.sounds[0]).toMatchObject({ plan: "none" });
    expect(no.becomingAtMs).toBe(500);
  });
  it("keeps light plans inside 6 s, the Becoming time, the prompt until it is cleared, the not-you list and the word check", () => {
    let g = run(EMPTY_GAME, { t: "lightCue", cue: "glow", startAtMs: 1, durationMs: 99_999, steps: [{ atMs: 0, level: 0.5 }] }, { t: "becoming", atMs: 4242, durationMs: 4000, offerRattle: true }, { t: "prompt", kind: "rattle-first", text: "Turn on Rattle", button: "turn-on-rattle" }, { t: "notYou", eventId: 9 }, { t: "stitchResult", word: "here", ok: false, reason: "not_heard" });
    expect(g.lights[0]!.durationMs).toBe(6000);
    expect(g.becomingAtMs).toBe(4242);
    expect(g.prompt).toMatchObject({ kind: "rattle-first" });
    expect(g.notYou).toEqual([9]);
    expect(g.stitch).toEqual({ word: "here", ok: false, reason: "not_heard" });
    expect(clearPrompt(g).prompt).toBeNull();
    g = run(g, { t: "prompt", kind: "nope", text: "x", button: "y" });
    expect(g.prompt).toMatchObject({ kind: "rattle-first" });
  });
  it("reads a scripted strike line and 'a voice whispered' as log lines, counts refusals, and ignores anything malformed", () => {
    let g = run(EMPTY_GAME, { t: "scripted", kind: "strike", line: "The clock struck three." }, { t: "stitch_log", kind: "stitch", text: "a voice whispered" }, { t: "refused", code: "not_your_turn" }, { t: "refused", code: "not_your_turn" });
    expect(g.log.map((l) => l.text)).toEqual(["The clock struck three.", "A voice whispered."]);
    expect(g.refusal).toEqual({ code: "not_your_turn", n: 2 });
    const before = g;
    for (const bad of [null, 5, "x", {}, { t: 4 }, { t: "public" }, { t: "pose", pos: [1] }, { t: "scripted" }]) g = applyRoomMessage(g, bad, 0);
    expect(g).toBe(before);
  });
});

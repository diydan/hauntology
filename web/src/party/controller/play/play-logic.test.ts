import { describe, expect, it } from "vitest";
import { EMPTY_GAME, type GameView } from "../game-view";
import { achievementsOf, clockWords, HAUNT_WORDS, knowledgeOf, nameOf, refusalWords, remainingMs, secondsLeft, turnOf } from "./play-logic";

const game = (pub: object | null, priv: object | null = null): GameView => ({ ...EMPTY_GAME, pub: pub as never, priv: priv as never });
const PUB = { active: 2, at: "z1", seats: [{ seat: 1, nickname: "Ana", poltergeist: false }, { seat: 2, nickname: "Ben", poltergeist: false }, { seat: 3, nickname: "Cat", poltergeist: true }], zones: [{ id: "z1", name: "Cellar" }], suspects: [{ id: "s1", name: "Mr Vane" }], relics: [{ id: "r1", name: "Bell" }], events: [] };

describe("play logic", () => {
  it("reads the clock on the Room's time and never below zero", () => {
    expect(remainingMs(10_000, 4_000, 1_000)).toBe(5_000);
    expect(remainingMs(10_000, 99_000, 0)).toBe(0);
    expect(remainingMs(null, 5, 0)).toBeNull();
    expect(remainingMs(Number.NaN, 5, 0)).toBeNull();
  });
  it("says the time in words, rounding up, and says when there is no clock or it is paused", () => {
    expect(clockWords(65_000)).toBe("1:05");
    expect(clockWords(8_100)).toBe("0:09");
    expect(clockWords(0)).toBe("0:00");
    expect(clockWords(1)).toBe("0:01");
    expect(clockWords(null)).toBe("No clock");
    expect(clockWords(30_000, true)).toBe("0:30 (paused)");
    expect(secondsLeft(12_000, 2_500, 0)).toBe(10);
    expect(secondsLeft(12_000, 99_000, 0)).toBe(0);
  });
  it("knows whose turn it is, and that a haunting Player never has one", () => {
    expect(turnOf(game(PUB), 2)).toMatchObject({ mine: true, name: "Ben", zone: "z1" });
    expect(turnOf(game(PUB), 1)).toMatchObject({ mine: false, poltergeist: false });
    expect(turnOf(game({ ...PUB, active: 3 }), 3)).toMatchObject({ mine: false, poltergeist: true });
    expect(turnOf(EMPTY_GAME, 1)).toMatchObject({ mine: false, activeSeat: null });
  });
  it("names a card from any of the three lists", () => {
    const p = PUB as never;
    expect([nameOf(p, "z1"), nameOf(p, "s1"), nameOf(p, "r1"), nameOf(p, "zzz")]).toEqual(["Cellar", "Mr Vane", "Bell", "zzz"]);
  });
  it("builds the notebook's knowledge from the Hand, the cards shown, the Residue found and the Suggestions others passed on", () => {
    const g = game({ ...PUB, events: [{ id: 1, kind: "suggest", seat: 2, zone: "z1", suspect: "s1", relic: "r1", passed: [1, 3], refuter: 4 }, { id: 2, kind: "turn-start", seat: 1 }] }, { hand: [{ kind: "zone", id: "z1" }], shownToMe: [{ card: "s1", by: 2 }], found: ["r1"] });
    expect(knowledgeOf(g, 1, true)).toEqual({ me: 1, hand: ["z1"], shown: [{ card: "s1", by: 2 }], found: ["r1"], passes: [{ seat: 1, cards: ["s1", "z1", "r1"] }, { seat: 3, cards: ["s1", "z1", "r1"] }], autoCross: true });
    expect(knowledgeOf(EMPTY_GAME, 1, false)).toEqual({ me: 1, hand: [], shown: [], found: [], passes: [], autoCross: false });
  });
  it("lists the Achievements a seat earned from the public log, in the words of the rules", () => {
    const events = [1, 2, 3].map((i) => ({ id: i, kind: "suggest", seat: 1 }));
    expect(achievementsOf(game({ ...PUB, events }).pub, 1).map((a) => a.id)).toEqual(["persistent"]);
    expect(achievementsOf(game({ ...PUB, events }).pub, 2)).toEqual([]);
    expect(achievementsOf(null, 1)).toEqual([]);
  });
  it("has words for every Haunt Event option and for the Room's refusals, with the reason when it names one", () => {
    expect(Object.keys(HAUNT_WORDS).sort()).toEqual(["blackout", "cold-spot", "lull", "restless", "slam"]);
    expect(refusalWords("not_your_turn")).toMatchObject({ title: "Not your turn yet" });
    expect(refusalWords("nudge_denied:no_resolve").body).toBe("You need more Resolve.");
    expect(refusalWords("something_new").title.length).toBeGreaterThan(0);
  });
});

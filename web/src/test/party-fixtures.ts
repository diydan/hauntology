import { EMPTY_GAME, type GameView } from "../party/controller/game-view";

/** A small game as the Room's views would show it, for the tests of the phone's screens. Seats: 1 Ana (you), 2 Ben, 3 Cat (haunting), 4 a Bot. */
export const SUSPECTS = [{ id: "s1", name: "Mr Vane" }, { id: "s2", name: "Miss Pike" }, { id: "s3", name: "Dr Thorne" }];
export const ZONES = [{ id: "z1", name: "Cellar" }, { id: "z2", name: "Attic" }, { id: "z3", name: "Parlour" }];
export const RELICS = [{ id: "r1", name: "Music box" }, { id: "r2", name: "Wax hand" }, { id: "r3", name: "Locket" }];

export function pub(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    phase: "playing", round: 1, active: 1, at: null, deadlineMs: 70_000, paused: false,
    seats: [{ seat: 1, nickname: "Ana", bot: false, poltergeist: false, handSize: 4, sealed: false }, { seat: 2, nickname: "Ben", bot: false, poltergeist: false, handSize: 4, sealed: false },
      { seat: 3, nickname: "Cat", bot: false, poltergeist: true, handSize: 4, sealed: false }, { seat: 4, nickname: "Agnes", bot: true, poltergeist: false, handSize: 4, sealed: false }],
    haunt: { level: 0, max: 10, coldSpot: null, choosing: null }, zones: ZONES, suspects: SUSPECTS, relics: RELICS, events: [{ id: 1, kind: "turn-start", seat: 1 }],
    ending: null, doors: [], closedZones: [], puzzleSetting: "off", tvKnock: null, doorProblems: [], ...over,
  };
}
export function priv(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { seat: 1, hand: [{ kind: "suspect", id: "s1" }, { kind: "zone", id: "z3" }, { kind: "relic", id: "r2" }], shownToMe: [], found: [], resolve: 2, sealed: null, answer: null, heard: [], canEavesdrop: null, soundConsent: false, choose: null, ...over };
}
export function lobby(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { code: "K7M2", masterSeat: 1, started: true, worldId: "kitchen", settings: { preset: "classic", nudges: "all", frames: true, sounds: true, autoCross: false, botLevel: "standard", baseSeconds: 60, hauntMax: 10 }, switches: { conditions: "off", hourStrike: true, lightBar: true, rattle: true, stitch: false },
    seats: [{ seat: 1, nickname: "Ana", bot: false, connected: true }, { seat: 2, nickname: "Ben", bot: false, connected: true }, { seat: 3, nickname: "Cat", bot: false, connected: true }, { seat: 4, nickname: "Agnes", bot: true, connected: true }], ...over };
}
export function game(over: Partial<{ pub: Record<string, unknown> | null; priv: Record<string, unknown> | null; lobby: Record<string, unknown> | null } & Record<string, unknown>> = {}): GameView {
  const { pub: p = pub(), priv: v = priv(), lobby: l = lobby(), ...rest } = over;
  return { ...EMPTY_GAME, pub: p as never, priv: v as never, lobby: l as never, ...(rest as object) } as GameView;
}

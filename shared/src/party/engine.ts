import { hash, mulberry32 } from "../puzzles/rng";
import { roundEnd, sealAccusation, type AccuseState } from "./accuse";
import { botAct, newMind, observe, type Fact, type Mind, type MindCard } from "./bot";
import { bonusSeconds, clockStatus, deadlineOf, earned, expire, nextWake, pause, resume, turnBudget, type BaseSeconds, type ClockEvent, type TurnClock } from "./clock";
import { dealCase, type Card, type Deal, type Solution } from "./deal";
import { endingPayload, type EndingPayload, type RecapEvent, type Source } from "./ending";
import { applyEvent, chooseOption, chooserFor, coldSpotIn, defaultOption, fireEvent, takeBlackout, type Haunt, type HauntOption } from "./haunt";
import { buildPool, type Pool } from "./pool";
import { inspectRefusal, placeResidue, settleInspect, startInspect, type Inspecting } from "./residue";
import { EAVESDROP_MS, canEavesdrop, eavesdrop, gainResolve, spendResolve, type EavesdropWindow } from "./resolve";
import { applyNudge, canNudge, type LastSpook, type NudgeKind } from "./nudge";
import { CUE_PLAY_MS, canCue, canFrame, houseCuePhones, isCue, restlessSchedule, soundPlan, type CueId, type FrameSeat, type PhoneSeat, type SoundPlan } from "./cues";
import { canSuggest, defaultShown, isBluff, resolveSuggestion, validShow } from "./suggest";
import { firstPlayer, nextPlayer, type Order } from "./turns";

/**
 * The Engine (integration Requirement 2): `step(state, action, now)` applies one Action with the rules of the party
 * modules, in their order, and returns the new state, the messages to send and the next wake time. It adds no rule of
 * its own. Pure and deterministic: the same state, Action and time always give the same result.
 *
 * This first cut runs the core loop: start, Turns, walking between Zones, Inspect (plain), Suggestions with the answer
 * choice, Accusations, the Turn Clock, the Round end with the Haunt and its Events, the ending, and Bots. Nudges,
 * Cues, Frames, Eavesdrop, Locks, Errands and World Clues join later through new Action kinds.
 */

export const ANSWER_MS = 10_000;
export const WINDOW_MS = 15_000;
export const BOT_THINK_MIN_MS = 1_500;
export const BOT_THINK_MAX_MS = 6_000;
const BOT_ACTIONS_PER_TURN = 8;

export type EngineSeat = Readonly<{ seat: number; nickname: string; bot: boolean; botLevel: "standard" | "gentle" }>;
export type EngineSettings = Readonly<{ baseSeconds: BaseSeconds | null; hauntMax: 8 | 10 | 12; nudges?: "all" | "help-only" | "off"; sounds?: boolean; frames?: boolean }>;
export const DISCONNECT_GRACE_MS = 20_000;
export const MASTER_AWAY_MS = 60_000;
export const MISSED_TO_SKIP = 2;

export type PlayerRec = Readonly<{
  seat: number; poltergeist: boolean; joinedRound: number | null; resolve: number;
  inspected: readonly string[]; shownToMe: readonly Readonly<{ card: string; by: number }>[]; found: readonly string[];
  sealed: Solution | null; hasSealed: boolean; suggestions: number; turnMsUsed: number;
  heard: readonly Readonly<{ eventId: number; card: string }>[];
  /** Seat-owned, so a reconnect changes none of them (party-mode 12.4, 14.4). */
  connected: boolean; missed: number; lastCueMs: number | null; soundsThisRound: number;
  frameSentRound: number | null; framedRound: number | null; soundConsent: boolean; hasAudio: boolean;
}>;

export type TurnRec = Readonly<{
  seat: number; turnNo: number; startedMs: number; clock: TurnClock; at: string | null; suggested: boolean;
  inspecting: Inspecting | null;
  answering: Readonly<{ eventId: number; refuter: number; held: readonly string[]; untilMs: number }> | null;
  windowUntilMs: number | null;
  botDueMs: number | null; botActions: number;
  nudges: Readonly<{ help: boolean; spook: boolean }>;
  /** True when the Master's pause (not a Suggestion) paused this clock. */
  masterPausedClock: boolean;
  cueCount: number;
  /** The active Player's phone dropped: the clock is paused and the Turn ends at this time unless they come back. */
  disconnectEndsMs: number | null;
  disconnectPausedClock: boolean;
}>;

export type EngineEvent = RecapEvent | Readonly<{ id: number; kind: "visit"; seat: number; zone: string; sinceTurnMs: number }> | Readonly<{ id: number; kind: "haunt-event"; option: HauntOption }>;

export type EngineState = Readonly<{
  v: 1; seed: number; phase: "lobby" | "playing" | "ended";
  settings: EngineSettings; seats: readonly EngineSeat[]; masterSeat: number;
  pool: Pool; deal: Deal | null; residueAt: Readonly<Record<string, string>>;
  players: readonly PlayerRec[]; round: number; first: number | null; turnNo: number; turn: TurnRec | null;
  haunt: Haunt; eventsChosen: number;
  log: readonly EngineEvent[]; nextId: number; shownLog: Readonly<Record<number, string>>; bluffs: readonly number[];
  sources: readonly Source[]; botFacts: Readonly<Record<number, readonly Fact[]>>;
  winners: readonly number[]; houseWins: boolean; ending: EndingPayload | null;
  /** When the Master paused the game, or null. */
  pausedSinceMs: number | null;
  lastSpook: LastSpook | null;
  nudgeCounts: Readonly<{ haunting: number; others: number }>;
  eavesdrop: EavesdropWindow | null;
  /** When each sounding Cue stops. */
  playing: readonly number[];
  masterAwaySinceMs: number | null;
  /** Messages for one step beyond the views (a Cue to one phone, "not you"); emptied by every step. */
  outbox: readonly Outbound[];
}>;

// ---------------------------------------------------------------- actions and messages
export type ClientMsg =
  | Readonly<{ t: "start" }>
  | Readonly<{ t: "walk"; zone: string }>
  | Readonly<{ t: "inspect" }>
  | Readonly<{ t: "suggest"; suspect: string; relic: string }>
  | Readonly<{ t: "show"; card: string }>
  | Readonly<{ t: "seal"; suspect: string; zone: string; relic: string }>
  | Readonly<{ t: "endTurn" }>
  | Readonly<{ t: "pass" }>
  | Readonly<{ t: "choose"; option: HauntOption }>
  | Readonly<{ t: "nudge"; kind: NudgeKind }>
  | Readonly<{ t: "eavesdrop"; eventId: number }>
  | Readonly<{ t: "pause" }>
  | Readonly<{ t: "resume" }>
  | Readonly<{ t: "cue"; cue: string; place?: "tv" | "phone" }>
  | Readonly<{ t: "frame"; target: number; cue: string }>
  | Readonly<{ t: "sound"; consent: boolean; audio?: boolean }>;
export type Action = Readonly<{ kind: "client"; seat: number; msg: ClientMsg }> | Readonly<{ kind: "alarm" }> | Readonly<{ kind: "connect"; seat: number }> | Readonly<{ kind: "disconnect"; seat: number }>;

export type PublicSnapshot = Readonly<{
  phase: EngineState["phase"]; round: number; active: number | null; at: string | null;
  deadlineMs: number | null; paused: boolean;
  seats: readonly Readonly<{ seat: number; nickname: string; bot: boolean; poltergeist: boolean; handSize: number; sealed: boolean }>[];
  haunt: Readonly<{ level: number; max: number; coldSpot: string | null; choosing: Readonly<{ options: readonly HauntOption[]; chooser: number | null; deadlineMs: number }> | null }>;
  zones: readonly Readonly<{ id: string; name: string }>[];
  events: readonly EngineEvent[];
  ending: EndingPayload | null;
}>;
export type PrivateSnapshot = Readonly<{
  seat: number; hand: readonly Card[]; shownToMe: readonly Readonly<{ card: string; by: number }>[]; found: readonly string[];
  resolve: number; sealed: Solution | null;
  answer: Readonly<{ eventId: number; options: readonly string[]; deadlineMs: number }> | null;
  heard: readonly Readonly<{ eventId: number; card: string }>[];
  canEavesdrop: number | null;
  soundConsent: boolean;
  choose: Readonly<{ options: readonly HauntOption[]; deadlineMs: number }> | null;
}>;
export type Outbound = Readonly<{ to: "public"; msg: Readonly<{ t: "public"; view: PublicSnapshot }> }>
  | Readonly<{ to: "seat"; seat: number; msg: Readonly<{ t: "private"; view: PrivateSnapshot }> | Readonly<{ t: "refused"; code: string }>
      | Readonly<{ t: "cue"; eventId: number; cue: CueId; playAtMs: number; plan: SoundPlan }> | Readonly<{ t: "notYou"; eventId: number }> }>;
export type StepResult = Readonly<{ state: EngineState; out: readonly Outbound[]; wakeAtMs: number | null; refused?: string }>;

// ---------------------------------------------------------------- creating a game
export function createEngine(o: Readonly<{ seed: number; seats: readonly EngineSeat[]; settings: EngineSettings; presetIds: readonly string[]; pool?: Pool }>): EngineState {
  const master = o.seats.find((s) => !s.bot)?.seat ?? (o.seats[0]?.seat as number);
  return {
    v: 1, seed: o.seed, phase: "lobby", settings: o.settings, seats: [...o.seats].sort((a, b) => a.seat - b.seat), masterSeat: master,
    pool: o.pool ?? buildPool([], o.presetIds, o.seed), deal: null, residueAt: {},
    players: [], round: 0, first: null, turnNo: 0, turn: null,
    haunt: { level: 0, max: o.settings.hauntMax, fired: [], pending: null, coldSpot: null, blackoutNext: false }, eventsChosen: 0,
    log: [], nextId: 1, shownLog: {}, bluffs: [], sources: [], botFacts: {}, winners: [], houseWins: false, ending: null,
    pausedSinceMs: null, lastSpook: null, nudgeCounts: { haunting: 0, others: 0 }, eavesdrop: null,
    playing: [], masterAwaySinceMs: null, outbox: [],
  };
}

// ---------------------------------------------------------------- helpers
const order = (s: EngineState): Order => ({ seats: s.seats.map((x) => x.seat), out: s.players.filter((p) => p.poltergeist || (!p.connected && p.missed >= MISSED_TO_SKIP)).map((p) => p.seat) });
const player = (s: EngineState, seat: number): PlayerRec | undefined => s.players.find((p) => p.seat === seat);
const isBot = (s: EngineState, seat: number): boolean => s.seats.find((x) => x.seat === seat)?.bot ?? false;
const setPlayer = (s: EngineState, seat: number, f: (p: PlayerRec) => PlayerRec): EngineState => ({ ...s, players: s.players.map((p) => (p.seat === seat ? f(p) : p)) });
type NoId<T> = T extends unknown ? Omit<T, "id"> : never;
const addLog = (s: EngineState, e: NoId<EngineEvent>): [EngineState, number] => {
  const id = s.nextId;
  return [{ ...s, log: [...s.log, { ...e, id } as EngineEvent], nextId: id + 1 }, id];
};
const addFact = (s: EngineState, seat: number, f: Fact): EngineState => (isBot(s, seat) ? { ...s, botFacts: { ...s.botFacts, [seat]: [...(s.botFacts[seat] ?? []), f] } } : s);
const thinkMs = (s: EngineState, salt: number): number => BOT_THINK_MIN_MS + Math.floor(mulberry32(hash("think", s.seed, s.turnNo, salt))() * (BOT_THINK_MAX_MS - BOT_THINK_MIN_MS));
const allCards = (s: EngineState): MindCard[] => [
  ...s.pool.suspects.map((c) => ({ id: c.id, kind: "suspect" as const })), ...s.pool.zones.map((c) => ({ id: c.id, kind: "zone" as const })),
  ...s.pool.relics.map((c) => ({ id: c.id, kind: "relic" as const })),
];

/** A Bot's mind, rebuilt from its own facts only: it never sees another Hand. */
export function mindOf(s: EngineState, seat: number): Mind {
  const deal = s.deal as Deal;
  const sizes = Object.fromEntries(s.seats.map((x) => [x.seat, deal.hands[x.seat]?.length ?? 0]));
  const m = newMind(seat, s.seats.map((x) => x.seat), sizes, allCards(s), deal.residue.length);
  observe(m, { kind: "hand", cards: (deal.hands[seat] ?? []).map((c) => c.id) });
  for (const f of s.botFacts[seat] ?? []) observe(m, f);
  return m;
}

function startTurn(s: EngineState, seat: number, now: number): EngineState {
  const { haunt, blackout } = takeBlackout(s.haunt);
  const bonus = bonusSeconds(earned(s.log as readonly ClockEvent[], seat));
  const budget = turnBudget({ baseSeconds: s.settings.baseSeconds, bonusSeconds: bonus, blackout });
  const turnNo = s.turnNo + 1;
  const base: EngineState = { ...s, haunt, turnNo };
  const [s2] = addLog(base, { kind: "turn-start", seat });
  const turn: TurnRec = {
    seat, turnNo, startedMs: now, clock: { startedMs: now, budgetMs: budget === null ? null : budget * 1000, pausedMs: 0, pausedSinceMs: null, ended: false },
    at: null, suggested: false, inspecting: null, answering: null, windowUntilMs: null, botDueMs: null, botActions: 0,
    nudges: { help: false, spook: false }, masterPausedClock: false, cueCount: 0, disconnectEndsMs: null, disconnectPausedClock: false,
  };
  const away = !isBot(s2, seat) && (player(s2, seat)?.connected === false);
  const t1: TurnRec = away ? { ...turn, clock: pause(turn.clock, now), disconnectEndsMs: now + DISCONNECT_GRACE_MS, disconnectPausedClock: true } : turn;
  const t2 = isBot(s2, seat) ? { ...t1, botDueMs: now + thinkMs(s2, 0) } : t1;
  return { ...s2, turn: t2 };
}

function fireHaunt(s: EngineState, now: number): EngineState {
  const polts = s.players.filter((p) => p.poltergeist).map((p) => ({ seat: p.seat, bot: isBot(s, p.seat), joinedRound: p.joinedRound ?? 0 }));
  let st = s;
  for (let guard = 0; guard < 3; guard++) {
    const chooser = chooserFor(polts, st.eventsChosen);
    const h = fireEvent(st.haunt, st.seed, chooser, now);
    if (h === st.haunt || h.pending === null) break;
    st = { ...st, haunt: h };
    if (chooser !== null) break; // a Poltergeist chooses within 15 s; the alarm applies the first option otherwise
    st = applyChosen(st, defaultOption(h.pending), now);
  }
  return st;
}

function applyChosen(s: EngineState, option: HauntOption, now: number): EngineState {
  const level = s.haunt.pending?.level ?? s.haunt.level;
  const [s2] = addLog({ ...s, haunt: applyEvent(s.haunt, option, s.pool.zones.map((z) => z.id), s.round, s.seed), eventsChosen: s.eventsChosen + 1 }, { kind: "haunt-event", option });
  return fireHaunt(houseCue(s2, level, option === "restless", now), now);
}

const phoneOf = (s: EngineState, p: PlayerRec): PhoneSeat => ({ seat: p.seat, bot: isBot(s, p.seat), consent: p.soundConsent, hasAudio: p.hasAudio, soundsThisRound: p.soundsThisRound });

/** Play a Cue on one phone: the public event names only the phone; the phone hears it (or flashes) and is told "not you". */
function cueOnPhone(s: EngineState, target: number, cue: CueId, playAtMs: number, source: { kind: "house-cue" | "frame"; from: number | null }): EngineState {
  const p = player(s, target) as PlayerRec;
  const plan = soundPlan(phoneOf(s, p), s.settings.sounds ?? true);
  let [st, id] = addLog(s, { kind: "phone-cue", target, cue });
  st = setPlayer(st, target, (q) => ({ ...q, soundsThisRound: plan === "none" ? q.soundsThisRound : q.soundsThisRound + 1 }));
  return { ...st, sources: [...st.sources, { eventId: id, kind: source.kind, from: source.from }],
    outbox: [...st.outbox, { to: "seat", seat: target, msg: { t: "cue", eventId: id, cue, playAtMs, plan } }, { to: "seat", seat: target, msg: { t: "notYou", eventId: id } }] };
}

/** Every Haunt Event plays a House Cue: one seeded phone, or every consenting phone 400 ms apart for Restless. */
function houseCue(s: EngineState, level: number, restless: boolean, now: number): EngineState {
  const { cue, seats } = houseCuePhones(s.players.map((p) => phoneOf(s, p)), level, s.seed, restless);
  let st = s;
  for (const { seat, playAtMs } of restlessSchedule(seats, now)) st = cueOnPhone(st, seat, cue, playAtMs, { kind: "house-cue", from: null });
  return st;
}

function endTurn(s: EngineState, now: number): EngineState {
  const t = s.turn;
  if (t === null) return s;
  let st = setPlayer({ ...s, turn: null }, t.seat, (p) => ({ ...p, turnMsUsed: p.turnMsUsed + Math.max(0, now - t.startedMs) }));
  const nxt = nextPlayer(order(st), st.first as number, t.seat);
  if (nxt !== null) return startTurn(st, nxt, now);
  // the Round is over (party-mode 6.5)
  const deal = st.deal as Deal;
  const acc: AccuseState = {
    round: st.round, phase: "playing", haunt: { level: st.haunt.level, max: st.haunt.max }, winners: [], houseWins: false,
    players: st.players.map((p) => ({ seat: p.seat, poltergeist: p.poltergeist, sealed: p.sealed, hasSealed: p.hasSealed, joinedRound: p.joinedRound })),
  };
  const res = roundEnd(acc, deal.solution);
  st = {
    ...st, round: res.state.round, haunt: { ...st.haunt, level: res.state.haunt.level },
    players: st.players.map((p) => { const q = res.state.players.find((x) => x.seat === p.seat); return q ? { ...p, poltergeist: q.poltergeist, sealed: q.sealed, joinedRound: q.joinedRound } : p; }),
  };
  for (const r of res.reveals) st = addLog(st, { kind: "accuse", seat: r.seat, right: r.right })[0];
  if (res.state.phase === "ended") return finish({ ...st, winners: res.state.winners, houseWins: res.state.houseWins }, now);
  st = fireHaunt(st, now);
  st = { ...st, players: st.players.map((p) => ({ ...p, resolve: gainResolve(p.resolve), soundsThisRound: 0 })) };
  const first = firstPlayer(order(st), st.first, st.seed);
  if (first === null) return finish({ ...st, houseWins: true }, now);
  return startTurn({ ...st, first }, first, now);
}

function finish(s: EngineState, _now: number): EngineState {
  const deal = s.deal as Deal;
  const ending = endingPayload({
    solution: deal.solution, residueAt: s.residueAt, winners: s.winners, houseWins: s.houseWins,
    players: s.players.map((p) => ({ seat: p.seat, nickname: s.seats.find((x) => x.seat === p.seat)?.nickname ?? "", bot: isBot(s, p.seat), poltergeist: p.poltergeist, suggestions: p.suggestions, turnMsUsed: p.turnMsUsed })),
    log: s.log.filter((e): e is RecapEvent => e.kind !== "visit" && e.kind !== "haunt-event"), sources: s.sources, bluffs: new Set(s.bluffs),
  });
  return { ...s, phase: "ended", turn: null, ending };
}

/** Show a card to the suggester, privately, and open the 15 s window. */
function deliverShown(s: EngineState, eventId: number, card: string, now: number): EngineState {
  const t = s.turn as TurnRec;
  const refuter = t.answering?.refuter ?? ((s.log.find((e) => e.id === eventId) as Extract<EngineEvent, { kind: "suggest" }>).refuter as number);
  let st = setPlayer(s, t.seat, (p) => ({ ...p, shownToMe: [...p.shownToMe, { card, by: refuter }] }));
  st = addFact(st, t.seat, { kind: "shown", card, by: refuter });
  const sug = st.log.find((e) => e.id === eventId) as Extract<EngineEvent, { kind: "suggest" }>;
  st = { ...st, eavesdrop: { eventId, suggester: t.seat, refuter, named: [sug.suspect, sug.zone, sug.relic], shown: card, untilMs: now + EAVESDROP_MS } };
  return { ...st, shownLog: { ...st.shownLog, [eventId]: card }, turn: { ...t, answering: null, windowUntilMs: now + WINDOW_MS, botDueMs: isBot(st, t.seat) ? now + thinkMs(st, eventId) : null } };
}

// ---------------------------------------------------------------- one Action
function apply(s: EngineState, a: Action, now: number): EngineState | string {
  if (a.kind === "alarm") return onAlarm(s, now);
  if (a.kind === "connect" || a.kind === "disconnect") return connection(s, a.seat, a.kind === "connect", now);
  const { seat, msg } = a;
  if (!s.seats.some((x) => x.seat === seat)) return "bad_token";
  if (msg.t === "start") {
    if (seat !== s.masterSeat) return "not_master";
    if (s.phase !== "lobby") return "game_started";
    const seatIds = s.seats.map((x) => x.seat);
    const deal = dealCase(s.pool, seatIds, s.seed);
    const players: PlayerRec[] = seatIds.map((x) => ({ seat: x, poltergeist: false, joinedRound: null, resolve: 1, inspected: [], shownToMe: [], found: [], sealed: null, hasSealed: false, suggestions: 0, turnMsUsed: 0, heard: [],
      connected: !s.seats.find((y) => y.seat === x)?.bot, missed: 0, lastCueMs: null, soundsThisRound: 0, frameSentRound: null, framedRound: null, soundConsent: false, hasAudio: true }));
    const st: EngineState = { ...s, phase: "playing", deal, residueAt: placeResidue(s.pool.zones.map((z) => z.id), deal.residue, s.seed), players, round: 1 };
    const first = firstPlayer(order(st), null, s.seed) as number;
    return startTurn({ ...st, first }, first, now);
  }
  if (s.phase !== "playing") return "game_over";
  if (msg.t === "pause") {
    if (seat !== s.masterSeat) return "not_master";
    if (s.pausedSinceMs !== null) return "already_paused";
    const t = s.turn;
    const clockFree = t !== null && t.clock.pausedSinceMs === null;
    return { ...s, pausedSinceMs: now, turn: t === null ? null : { ...t, clock: clockFree ? pause(t.clock, now) : t.clock, masterPausedClock: clockFree } };
  }
  if (msg.t === "resume") {
    if (seat !== s.masterSeat) return "not_master";
    if (s.pausedSinceMs === null) return "not_paused";
    return resumeAll(s, now);
  }
  if (msg.t === "sound") return setPlayer(s, seat, (p) => ({ ...p, soundConsent: msg.consent, hasAudio: msg.audio ?? p.hasAudio }));
  if (s.pausedSinceMs !== null) return "paused";
  if (msg.t === "cue") {
    if (!isCue(msg.cue)) return "cue_denied:unknown";
    const me = player(s, seat) as PlayerRec;
    const t = s.turn;
    const ok = canCue({ seat, bot: isBot(s, seat), lastCueMs: me.lastCueMs }, t?.seat ?? null, s.playing, t?.cueCount ?? 0, now);
    if (!ok.ok) return `cue_denied:${ok.reason}`;
    const place = msg.place ?? "tv";
    let st = setPlayer(s, seat, (p) => ({ ...p, lastCueMs: now }));
    st = { ...st, playing: [...st.playing.filter((e) => e > now), now + CUE_PLAY_MS], turn: t === null ? null : { ...t, cueCount: t.cueCount + 1 } };
    const [st2, id] = addLog(st, { kind: "cue", seat, cue: msg.cue, place });
    if (place === "tv") return st2;
    const plan = soundPlan(phoneOf(st2, player(st2, seat) as PlayerRec), st2.settings.sounds ?? true);
    const st3 = setPlayer(st2, seat, (p) => ({ ...p, soundsThisRound: plan === "none" ? p.soundsThisRound : p.soundsThisRound + 1 }));
    return { ...st3, outbox: [...st3.outbox, { to: "seat", seat, msg: { t: "cue", eventId: id, cue: msg.cue, playAtMs: now, plan } }] };
  }
  if (msg.t === "frame") {
    if (!isCue(msg.cue)) return "frame_denied:unknown";
    const me = player(s, seat) as PlayerRec;
    const them = player(s, msg.target);
    if (!them) return "frame_denied:self";
    const fs = (p: PlayerRec): FrameSeat => ({ ...phoneOf(s, p), lastCueMs: p.lastCueMs, frameSentRound: p.frameSentRound, framedRound: p.framedRound });
    const t = s.turn;
    const ok = canFrame(fs(me), fs(them), { framesOn: s.settings.frames ?? true, activeSeat: t?.seat ?? null, round: s.round, playingEnds: s.playing, turnCueCount: t?.cueCount ?? 0, now });
    if (!ok.ok) return `frame_denied:${ok.reason}`;
    let st = setPlayer(s, seat, (p) => ({ ...p, lastCueMs: now, frameSentRound: s.round }));
    st = setPlayer(st, msg.target, (p) => ({ ...p, framedRound: s.round }));
    st = { ...st, playing: [...st.playing.filter((e) => e > now), now + CUE_PLAY_MS], turn: t === null ? null : { ...t, cueCount: t.cueCount + 1 } };
    return cueOnPhone(st, msg.target, msg.cue, now, { kind: "frame", from: seat });
  }
  if (msg.t === "nudge") {
    const t = s.turn;
    const me = player(s, seat) as PlayerRec;
    const left = t === null ? 0 : Math.max(0, (deadlineOf(t.clock, now) ?? now) - now);
    const ok = canNudge({
      seat, bot: isBot(s, seat), activeSeat: t?.seat ?? null, resolve: me.resolve, setting: s.settings.nudges ?? "all",
      clockRunning: t !== null && t.clock.budgetMs !== null && t.clock.pausedSinceMs === null, budgetMs: t?.clock.budgetMs ?? 0, leftMs: left,
      usedThisTurn: t?.nudges ?? { help: false, spook: false }, round: s.round, turnIndex: s.turnNo, lastSpook: s.lastSpook,
    }, msg.kind);
    if (!ok.ok) return ok.reason;
    const tt = t as TurnRec;
    const n = applyNudge(tt.clock.budgetMs as number, me.resolve, msg.kind);
    let st = setPlayer(s, seat, (p) => ({ ...p, resolve: n.resolve }));
    st = { ...st, turn: { ...tt, clock: { ...tt.clock, budgetMs: n.budgetMs }, nudges: { ...tt.nudges, [msg.kind]: true } },
      lastSpook: msg.kind === "spook" ? { seat, round: s.round, turnIndex: s.turnNo } : s.lastSpook,
      nudgeCounts: me.poltergeist ? { ...s.nudgeCounts, haunting: s.nudgeCounts.haunting + 1 } : { ...s.nudgeCounts, others: s.nudgeCounts.others + 1 } };
    return addLog(st, { kind: "nudge", seat, nudge: msg.kind, target: tt.seat, turn: tt.turnNo })[0];
  }
  if (msg.t === "eavesdrop") {
    const me = player(s, seat) as PlayerRec;
    const w = s.eavesdrop;
    if (w === null || w.eventId !== msg.eventId || !canEavesdrop(w, seat, me.poltergeist, me.resolve, now, me.heard.some((h) => h.eventId === w.eventId))) return "eavesdrop_denied";
    const card = eavesdrop(w, seat, s.seed);
    const st = setPlayer(s, seat, (p) => ({ ...p, resolve: spendResolve(p.resolve, 1) as number, heard: [...p.heard, { eventId: w.eventId, card }] }));
    return addLog(st, { kind: "eavesdrop", seat })[0];
  }
  if (msg.t === "choose") {
    const pend = s.haunt.pending;
    if (pend === null || chooseOption(s.haunt, seat, msg.option, now) === null) return "not_your_choice";
    return applyChosen(s, msg.option, now);
  }
  if (msg.t === "show") {
    const t = s.turn;
    if (t?.answering == null || t.answering.refuter !== seat || !validShow(t.answering.held, msg.card)) return "bad_show";
    return deliverShown(s, t.answering.eventId, msg.card, now);
  }
  const t = s.turn;
  if (t === null || t.seat !== seat) return "not_your_turn";
  if (t.answering !== null) return "waiting_for_answer";
  const me = player(s, seat) as PlayerRec;
  switch (msg.t) {
    case "walk": {
      if (!s.pool.zones.some((z) => z.id === msg.zone)) return "not_in_zone";
      if (t.suggested) return "already_suggested";
      const [st] = addLog(s, { kind: "visit", seat, zone: msg.zone, sinceTurnMs: now - t.startedMs });
      return { ...st, turn: { ...t, at: msg.zone, inspecting: null } };
    }
    case "inspect": {
      const why = inspectRefusal({ seat, activeSeat: t.seat, poltergeist: me.poltergeist, inZone: t.at, inspected: me.inspected, inspecting: t.inspecting !== null });
      if (why !== null) return why;
      return { ...s, turn: { ...t, inspecting: startInspect(seat, t.at as string, now) } };
    }
    case "suggest": {
      const cold = coldSpotIn(s.haunt, s.round);
      if (!canSuggest({ seat, activeSeat: t.seat, poltergeist: me.poltergeist, inZone: t.at, coldSpot: cold, suggestedThisTurn: t.suggested })) return t.at === null ? "not_in_zone" : t.at === cold ? "cold_spot" : "already_suggested";
      if (!s.pool.suspects.some((c) => c.id === msg.suspect) || !s.pool.relics.some((c) => c.id === msg.relic)) return "bad_card";
      const deal = s.deal as Deal;
      const named = { zone: t.at as string, suspect: msg.suspect, relic: msg.relic };
      const r = resolveSuggestion(deal.hands, s.seats.map((x) => x.seat), seat, named);
      let [st, id] = addLog(s, { kind: "suggest", seat, ...named, passed: r.passed, refuter: r.refuter });
      st = setPlayer(st, seat, (p) => ({ ...p, suggestions: p.suggestions + 1 }));
      if (isBluff(deal.hands[seat] ?? [], named)) st = { ...st, bluffs: [...st.bluffs, id] };
      const cards = [named.suspect, named.zone, named.relic];
      for (const b of st.seats.filter((x) => x.bot)) {
        for (const p of r.passed) st = addFact(st, b.seat, { kind: "pass", seat: p, cards });
        if (r.refuter !== null && b.seat !== seat && b.seat !== r.refuter) st = addFact(st, b.seat, { kind: "showed", seat: r.refuter, cards });
      }
      const clock = pause(t.clock, now);
      if (r.refuter === null) return { ...st, turn: { ...t, clock, suggested: true, windowUntilMs: now + WINDOW_MS, botDueMs: isBot(st, seat) ? now + thinkMs(st, id) : null } };
      const refHuman = !isBot(st, r.refuter) && !(player(st, r.refuter) as PlayerRec).poltergeist;
      if (refHuman && r.held.length > 1) return { ...st, turn: { ...t, clock, suggested: true, answering: { eventId: id, refuter: r.refuter, held: r.held, untilMs: now + ANSWER_MS } } };
      const before = (player(st, seat) as PlayerRec).shownToMe.filter((x) => x.by === r.refuter).map((x) => x.card);
      const card = defaultShown(r.held, before, st.seed, id) as string;
      return deliverShown({ ...st, turn: { ...t, clock, suggested: true } }, id, card, now);
    }
    case "seal": {
      if (!s.pool.zones.some((z) => z.id === msg.zone)) return "bad_card";
      const acc: AccuseState = { round: s.round, phase: "playing", haunt: { level: s.haunt.level, max: s.haunt.max }, winners: [], houseWins: false,
        players: s.players.map((p) => ({ seat: p.seat, poltergeist: p.poltergeist, sealed: p.sealed, hasSealed: p.hasSealed, joinedRound: p.joinedRound })) };
      const res = sealAccusation(acc, seat, { suspect: msg.suspect, zone: msg.zone, relic: msg.relic });
      if (!res.ok) return res.code;
      const [st] = addLog(setPlayer(s, seat, (p) => ({ ...p, sealed: { suspect: msg.suspect, zone: msg.zone, relic: msg.relic }, hasSealed: true })), { kind: "seal", seat });
      return endTurn(st, now);
    }
    case "endTurn": return t.suggested ? endTurn(s, now) : "not_after_suggestion";
    case "pass": return endTurn(s, now);
  }
}

/**
 * A phone dropped or came back (party-mode 5.5, 1.4, 1.7). Every seat-owned limit stays as it was. The active
 * Player's clock pauses for up to 20 s; a Master away for 60 s hands the role to the next human.
 */
function connection(s: EngineState, seat: number, up: boolean, now: number): EngineState | string {
  const p = player(s, seat);
  if (!p || isBot(s, seat)) return "bad_token";
  if (p.connected === up) return s;
  let st = setPlayer(s, seat, (q) => ({ ...q, connected: up, missed: up ? 0 : q.missed }));
  if (seat === s.masterSeat) st = { ...st, masterAwaySinceMs: up ? null : now };
  const t = st.turn;
  if (t === null || t.seat !== seat || st.phase !== "playing") return st;
  if (!up) {
    const free = t.clock.pausedSinceMs === null;
    return { ...st, turn: { ...t, clock: free ? pause(t.clock, now) : t.clock, disconnectPausedClock: free, disconnectEndsMs: now + DISCONNECT_GRACE_MS } };
  }
  return { ...st, turn: { ...t, clock: t.disconnectPausedClock ? resume(t.clock, now) : t.clock, disconnectPausedClock: false, disconnectEndsMs: null } };
}

/** The Master resumes: every deadline moves on by the length of the pause, so nothing ran while it was paused. */
function resumeAll(s: EngineState, now: number): EngineState {
  const d = Math.max(0, now - (s.pausedSinceMs as number));
  const shift = (x: number | null): number | null => (x === null ? null : x + d);
  const t = s.turn;
  const turn = t === null ? null : {
    ...t, clock: t.masterPausedClock ? resume(t.clock, now) : t.clock, masterPausedClock: false,
    inspecting: t.inspecting === null ? null : { ...t.inspecting, untilMs: t.inspecting.untilMs + d },
    answering: t.answering === null ? null : { ...t.answering, untilMs: t.answering.untilMs + d },
    windowUntilMs: shift(t.windowUntilMs), botDueMs: shift(t.botDueMs), disconnectEndsMs: shift(t.disconnectEndsMs),
  };
  const p = s.haunt.pending;
  return {
    ...s, pausedSinceMs: null, turn,
    haunt: p === null ? s.haunt : { ...s.haunt, pending: { ...p, deadlineMs: p.deadlineMs + d } },
    eavesdrop: s.eavesdrop === null ? null : { ...s.eavesdrop, untilMs: s.eavesdrop.untilMs + d },
  };
}

function onAlarm(s: EngineState, now: number): EngineState {
  let st = s;
  for (let guard = 0; guard < 20 && st.phase === "playing"; guard++) {
    const before = st;
    st = tick(st, now);
    if (st === before) break;
  }
  return st;
}

/** Everything that is due at `now`, one thing at a time. */
function tick(s: EngineState, now: number): EngineState {
  if (s.pausedSinceMs !== null) return s;
  const p = s.haunt.pending;
  if (p !== null && p.chooser !== null && now >= p.deadlineMs) return applyChosen(s, defaultOption(p), now);
  if (s.masterAwaySinceMs !== null && now - s.masterAwaySinceMs >= MASTER_AWAY_MS) {
    const humans = s.players.filter((q) => !isBot(s, q.seat) && q.connected && q.seat !== s.masterSeat).map((q) => q.seat).sort((a, b) => a - b);
    const next = humans.find((x) => x > s.masterSeat) ?? humans[0];
    return next === undefined ? { ...s, masterAwaySinceMs: null } : { ...s, masterSeat: next, masterAwaySinceMs: null };
  }
  const t = s.turn;
  if (t === null) return s;
  if (t.disconnectEndsMs !== null && now >= t.disconnectEndsMs) {
    return endTurn(setPlayer(s, t.seat, (q) => ({ ...q, missed: q.missed + 1 })), now); // a lost Turn, no Haunt rise
  }
  if (t.answering !== null && now >= t.answering.untilMs) {
    const before = (player(s, t.seat) as PlayerRec).shownToMe.filter((x) => x.by === t.answering?.refuter).map((x) => x.card);
    return deliverShown(s, t.answering.eventId, defaultShown(t.answering.held, before, s.seed, t.answering.eventId) as string, now);
  }
  if (t.inspecting !== null) {
    const r = settleInspect(t.inspecting, now, t.at === t.inspecting.zone, true, s.residueAt);
    if (r.status === "done") {
      let st = setPlayer(s, t.seat, (q) => ({ ...q, inspected: [...q.inspected, r.zone], found: r.card === null ? q.found : [...q.found, r.card] }));
      if (r.card !== null) st = addFact(st, t.seat, { kind: "found", card: r.card });
      st = addLog(st, { kind: "inspect", seat: t.seat, zone: r.zone })[0];
      return { ...st, turn: { ...t, inspecting: null, botDueMs: isBot(st, t.seat) ? now + thinkMs(st, 77) : null } };
    }
  }
  if (t.windowUntilMs !== null && now >= t.windowUntilMs) return endTurn(s, now);
  if (clockStatus(t.clock, now) === "expired") {
    const ex = expire(t.clock, now, t.nudges.spook);
    if (ex.ended) {
      const [st] = addLog({ ...s, haunt: { ...s.haunt, level: Math.min(s.haunt.max, s.haunt.level + ex.hauntRise) } }, { kind: "timeout", seat: t.seat, turn: t.turnNo });
      return endTurn(fireHaunt(st, now), now);
    }
  }
  if (t.botDueMs !== null && now >= t.botDueMs && t.inspecting === null && t.answering === null) return botTurn(s, now);
  return s;
}

function botTurn(s: EngineState, now: number): EngineState {
  const t = s.turn as TurnRec;
  if (t.botActions >= BOT_ACTIONS_PER_TURN) return endTurn(s, now);
  const me = player(s, t.seat) as PlayerRec;
  const seatInfo = s.seats.find((x) => x.seat === t.seat) as EngineSeat;
  const act = t.windowUntilMs !== null
    ? botAct(mindOf(s, t.seat), seatInfo.botLevel, { inZone: null, inspected: me.inspected, suggested: true, canSuggestHere: false, residueFound: me.found.length, seed: s.seed, turn: t.turnNo })
    : botAct(mindOf(s, t.seat), seatInfo.botLevel, {
      inZone: t.at, inspected: me.inspected, suggested: t.suggested, canSuggestHere: t.at !== null && t.at !== coldSpotIn(s.haunt, s.round),
      residueFound: me.found.length, seed: s.seed, turn: t.turnNo,
    });
  const counted: EngineState = { ...s, turn: { ...t, botActions: t.botActions + 1, botDueMs: now + thinkMs(s, t.botActions + 1) } };
  const msg: ClientMsg = act.kind === "seal" ? { t: "seal", suspect: act.suspect, zone: act.zone, relic: act.relic }
    : act.kind === "suggest" ? { t: "suggest", suspect: act.suspect, relic: act.relic }
    : act.kind === "walk" ? { t: "walk", zone: act.zone }
    : act.kind === "inspect" ? { t: "inspect" }
    : t.suggested ? { t: "endTurn" } : { t: "pass" };
  const res = apply(counted, { kind: "client", seat: t.seat, msg }, now);
  return typeof res === "string" ? endTurn(counted, now) : res;
}

// ---------------------------------------------------------------- views out
export function publicSnapshot(s: EngineState, now: number): PublicSnapshot {
  const t = s.turn;
  const p = s.haunt.pending;
  return {
    phase: s.phase, round: s.round, active: t?.seat ?? null, at: t?.at ?? null,
    deadlineMs: t === null ? null : deadlineOf(t.clock, now), paused: t !== null && t.clock.pausedSinceMs !== null,
    seats: s.seats.map((x) => ({ seat: x.seat, nickname: x.nickname, bot: x.bot, poltergeist: player(s, x.seat)?.poltergeist ?? false, handSize: s.deal?.hands[x.seat]?.length ?? 0, sealed: player(s, x.seat)?.sealed != null })),
    haunt: { level: s.haunt.level, max: s.haunt.max, coldSpot: coldSpotIn(s.haunt, s.round), choosing: p === null ? null : { options: [...p.options], chooser: p.chooser, deadlineMs: p.deadlineMs } },
    zones: s.pool.zones.map((z) => ({ id: z.id, name: z.name })),
    events: s.log.map((e) => ({ ...e })),
    ending: s.phase === "ended" ? s.ending : null,
  };
}

export function privateSnapshot(s: EngineState, seat: number): PrivateSnapshot | null {
  const p = player(s, seat);
  if (!p || s.deal === null) return null;
  const t = s.turn;
  const pend = s.haunt.pending;
  return {
    seat, hand: (s.deal.hands[seat] ?? []).map((c) => ({ ...c })), shownToMe: p.shownToMe.map((x) => ({ ...x })), found: [...p.found], resolve: p.resolve, sealed: p.sealed,
    answer: t?.answering && t.answering.refuter === seat ? { eventId: t.answering.eventId, options: [...t.answering.held], deadlineMs: t.answering.untilMs } : null,
    choose: pend !== null && pend.chooser === seat ? { options: [...pend.options], deadlineMs: pend.deadlineMs } : null,
    heard: p.heard.map((h) => ({ ...h })),
    soundConsent: p.soundConsent,
    canEavesdrop: s.eavesdrop !== null && s.eavesdrop.suggester !== seat && s.eavesdrop.refuter !== seat && !p.poltergeist && p.resolve >= 1 && !p.heard.some((h) => h.eventId === s.eavesdrop?.eventId) ? s.eavesdrop.eventId : null,
  };
}

function wakeOf(s: EngineState, now: number): number | null {
  if (s.phase !== "playing" || s.pausedSinceMs !== null) return null;
  const t = s.turn;
  return nextWake({
    turn: t?.clock ?? null, inspectUntilMs: t?.inspecting?.untilMs ?? null, answeringUntilMs: t?.answering?.untilMs ?? null,
    windowUntilMs: t?.windowUntilMs ?? null, hauntChoiceMs: s.haunt.pending?.chooser != null ? s.haunt.pending.deadlineMs : null,
    botThinkUntilMs: t === null || t.inspecting !== null || t.answering !== null ? null : t.botDueMs, // a Bot waits for its Inspect or an answer
    disconnectEndsMs: t?.disconnectEndsMs ?? null,
    masterTimeoutMs: s.masterAwaySinceMs === null ? null : s.masterAwaySinceMs + MASTER_AWAY_MS,
  }, now);
}

/** Apply one Action. A refusal returns the same state and tells only the sender. */
export function step(state: EngineState, action: Action, now: number): StepResult {
  const applied = apply(state, action, now);
  const extra = typeof applied === "string" ? [] : applied.outbox;
  const res = typeof applied === "string" ? applied : (applied.outbox.length === 0 ? applied : { ...applied, outbox: [] });
  if (typeof res === "string") {
    const seat = action.kind === "client" ? action.seat : null;
    return { state, out: seat === null ? [] : [{ to: "seat", seat, msg: { t: "refused", code: res } }], wakeAtMs: wakeOf(state, now), refused: res };
  }
  const out: Outbound[] = [{ to: "public", msg: { t: "public", view: publicSnapshot(res, now) } }, ...extra];
  for (const x of res.seats) if (!x.bot) { const v = privateSnapshot(res, x.seat); if (v) out.push({ to: "seat", seat: x.seat, msg: { t: "private", view: v } }); }
  return { state: res, out, wakeAtMs: wakeOf(res, now) };
}

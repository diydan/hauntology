import type { PrivateSnapshot, PublicSnapshot } from "@hauntology/shared/party/engine";

/**
 * What a phone knows about the game, built only from what the Room sent it (party-mode 9). It is a plain reducer: one Room message in, a new
 * view out, no clock and no network. The Public View and this seat's Private View replace what was there; everything else is a short list the
 * screens read (the log lines, the sounds to play, the prompt, the last refusal). Nothing here decides a rule.
 */
export type LobbyInfo = Readonly<{
  code: string; masterSeat: number | null; started: boolean; worldId: string | null;
  settings: Readonly<Record<string, unknown>>; switches: Readonly<Record<string, unknown>>;
  seats: readonly Readonly<{ seat: number; nickname: string; bot: boolean; connected: boolean }>[];
}>;

/** A line of the public log, in words (the game's text never depends on sound or colour). */
export type LogLine = Readonly<{ id: number; text: string }>;

/** A sound or flash the phone should make (party-mode 9.14): the screen plays it at `playAtMs` on the server clock, or flashes when `plan` says so. */
export type SoundEvent = Readonly<{ id: string; kind: "cue" | "rattle" | "strike"; sound: string; playAtMs: number; plan: "play" | "flash" | "none"; volume?: number }>;
export type LightPlan = Readonly<{ id: string; cue: string; startAtMs: number; durationMs: number; steps: readonly Readonly<{ atMs: number; level: number }>[] }>;
export type RattlePromptView = Readonly<{ kind: "rattle-first" | "rattle-join"; text: string; button: string }>;

export type GameView = Readonly<{
  lobby: LobbyInfo | null;
  pub: PublicSnapshot | null;
  priv: PrivateSnapshot | null;
  /** The sky the Host shows, from the Public View. */
  atmosphere: Readonly<{ weather: string; timeOfDay: string; moon: string }> | null;
  log: readonly LogLine[];
  /** The newest refusal the Room sent, in its own code (the screens turn it into words). */
  refusal: Readonly<{ code: string; n: number }> | null;
  sounds: readonly SoundEvent[];
  lights: readonly LightPlan[];
  prompt: RattlePromptView | null;
  /** Set once this seat joined the haunting and the Becoming reached it. */
  becomingAtMs: number | null;
  /** "That was not you" for a House Cue or Frame on this phone. */
  notYou: readonly number[];
  /** The result of the last Stitch word check. */
  stitch: Readonly<{ word: string; ok: boolean; reason?: string }> | null;
  /** The Host's pose, for a haunting Player who is spectating. */
  pose: Readonly<{ pos: readonly [number, number, number]; yaw: number }> | null;
  ended: boolean;
}>;

export const EMPTY_GAME: GameView = { lobby: null, pub: null, priv: null, atmosphere: null, log: [], refusal: null, sounds: [], lights: [], prompt: null, becomingAtMs: null, notYou: [], stitch: null, pose: null, ended: false };

const LOG_KEEP = 60;
const KEEP_SOUNDS = 8;
type Msg = Readonly<Record<string, unknown>> & Readonly<{ t: string }>;

const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const seatName = (g: GameView, seat: number): string => g.pub?.seats.find((s) => s.seat === seat)?.nickname ?? g.lobby?.seats.find((s) => s.seat === seat)?.nickname ?? `Player ${seat}`;

/** One public event as a plain line, or null for an event that has no line of its own. Never names a secret: the event carries none. */
export function eventLine(g: GameView, e: Readonly<Record<string, unknown>>): string | null {
  const name = (k: string): string => seatName(g, num(e[k]));
  const zone = (id: unknown): string => g.pub?.zones.find((z) => z.id === id)?.name ?? str(id);
  const suspect = (id: unknown): string => g.pub?.suspects.find((z) => z.id === id)?.name ?? str(id);
  const relic = (id: unknown): string => g.pub?.relics.find((z) => z.id === id)?.name ?? str(id);
  switch (e.kind) {
    case "turn-start": return `${name("seat")}'s turn.`;
    case "suggest": return `${name("seat")} suggested ${suspect(e.suspect)} with the ${relic(e.relic)} in the ${zone(e.zone)}.`;
    case "inspect": return `${name("seat")} inspected the ${zone(e.zone)}.`;
    case "seal": return `${name("seat")} sealed an Accusation.`;
    case "accuse": return `${name("seat")} accused${e.right === true ? " and was right" : e.right === false ? " and was wrong" : ""}.`;
    case "timeout": return `${name("seat")} ran out of time.`;
    case "nudge": return `${name("seat")} gave ${name("target")} ${e.nudge === "help" ? "more" : "less"} time.`;
    case "phone-cue": return `A sound came from ${name("target")}'s phone.`;
    case "cue": return `${name("seat")} played ${str(e.cue)} ${e.place === "phone" ? "on their phone" : "on the screen"}.`;
    case "rattle": return e.level === 3 ? "The house rumbled." : e.level === 2 ? "A wind passed." : "The floorboards creaked.";
    case "haunt": return `The haunting is at level ${num(e.level)}.`;
    case "eavesdrop": return `${name("seat")} listened in.`;
    case "haunt-event": return "Something stirred in the house.";
    case "errand-caught": return `${name("seat")} caught something.`;
    case "errand-done": return `A Poltergeist was holding a ${str(e.object)}.`;
    default: return null;
  }
}

/** The public log lines for events not yet in the list. Event ids only grow, so the list stays in order and never repeats. */
function newLines(g: GameView, events: readonly Readonly<Record<string, unknown>>[]): readonly LogLine[] {
  const seen = g.log.reduce((m, l) => Math.max(m, l.id), -1);
  const add: LogLine[] = [];
  for (const e of events) {
    const id = num(e.id, -1);
    if (id <= seen) continue;
    const text = eventLine(g, e);
    if (text !== null) add.push({ id, text });
  }
  return add.length === 0 ? g.log : [...g.log, ...add].slice(-LOG_KEEP);
}

const push = <T>(list: readonly T[], item: T, keep = KEEP_SOUNDS): readonly T[] => [...list, item].slice(-keep);

/** Fold one message of the Room into the view. Unknown messages and malformed fields change nothing. */
export function applyRoomMessage(g: GameView, raw: unknown, now: number): GameView {
  if (typeof raw !== "object" || raw === null || typeof (raw as { t?: unknown }).t !== "string") return g;
  const m = raw as Msg;
  switch (m.t) {
    case "lobby": return { ...g, lobby: { code: str(m.code), masterSeat: typeof m.masterSeat === "number" ? m.masterSeat : null, started: m.started === true, worldId: typeof m.worldId === "string" ? m.worldId : null, settings: (m.settings ?? {}) as LobbyInfo["settings"], switches: (m.switches ?? {}) as LobbyInfo["switches"], seats: Array.isArray(m.seats) ? (m.seats as LobbyInfo["seats"]) : [] } };
    case "public": {
      const view = m.view as (PublicSnapshot & { atmosphere?: GameView["atmosphere"] }) | undefined;
      if (view === undefined || typeof view !== "object") return g;
      const next: GameView = { ...g, pub: view, atmosphere: view.atmosphere ?? g.atmosphere, ended: view.phase === "ended" };
      return { ...next, log: newLines(next, view.events as readonly Readonly<Record<string, unknown>>[]) };
    }
    case "private": return m.view === undefined ? g : { ...g, priv: m.view as PrivateSnapshot };
    case "refused": return { ...g, refusal: { code: str(m.code), n: (g.refusal?.n ?? 0) + 1 } };
    case "cue": return { ...g, sounds: push(g.sounds, { id: `cue-${num(m.eventId)}`, kind: "cue", sound: str(m.cue), playAtMs: num(m.playAtMs), plan: m.plan === "flash" || m.plan === "none" ? m.plan : "play" }) };
    case "tvCue": return g;
    case "notYou": return { ...g, notYou: push(g.notYou, num(m.eventId)) };
    case "rattleSound": return { ...g, sounds: push(g.sounds, { id: `rattle-${num(m.eventId)}`, kind: "rattle", sound: str(m.sound), playAtMs: num(m.playAtMs), plan: m.plan === "flash" || m.plan === "none" ? m.plan : "play", volume: Math.min(0.8, num(m.volume, 0.8)) }) };
    case "strike": return { ...g, sounds: push(g.sounds, { id: `strike-${num(m.atMs)}`, kind: "strike", sound: `bell-${num(m.count)}`, playAtMs: num(m.atMs), plan: m.plan === "flash" || m.plan === "none" ? m.plan : "play" }) };
    case "lightCue": return { ...g, lights: push(g.lights, { id: `light-${num(m.startAtMs)}-${str(m.cue)}`, cue: str(m.cue), startAtMs: num(m.startAtMs), durationMs: Math.min(6000, num(m.durationMs)), steps: Array.isArray(m.steps) ? (m.steps as LightPlan["steps"]) : [] }, 4) };
    case "becoming": {
      // the sting plays on this phone only with its own yes to sound, and counts as no sound (party-mode 19.6)
      const consent = g.priv?.soundConsent === true;
      return { ...g, becomingAtMs: num(m.atMs, now), sounds: push(g.sounds, { id: `becoming-${num(m.atMs, now)}`, kind: "cue", sound: "becoming", playAtMs: num(m.atMs, now), plan: consent ? "play" : "none" }) };
    }
    case "prompt": return m.kind === "rattle-first" || m.kind === "rattle-join" ? { ...g, prompt: { kind: m.kind, text: str(m.text), button: str(m.button) } } : g;
    case "scripted": {
      const text = str(m.line);
      return text === "" ? g : { ...g, log: [...g.log, { id: g.log.reduce((x, l) => Math.max(x, l.id), 0) + 1, text }].slice(-LOG_KEEP) };
    }
    case "stitch_log": return { ...g, log: [...g.log, { id: g.log.reduce((x, l) => Math.max(x, l.id), 0) + 1, text: "A voice whispered." }].slice(-LOG_KEEP) };
    case "stitchResult": return { ...g, stitch: { word: str(m.word), ok: m.ok === true, ...(typeof m.reason === "string" ? { reason: m.reason } : {}) } };
    case "pose": return Array.isArray(m.pos) && m.pos.length === 3 ? { ...g, pose: { pos: [num(m.pos[0]), num(m.pos[1]), num(m.pos[2])], yaw: num(m.yaw) } } : g;
    case "ended": return { ...g, ended: true };
    default: return g;
  }
}

/** Dismiss the prompt the Player has answered. */
export const clearPrompt = (g: GameView): GameView => (g.prompt === null ? g : { ...g, prompt: null });

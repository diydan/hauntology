import { CUES } from "@hauntology/shared/party/cues";
import { applyRoomMessage, EMPTY_GAME, type GameView } from "../controller/game-view";

/**
 * What the Host screen knows (party-mode 8): the Public View and the lobby as every screen sees them, plus what only the Host is told to play or
 * show (a Cue on the TV, a Rattle, the Becoming, the hour strike, the whispered Stitch line, a spoken line) and the active Detective's input.
 * A plain reducer, like the phone's: no clock, no network. Nothing here is a Private View and nothing here can name a hidden card.
 */
export type TvCue = Readonly<{ id: string; cue: string; caption: string; playAtMs: number }>;
export type RattleCue = Readonly<{ id: string; level: number; sound: string; volume: number; playAtMs: number; line: string }>;
export type HostInput = Readonly<{ seat: number; move: readonly [number, number]; look: readonly [number, number]; aim?: readonly [number, number] }>;
export type Whisper = Readonly<{ id: string; subtitle: string; clips: readonly Readonly<{ word: string; contentType: string; durationMs: number; audio: string }>[] }>;
export type SpokenLine = Readonly<{ lineId: string; text: string; kind: string }>;
/** The Host decodes at most 8 lines ahead (ghost-voice 1.9). */
export const MAX_PREFETCH_IDS = 8;
export type SpeechAction = "mute" | "unmute" | "replay" | "skip";

export type HostView = Readonly<{
  game: GameView;
  tvCues: readonly TvCue[];
  rattles: readonly RattleCue[];
  becomings: readonly Readonly<{ id: string; seat: number; atMs: number; durationMs: number; fadeOrder: readonly number[] }>[];
  strikes: readonly Readonly<{ id: string; atMs: number; count: number; midnight: boolean }>[];
  whispers: readonly Whisper[];
  spoken: readonly SpokenLine[];
  speechOn: boolean;
  speechAction: Readonly<{ action: SpeechAction; n: number }> | null;
  /** The line ids the Room listed for decoding ahead (ghost-voice 4.8); nothing else is ever prefetched. */
  prefetch: readonly string[];
  input: HostInput | null;
  recapSkipped: number;
  songs: readonly Readonly<{ key: string; title: string; captions: string }>[];
}>;

export const EMPTY_HOST: HostView = { game: EMPTY_GAME, tvCues: [], rattles: [], becomings: [], strikes: [], whispers: [], spoken: [], speechOn: false, speechAction: null, prefetch: [], input: null, recapSkipped: 0, songs: [] };

const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const push = <T>(list: readonly T[], item: T, keep = 8): readonly T[] => [...list, item].slice(-keep);
const pair = (v: unknown): [number, number] | null => (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n)) ? [v[0], v[1]] : null);

export function applyHostMessage(h: HostView, raw: unknown, now: number): HostView {
  if (typeof raw !== "object" || raw === null || typeof (raw as { t?: unknown }).t !== "string") return h;
  const m = raw as { t: string } & Record<string, unknown>;
  switch (m.t) {
    case "setAtmosphere":
      return typeof m.weather === "string" && typeof m.timeOfDay === "string" && typeof m.moon === "string"
        ? { ...h, game: { ...h.game, atmosphere: { weather: m.weather, timeOfDay: m.timeOfDay, moon: m.moon } } } : h;
    case "tvCue": {
      const cue = CUES.find((c) => c.id === m.cue);
      return cue === undefined ? h : { ...h, tvCues: push(h.tvCues, { id: `tv-${num(m.eventId)}`, cue: cue.id, caption: cue.caption, playAtMs: num(m.playAtMs, now) }) };
    }
    case "rattleSound":
      return { ...h, rattles: push(h.rattles, { id: `rattle-${num(m.eventId)}`, level: num(m.level, 1), sound: str(m.sound), volume: Math.min(0.8, num(m.volume, 0.8)), playAtMs: num(m.playAtMs, now), line: str(m.line) }) };
    case "becoming":
      return { ...h, becomings: push(h.becomings, { id: `becoming-${num(m.seat)}-${num(m.atMs)}`, seat: num(m.seat), atMs: num(m.atMs, now), durationMs: Math.min(4000, num(m.durationMs, 4000)), fadeOrder: Array.isArray(m.fadeOrder) ? (m.fadeOrder as number[]) : [] }) };
    case "strike":
      return { ...h, strikes: push(h.strikes, { id: `strike-${num(m.atMs)}`, atMs: num(m.atMs), count: Math.min(12, Math.max(1, num(m.count, 1))), midnight: m.midnight === true }) };
    case "stitch":
      return { ...h, whispers: push(h.whispers, { id: str(m.eventId), subtitle: str(m.subtitle), clips: Array.isArray(m.clips) ? (m.clips as Whisper["clips"]) : [] }, 4) };
    case "voice":
      return { ...h, spoken: push(h.spoken, { lineId: str(m.lineId), text: str(m.text), kind: str(m.kind) }, 6) };
    case "speech":
      return { ...h, speechOn: m.on === true };
    case "speechControl":
      return m.action === "mute" || m.action === "unmute" || m.action === "replay" || m.action === "skip" ? { ...h, speechAction: { action: m.action, n: (h.speechAction?.n ?? 0) + 1 } } : h;
    case "prefetch":
      return Array.isArray(m.lineIds) ? { ...h, prefetch: (m.lineIds as unknown[]).filter((id): id is string => typeof id === "string" && id !== "").slice(0, MAX_PREFETCH_IDS) } : h;
    case "recapSkip":
      return { ...h, recapSkipped: h.recapSkipped + 1 };
    case "song":
      return { ...h, songs: push(h.songs, { key: str(m.key), title: str(m.title), captions: str(m.captions) }, 3) };
    case "input": {
      const move = pair(m.input && (m.input as { move?: unknown }).move);
      const look = pair(m.input && (m.input as { look?: unknown }).look);
      if (move === null || look === null) return h;
      const aim = pair((m.input as { aim?: unknown }).aim);
      return { ...h, input: { seat: num(m.seat), move, look, ...(aim ? { aim } : {}) } };
    }
    default:
      return { ...h, game: applyRoomMessage(h.game, raw, now) };
  }
}

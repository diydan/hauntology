import { hash } from "../puzzles/rng";
import { lodgerVoiceFor, LODGER_VOICE_ORDER, type LodgerVoice } from "../voice/voices";
import type { LineKind } from "../voice/line";
import type { EngineEvent, EngineState } from "./engine";
import type { CueName } from "./game";
import type { LobbyContrib } from "./lobby-contrib";
import type { Seat } from "./room";
import { PRESET_GHOST_IDS } from "./preset-ghosts";
import type { PartyDirective } from "./narrate";
import type { PublicEvent, PublicView } from "./views";

/**
 * Which public events the Room narrates, and in which Voice (party-mode 2.114, 6). Pure: it reads the Engine's public log and the
 * lobby's own record, never a Hand, the Solution before the ending, or a guilt flag.
 *
 * Only the key moments are narrated: a Room speaks at most 20 lines (ghost-voice 2.3), so the sealing of an accusation, the
 * Accusation itself and a Haunt Event get the voice, and the many small turns do not.
 */

/** The directive an Engine log entry is narrated as, or `null` when it is not narrated. */
export function directiveOfLog(e: EngineEvent): PartyDirective | null {
  switch (e.kind) {
    case "seal": return "seal";
    case "accuse": return e.right ? "accuse-right" : "accuse-wrong";
    case "haunt-event": return "haunt-event";
    default: return null;
  }
}

/** The voice kind of a directive (`decideSpeak` keeps only key moments once a Room is past its 14th spoken line). */
export function lineKindOf(kind: PartyDirective): LineKind {
  if (kind === "haunt-event" || kind === "poltergeist") return "haunt_event";
  if (kind === "ended-solved" || kind === "ended-haunted" || kind === "accuse-right") return "ending";
  return "narration";
}

/** The log entries from `fromId` on that have a directive, oldest first. */
export function narratableLog(log: readonly EngineEvent[], fromId: number): { id: number; kind: PartyDirective }[] {
  const out: { id: number; kind: PartyDirective }[] = [];
  for (const e of log) {
    if (e.id < fromId) continue;
    const kind = directiveOfLog(e);
    if (kind !== null) out.push({ id: e.id, kind });
  }
  return out;
}

const sd = (n: number): Seat => n as Seat;
const CUES: readonly string[] = ["creak", "whisper", "bell", "laugh"];

/** The Public View of the Engine's state, for the narrator's prompt and the confession: the same fields a phone is sent, nothing secret. */
export function viewOfEngine(s: EngineState): PublicView {
  const events: PublicEvent[] = [];
  for (const e of s.log) {
    switch (e.kind) {
      case "suggest": events.push({ id: e.id, kind: "suggest", seat: sd(e.seat), zone: e.zone, suspect: e.suspect, relic: e.relic, refuter: e.refuter === null ? null : sd(e.refuter) }); break;
      case "inspect": events.push({ id: e.id, kind: "inspect", seat: sd(e.seat), zone: e.zone }); break;
      case "seal": events.push({ id: e.id, kind: "accuse", seat: sd(e.seat), right: null }); break;
      case "accuse": events.push({ id: e.id, kind: "accuse", seat: sd(e.seat), right: e.right }); break;
      case "phone-cue": events.push({ id: e.id, kind: "phone-cue", target: sd(e.target), cue: (CUES.includes(e.cue ?? "") ? e.cue : "creak") as CueName }); break;
      case "rattle": events.push({ id: e.id, kind: "rattle", target: sd(e.target) }); break;
      default: break;
    }
  }
  return {
    phase: s.phase === "ended" ? "ended" : "playing",
    suspects: s.pool.suspects.map((x) => ({ id: x.id, profileId: x.profileId })),
    zones: s.pool.zones.map((z) => ({ id: z.id, name: z.name })),
    relics: s.pool.relics.map((r) => ({ id: r.id, name: r.name })),
    players: s.seats.map((x) => ({ seat: sd(x.seat), nickname: x.nickname, bot: x.bot, poltergeist: s.players.find((p) => p.seat === x.seat)?.poltergeist ?? false, handSize: s.deal?.hands[x.seat]?.length ?? 0 })),
    events,
    ending: s.phase === "ended" && s.ending !== null ? { solution: { ...s.ending.solution }, residueAt: { ...s.ending.residueAt }, sources: [] } : null,
  };
}

/**
 * The Lodger Voice of one Suspect's profile: the voice its maker picked (kept in the lobby's record), else a Preset Ghost's own
 * stable voice. It reads the profile id alone, so a voice can never tell who is guilty.
 */
export function lodgerVoiceOfProfile(contrib: Pick<LobbyContrib, "ghosts"> | undefined, profileId: string): LodgerVoice {
  const made = Object.values(contrib?.ghosts ?? {}).find((g) => g.profileId === profileId);
  if (made?.lodgerVoice !== undefined) return lodgerVoiceFor({ lodgerVoice: made.lodgerVoice });
  const i = (PRESET_GHOST_IDS as readonly string[]).indexOf(profileId);
  return lodgerVoiceFor({ lodgerVoice: LODGER_VOICE_ORDER[(i >= 0 ? i : hash(profileId)) % LODGER_VOICE_ORDER.length] });
}

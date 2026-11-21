import { z } from "zod";
import { ERRAND_OBJECTS } from "./errands";
import { SIGNS } from "../puzzles/world-clues";
import type { ClientMsg } from "./engine";

/**
 * The socket protocol (party-mode design, "Socket messages"): every message from a device is checked here before it
 * reaches the Engine. Unknown, malformed or oversized messages are refused, and the Room closes that socket.
 */
export const MAX_MESSAGE_BYTES = 8 * 1024;

const id = z.string().min(1).max(32);
const level = z.enum(["off", "easy", "medium", "hard"]);
const cue = z.string().max(16);

export const ClientMsgSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("start") }).strict(),
  z.object({ t: z.literal("walk"), zone: id }).strict(),
  z.object({ t: z.literal("inspect") }).strict(),
  z.object({ t: z.literal("suggest"), suspect: id, relic: id }).strict(),
  z.object({ t: z.literal("show"), card: id }).strict(),
  z.object({ t: z.literal("seal"), suspect: id, zone: id, relic: id }).strict(),
  z.object({ t: z.literal("endTurn") }).strict(),
  z.object({ t: z.literal("pass") }).strict(),
  z.object({ t: z.literal("choose"), option: z.enum(["cold-spot", "blackout", "restless", "lull", "slam"]) }).strict(),
  z.object({ t: z.literal("nudge"), kind: z.enum(["help", "spook"]) }).strict(),
  z.object({ t: z.literal("eavesdrop"), eventId: z.number().int().nonnegative() }).strict(),
  z.object({ t: z.literal("pause") }).strict(),
  z.object({ t: z.literal("resume") }).strict(),
  z.object({ t: z.literal("cue"), cue, place: z.enum(["tv", "phone"]).optional() }).strict(),
  z.object({ t: z.literal("frame"), target: z.number().int().min(1).max(6), cue }).strict(),
  z.object({ t: z.literal("rattleOn"), on: z.boolean() }).strict(),
  z.object({ t: z.literal("rattle"), via: z.enum(["shake", "button"]) }).strict(),
  z.object({ t: z.literal("sound"), consent: z.boolean(), audio: z.boolean().optional() }).strict(),
  z.object({
    t: z.literal("settings"), preset: z.enum(["classic", "gentle", "quick"]).optional(), nudges: z.enum(["all", "help-only", "off"]).optional(),
    frames: z.boolean().optional(), sounds: z.boolean().optional(), puzzles: level.optional(),
    baseSeconds: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90), z.null()]).optional(),
    hauntMax: z.union([z.literal(8), z.literal(10), z.literal(12)]).optional(),
    cluePlace: z.enum(["phone", "world"]).optional(),
    errands: z.boolean().optional(),
    selfies: z.boolean().optional(),
    /** The separate switches the presets set (party-mode 12.5): auto-cross in the notebook, and the Bots' level. */
    autoCross: z.boolean().optional(),
    botLevel: z.enum(["standard", "gentle"]).optional(),
  }).strict(),
  z.object({ t: z.literal("errandOptOut"), on: z.boolean() }).strict(),
  z.object({ t: z.literal("errandDone") }).strict(),
  z.object({ t: z.literal("errandAnswer"), yes: z.boolean() }).strict(),
  z.object({ t: z.literal("errandCaught"), poltergeist: z.number().int().min(1).max(6), object: z.enum(ERRAND_OBJECTS) }).strict(),
  z.object({ t: z.literal("attempt"), lockId: id, transcript: z.unknown() }).strict(),
  z.object({ t: z.literal("giveUp"), lockId: id }).strict(),
  z.object({ t: z.literal("sightAck"), sightId: id }).strict(),
  z.object({ t: z.literal("clueSeen"), sign: z.enum(SIGNS) }).strict(),
  z.object({ t: z.literal("plainInspect"), on: z.boolean() }).strict(),
  /** This seat's Assist setting (puzzles 8.3): under Assist a Spirit board Lock also carries its word as text, for that seat only. */
  z.object({ t: z.literal("assist"), on: z.boolean() }).strict(),
  /** A human Poltergeist starts their one Haunting puzzle of the Round (puzzles 12.3). Attempts and give-ups reuse `attempt` and `giveUp`. */
  z.object({ t: z.literal("hauntPuzzle") }).strict(),
  /** A Player acts on a heavy door (knock-door 4.1). */
  z.object({ t: z.literal("doorAct"), doorId: id }).strict(),
  /** A Player knocks back at the TV after a Slam: the times of their knocks in ms (knock-door 5.3). At most 64, like every knock transcript. */
  z.object({ t: z.literal("tvKnock"), times: z.array(z.number().finite().nonnegative()).max(64) }).strict(),
  /** A Detective's try at a knock door: the times of their knocks in ms (knock-door 3.3). At most 64, like every knock transcript. */
  z.object({ t: z.literal("doorKnock"), doorId: id, times: z.array(z.number().finite().nonnegative()).max(64) }).strict(),
]);

/** Room controls handled by the server around the Engine (the lobby), not by the Engine itself. */
export const RoomMsgSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("hello"), token: z.string().regex(/^[0-9a-f]{32}$/) }).strict(),
  z.object({ t: z.literal("addBot") }).strict(),
  z.object({ t: z.literal("end") }).strict(),
  z.object({ t: z.literal("handOver"), seat: z.number().int().min(1).max(6) }).strict(),
  /** The host only, in an empty lobby: fill the Room with Bots and start (an all-Bot game, integration 3.4). */
  /** The Master, after an ending: a new case with the same seats and settings, a new deal (party-mode 8.5). */
  z.object({ t: z.literal("playAgain") }).strict(),
  z.object({ t: z.literal("startBots"), bots: z.number().int().min(2).max(6).optional() }).strict(),
  z.object({ t: z.literal("speech"), action: z.enum(["on", "off"]) }).strict(),
  z.object({ t: z.literal("stitchSetting"), on: z.boolean() }).strict(),
  z.object({ t: z.literal("stitchAnswer"), seat: z.number().int().min(1).max(6).optional(), yes: z.boolean(), tick: z.boolean() }).strict(),
  /** The Master chooses the world (party-mode 4.11): checked at once, so a world too small is refused before the lobby closes. */
  z.object({ t: z.literal("world"), id: z.string().min(1).max(64), walkRadius: z.number().finite().min(0).max(10_000), authoredZones: z.boolean().optional(),
    bounds: z.object({ min: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]), max: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]) }).strict().optional() }).strict(),
  /** The Master's room switches (party-mode 9.21): the sky, the hour strike, the light bar, Rattle and Stitch. */
  z.object({ t: z.literal("roomSettings"), conditions: z.enum(["off", "place", "table"]).optional(), place: z.object({ lat: z.number().finite().min(-90).max(90), lon: z.number().finite().min(-180).max(180), tz: z.string().max(64).optional(), label: z.string().max(64).optional() }).strict().nullable().optional(), hourStrike: z.boolean().optional(), lightBar: z.boolean().optional(), rattle: z.boolean().optional(), stitch: z.boolean().optional() }).strict(),
  /** A phone's stick and look (party-mode 2.2). Never stored; only the active Detective's input reaches the Host. */
  z.object({ t: z.literal("input"), seq: z.number().int().nonnegative(), move: z.tuple([z.number(), z.number()]), look: z.tuple([z.number(), z.number()]), aim: z.tuple([z.number(), z.number()]).optional() }).strict(),
  /** The Host's pose (party-mode 4.5), at most 4 a second; never stored. */
  z.object({ t: z.literal("pose"), pos: z.tuple([z.number(), z.number(), z.number()]), yaw: z.number() }).strict(),
  /** The Host's offset from UTC in minutes, for the hour strike (party-mode 15.1). */
  z.object({ t: z.literal("hostClock"), offsetMin: z.number().int().min(-840).max(840) }).strict(),
  /** The clock exchange (party-mode 17.3): `ping` is answered with `pong`; `clockSample` reports one finished exchange. */
  z.object({ t: z.literal("ping"), id: z.number().int().nonnegative(), clientMs: z.number().finite() }).strict(),
  z.object({ t: z.literal("clockSample"), sentMs: z.number().finite(), serverMs: z.number().finite(), receivedMs: z.number().finite() }).strict(),
  /** A phone's own yes to the light bar (party-mode 17.1), and whether its Player prefers reduced motion. */
  z.object({ t: z.literal("light"), consent: z.boolean(), reducedMotion: z.boolean().optional() }).strict(),
  z.object({ t: z.literal("songsSetting"), setting: z.enum(["off", "stock", "on"]) }).strict(),
  z.object({ t: z.literal("songMute"), muted: z.boolean() }).strict(),
  z.object({ t: z.literal("songSkip") }).strict(),
  z.object({ t: z.literal("singMyName"), seat: z.number().int().min(1).max(6).optional(), yes: z.boolean() }).strict(),
]);
export type RoomMsg = z.infer<typeof RoomMsgSchema>;

export type Parsed = Readonly<{ kind: "room"; msg: RoomMsg }> | Readonly<{ kind: "game"; msg: ClientMsg }> | Readonly<{ kind: "bad" }>;

/** Parse one socket message. Never throws. Anything too big or not on the list is `bad`. */
export function parseClientMessage(raw: string): Parsed {
  if (raw.length > MAX_MESSAGE_BYTES) return { kind: "bad" };
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return { kind: "bad" }; }
  const room = RoomMsgSchema.safeParse(v);
  if (room.success) return { kind: "room", msg: room.data };
  const game = ClientMsgSchema.safeParse(v);
  if (game.success) return { kind: "game", msg: game.data as ClientMsg };
  return { kind: "bad" };
}

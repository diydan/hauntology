import { z } from "zod";
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
  z.object({ t: z.literal("choose"), option: z.enum(["cold-spot", "blackout", "restless", "lull"]) }).strict(),
  z.object({ t: z.literal("nudge"), kind: z.enum(["help", "spook"]) }).strict(),
  z.object({ t: z.literal("eavesdrop"), eventId: z.number().int().nonnegative() }).strict(),
  z.object({ t: z.literal("pause") }).strict(),
  z.object({ t: z.literal("resume") }).strict(),
  z.object({ t: z.literal("cue"), cue, place: z.enum(["tv", "phone"]).optional() }).strict(),
  z.object({ t: z.literal("frame"), target: z.number().int().min(1).max(6), cue }).strict(),
  z.object({ t: z.literal("sound"), consent: z.boolean(), audio: z.boolean().optional() }).strict(),
  z.object({
    t: z.literal("settings"), preset: z.enum(["classic", "gentle", "quick"]).optional(), nudges: z.enum(["all", "help-only", "off"]).optional(),
    frames: z.boolean().optional(), sounds: z.boolean().optional(), puzzles: level.optional(),
    baseSeconds: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90), z.null()]).optional(),
    hauntMax: z.union([z.literal(8), z.literal(10), z.literal(12)]).optional(),
  }).strict(),
  z.object({ t: z.literal("attempt"), lockId: id, transcript: z.unknown() }).strict(),
  z.object({ t: z.literal("giveUp"), lockId: id }).strict(),
  z.object({ t: z.literal("sightAck"), sightId: id }).strict(),
  z.object({ t: z.literal("plainInspect"), on: z.boolean() }).strict(),
  /** A Player acts on a heavy door (knock-door 4.1). */
  z.object({ t: z.literal("doorAct"), doorId: id }).strict(),
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

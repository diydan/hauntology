import { z } from "zod";
import { AtmosphereSchema, ConditionsSnapshotSchema, type ConditionsSnapshot } from "../conditions/types";
import { AnchorIdSchema, AnchorSchema, Vec3Schema } from "../app/events";
import { VOICE_LINES_KEPT, VoiceLineSchema, type VoiceLine } from "../voice/line";
import { ARCHETYPES, type Anchor, type GameState, type Pose, type Seed, type Voice } from "./types";

/** A Session is kept for a day and then deleted (Requirement 1.4). */
export const SESSION_TTL_MS = 24 * 3_600_000;

const MemorySchema = z.object({ anchorId: AnchorIdSchema, archetype: z.enum(ARCHETYPES), text: z.string().max(2000) });
const SeedSchema = z.object({ anchorId: AnchorIdSchema, archetype: z.enum(ARCHETYPES), hook: z.string().max(200) });
const Count = z.number().int().min(0).max(1_000_000);
const GameStateSchema = z.object({
  turn: Count,
  found: z.array(AnchorIdSchema).max(3),
  ended: z.boolean(),
  idleTurns: Count,
  memories: z.array(MemorySchema).max(3),
  history: z.array(z.object({ role: z.enum(["visitor", "ghost"]), text: z.string().max(2000) })).max(32),
  llmTurns: Count,
  lastTurnAt: z.number().finite().nullable(),
  lastProgressAt: z.number().finite(),
  seedState: z.number().int().min(0).max(0xffffffff),
});

export const PlaySessionSchema = z.object({
  v: z.literal(1),
  id: z.string().min(1).max(128),
  worldId: z.string().min(1).max(128),
  ownerSid: z.string().min(1).max(128),
  voice: z.enum(["wistful", "stern"]),
  anchors: z.array(AnchorSchema).length(3),
  seeds: z.array(SeedSchema).length(3),
  state: GameStateSchema,
  pose: z.object({ pos: Vec3Schema, yaw: z.number().finite() }),
  createdAt: z.number().finite(),
  expiresAt: z.number().finite(),
  atmosphere: AtmosphereSchema.nullable(),
  // The frozen conditions snapshot of this game (conditions 3.3). One that is corrupt is replaced by none (the normal look), as the design says, and does not end the game.
  conditions: ConditionsSnapshotSchema.nullable().optional().catch(null),
  /** Narration-only marker tracking whether a star was already named this game (conditions 5.3; never enters GameState rules). */
  starNamed: z.boolean().optional().catch(false),
  // The lines the ghost may be heard saying (ghost-voice 3.5): the last 8, each kept ten minutes. A game stored before there were any, or with a damaged list, plays on with none.
  voiceLines: z.array(VoiceLineSchema).max(VOICE_LINES_KEPT).optional().catch([]),
});

export type PlaySession = {
  v: 1;
  id: string;
  worldId: string;
  /** The Session (cookie) that started it: only that visitor may play, read or reset it, whoever owns the world. */
  ownerSid: string;
  voice: Voice;
  anchors: Anchor[];
  /** Server only: never sent to a client. */
  seeds: Seed[];
  state: GameState;
  pose: Pose;
  createdAt: number;
  expiresAt: number;
  atmosphere: z.infer<typeof AtmosphereSchema> | null;
  /** The conditions read once at the start and kept frozen for this game: a rounded Place and its label, the Memory Day, the sky. Absent when none was chosen. Deleted with the game. */
  conditions?: ConditionsSnapshot | null | undefined;
  /** Narration-only marker recording whether a star has been named this game (kept out of GameState rules). */
  starNamed?: boolean | undefined;
  /** The last lines the ghost said (at most 8, each live for ten minutes) that the speech route can find by id. Server only: the client is only ever given a line's id. Absent in an older game. */
  voiceLines?: VoiceLine[];
};

export const serializeSession = (s: PlaySession): string => JSON.stringify(s);

/** A stored Session, or `null` for anything that is not one: text that is not JSON, or JSON of another shape, is not trusted. */
export function parseSession(text: unknown): PlaySession | null {
  if (typeof text !== "string") return null;
  try {
    const r = PlaySessionSchema.safeParse(JSON.parse(text));
    return r.success ? (r.data as PlaySession) : null;
  } catch {
    return null;
  }
}

export const isExpired = (s: Pick<PlaySession, "expiresAt">, now: number): boolean => !(now < s.expiresAt);

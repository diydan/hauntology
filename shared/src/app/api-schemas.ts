import { z } from "zod";
import { AtmosphereSchema } from "../conditions/types";
import { ErrorCode } from "../errors";
import { AnchorIdSchema, AnchorSchema } from "./events";
import { JOB_STATES } from "./types";

/**
 * What the real `ApiClient` accepts from each route. A body that does not fit is not trusted: the
 * client turns it into a failure, so a Screen never meets an unexpected shape. The demo `FakeApi`
 * is tested against the same schemas, so the two cannot drift apart.
 *
 * Objects are not strict: a field the shell does not know is dropped, not passed on. The one
 * exception is `Atmosphere`, which is strict, so a precise place can never ride along.
 *
 * Every URL is a path on the app's own origin: a single leading slash, no scheme, no host.
 */

/** A path on this origin: one leading slash, no scheme or host, no spaces or backslashes. */
export const OWN_PATH = /^\/(?!\/)[^\s\\]*$/;
export const OwnPathSchema = z.string().max(512).regex(OWN_PATH);

const Id = z.string().min(1).max(128);
const Text = (max: number) => z.string().max(max);
const Count = z.number().int().min(0).max(1_000_000);

const ERROR_CODES = Object.values(ErrorCode) as [ErrorCode, ...ErrorCode[]];
export const ErrorCodeSchema = z.enum(ERROR_CODES);

export const QuotaSnapshotSchema = z.object({ world: Count, image: Count, llm: Count, tts: Count, stt: Count, live: Count });

/** The answer to `POST /api/worlds/quote`: the exact picture, what is left, and the Confirm Token (world-pipeline 4.2). */
export const QuoteSchema = z.object({
  imageUrl: OwnPathSchema,
  quota: QuotaSnapshotSchema,
  confirmToken: z.string().min(1).max(512),
  needsTurnstile: z.boolean(),
  turnstileSiteKey: z.string().min(1).max(128).optional(),
});

export const ShellFlagsSchema = z.object({
  worldGenEnabled: z.boolean(),
  dayCapReached: z.boolean(),
  totalCapReached: z.boolean(),
  voiceEnabled: z.boolean(),
  liveEnabled: z.boolean(),
  partyEnabled: z.boolean(),
  ghostModel: z.boolean(),
});

export const SessionRecordSchema = z.object({
  lastWorldId: Id.optional(),
  lastPlayId: Id.optional(),
  ackNotice: z.boolean(),
  flags: ShellFlagsSchema,
});

export const GalleryItemSchema = z.object({
  id: Id,
  title: Text(200),
  description: Text(600),
  thumbUrl: OwnPathSchema,
  attribution: Text(300),
});

export const GhostPresetSchema = z.object({ id: Id, name: Text(60), spriteUrl: OwnPathSchema });

export const GhostProfileViewSchema = z.object({ name: Text(60), spriteUrl: OwnPathSchema, voice: z.enum(["soft", "dry"]) });

export const CandidateSchema = z.object({ imageId: Id, imageUrl: OwnPathSchema });

export const WorldStatusSchema = z.object({
  id: Id,
  status: z.enum(JOB_STATES),
  title: Text(200).optional(),
  thumbUrl: OwnPathSchema.optional(),
  failure: z.object({ code: ErrorCodeSchema, quotaReturned: z.boolean(), retryAllowed: z.boolean() }).optional(),
  shared: z.boolean().optional(),
});

export const PlayViewSchema = z.object({
  found: z.array(AnchorIdSchema).max(3),
  anchors: z.array(AnchorSchema).max(3),
  hauntLevel: z.number().finite().min(0).max(1),
  ghostVisible: z.boolean(),
  ended: z.boolean(),
  journal: z.array(z.object({ anchorId: AnchorIdSchema, text: Text(1000) })).max(3),
  atmosphere: AtmosphereSchema.nullable(),
});

export const PlaceMatchSchema = z.object({
  label: Text(200),
  lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180),
  tz: Text(64).nullable(),
});

/** One schema for each `ShellApi` call that returns JSON. `speak` returns audio and has none. */
export const API_SCHEMAS = {
  session: SessionRecordSchema,
  ackNotice: z.null(),
  quota: QuotaSnapshotSchema,
  gallery: z.array(GalleryItemSchema).max(100),
  uploadPhoto: z.object({ imageId: Id, imageUrl: OwnPathSchema }),
  sketchRender: z.object({ candidates: z.array(CandidateSchema).max(8), quota: QuotaSnapshotSchema }),
  sketchSelect: z.object({ imageId: Id }),
  placeBrief: z.object({ brief: Text(2000), safe: z.boolean() }),
  quote: QuoteSchema,
  createWorld: z.object({ worldId: Id, status: z.enum(JOB_STATES) }),
  world: WorldStatusSchema,
  deleteWorld: z.null(),
  shareWorld: z.object({ shared: z.boolean() }),
  ghostPresets: z.array(GhostPresetSchema).max(12),
  ghostProfile: GhostProfileViewSchema,
  searchPlaces: z.array(PlaceMatchSchema).max(5),
  listen: z.object({ transcript: Text(1000) }),
  playStart: z.object({ playId: Id, view: PlayViewSchema }),
  playTurn: z.object({
    reply: z.object({ text: Text(2000), scripted: z.boolean(), voice: z.object({ lineId: Id }).optional() }),
    view: PlayViewSchema,
  }),
  playGet: z.object({ worldId: Id, view: PlayViewSchema }),
} as const;

export type ApiSchemaName = keyof typeof API_SCHEMAS;

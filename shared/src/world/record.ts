import { z } from "zod";
import { ErrorCodeSchema } from "../app/api-schemas";
import { JOB_STATES } from "../app/types";
import { WorldManifestSchema } from "./manifest";

const Id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

/**
 * What the `WorldJob` Durable Object keeps for one user world. Ids are limited to plain characters
 * because they become R2 keys. A Gallery world is never kept there (its manifest is its record), so
 * the kind is always `user` and the owner is always named. Unknown fields are dropped.
 */
export const StoredWorldSchema = z.object({
  id: Id,
  kind: z.literal("user"),
  ownerSid: z.string().min(1).max(128),
  status: z.enum(JOB_STATES),
  title: z.string().max(200).optional(),
  failure: z.object({ code: ErrorCodeSchema, quotaReturned: z.boolean(), retryAllowed: z.boolean() }).optional(),
  manifest: WorldManifestSchema.optional(),
  imageId: Id.optional(),
  candidateIds: z.array(Id).max(16).optional(),
  /** A short name for the Confirm Token that started this world, so the same token cannot start another (Requirement 4.4). */
  confirmId: z.string().regex(/^[A-Za-z0-9_-]{22}$/).optional(),
  /** The Place Brief and where the picture came from, kept for the manifest the ingest writes. */
  brief: z.string().max(2000).optional(),
  source: z.enum(["upload", "sketch"]).optional(),
  /** The owner has turned the share link on: anyone with the id may read the world (world-pipeline 9.2). Off unless set. */
  shared: z.boolean().optional(),
});
export type StoredWorld = z.infer<typeof StoredWorldSchema>;

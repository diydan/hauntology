import { z } from "zod";
import { QuoteSchema, QuotaSnapshotSchema, WorldStatusSchema } from "../app/api-schemas";
import { STAGE_COPY } from "../app/haunt-copy";
import { stageOf } from "../app/stage";
import type { JobState } from "../app/types";
import { WorldManifestSchema } from "./manifest";

/**
 * The shapes the world pipeline's routes answer with (world-pipeline 3.1), written once so the API can be tested against the
 * same schemas the shell reads them with. Pure: nothing here reads a clock or the network.
 *
 * - `WorldManifestSchema` is in `manifest.ts` (Requirement 8.2); an asset path in it is a file name, never a URL.
 * - `QuotaSchema` (`GET /api/quota`, Requirement 5.7): what is left on each meter, nothing about anyone else.
 * - `QuoteSchema` (`POST /api/worlds/quote`): the picture, the quota and the Confirm Token.
 * - `JobStatusSchema` (`GET /api/worlds/:id`, Requirements 7.3 and 8.2): the state, its progress label, and the manifest once ready.
 *
 * The shell's own `WorldStatusSchema` is the part of the status it reads; it is not strict, so it drops the manifest and the label.
 * Every `JobStatus` is also a `WorldStatus`.
 */
export { WorldManifestSchema, QuoteSchema };
export const QuotaSchema = QuotaSnapshotSchema;
export type Quota = z.infer<typeof QuotaSchema>;
export type Quote = z.infer<typeof QuoteSchema>;

/** The words for each job state: the Stage labels of the Haunt screen (`steering/visual-style.md`), so the server and the shell cannot say different things. */
export const progressLabel = (state: JobState): string => STAGE_COPY[stageOf(state)].label;

/**
 * The status of a world job, as the status endpoint answers. Beyond the shape:
 * - `label` is the progress label of `status`, nothing else (Requirement 7.3);
 * - the manifest is there exactly when the world is `ready` (a ready world with no usable manifest is reported as failed, not as ready),
 *   and it is the manifest of this world;
 * - `failure` only for a `failed` job, and `shared` only for a `ready` one (only a ready world can be shared).
 */
export const JobStatusSchema = WorldStatusSchema.extend({
  label: z.string().min(1).max(40),
  manifest: WorldManifestSchema.optional(),
}).superRefine((s, ctx) => {
  const bad = (message: string, path: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] });
  if (s.label !== progressLabel(s.status)) bad("the label is not the label of the state", "label");
  if (s.status === "ready" && s.manifest === undefined) bad("a ready world has its manifest", "manifest");
  if (s.status !== "ready" && s.manifest !== undefined) bad("only a ready world has a manifest", "manifest");
  if (s.manifest !== undefined && s.manifest.id !== s.id) bad("the manifest is of another world", "manifest");
  if (s.status !== "failed" && s.failure !== undefined) bad("only a failed job has a failure", "failure");
  if (s.status !== "ready" && s.shared === true) bad("only a ready world is shared", "shared");
});
export type JobStatus = z.infer<typeof JobStatusSchema>;

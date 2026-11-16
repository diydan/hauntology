import { z } from "zod";

/**
 * The body of `POST /api/play/start` (ghost-engine design, "Routes"). Objects are not strict: a field that is not listed is dropped. `anchors` and `conditions` are
 * accepted as they come and checked where they are used (`validateAnchors`; the conditions snapshot is the `conditions` spec's), so a body with a bad one is
 * still a start, with the anchors placed by the engine instead.
 */
const Id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const PlayStartRequestSchema = z.object({
  worldId: Id,
  ghostPreset: Id.max(64).optional(),
  anchors: z.unknown().optional(),
  conditions: z.unknown().optional(),
});
export type PlayStartRequest = z.infer<typeof PlayStartRequestSchema>;

/** A game id: made on the server from 128 random bits, so it cannot be guessed. */
export const PLAY_ID = /^[A-Za-z0-9_-]{1,128}$/;

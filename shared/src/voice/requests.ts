import { z } from "zod";

/**
 * The body of `POST /api/voice/speak` (ghost-voice 3.6 and 3.12): the id of a game, the id of a line and, optionally, `prefetch: true`, and nothing
 * else. It is STRICT: a field that is not listed, text of any kind included, makes the whole body refused, so no text a visitor could write ever
 * reaches a speech model. The line's words are found on the server from its id. `prefetch` asks for Library or cached audio only: it never makes a
 * paid call. A room (`roomCode`) is not accepted yet: it comes with ghost-voice 3.9.
 */
const Id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const SpeakRequestSchema = z.object({ playId: Id, lineId: Id, prefetch: z.boolean().optional() }).strict();
export type SpeakRequest = z.infer<typeof SpeakRequestSchema>;

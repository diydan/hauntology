import { z } from "zod";

/**
 * The Creator routes' bodies (ghost-creator task 3). Traits stay `unknown` here:
 * `validateTraits` is the one judge of their domain, and it names the fields at fault.
 */
export const PortraitsRequestSchema = z.object({ traits: z.unknown(), worldId: z.string().min(1).max(128) }).strict();
export type PortraitsRequest = { traits: unknown; worldId: string };

export const SpriteRequestSchema = z.object({ candidateId: z.string().min(1).max(128), worldId: z.string().min(1).max(128) }).strict();
export type SpriteRequest = z.infer<typeof SpriteRequestSchema>;

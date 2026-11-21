import { z } from "zod";
import { ASSET_NAME } from "../world/manifest";
import { hashText } from "../ghost/rng";
import { PersonaSchema, type Persona } from "./persona";
import { TraitsSchema, type Traits } from "./traits";

/**
 * The Ghost Profile (ghost-creator task 1.12, Requirements 4.3, 6.2): Traits, the sprite
 * reference and the Persona under a stable id — derived from the profile's own content, so
 * the same ghost is the same id on every device. Serialise/parse round-trips exactly, and
 * a corrupted serialisation is an error, never a partial profile (Property 8). The sprite
 * reference is a bundle file name or a same-origin path, never an upstream address.
 */
export const LODGER_VOICES = ["mark", "conrad", "arjun", "chloe", "eleanor", "victoria"] as const;

const spriteRef = z
  .string()
  .min(1)
  .max(200)
  .refine((s) => ASSET_NAME.test(s) || (s.startsWith("/") && !s.startsWith("//")), { message: "a bundle file name or a same-origin path" });

export const GhostProfileSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/),
    traits: TraitsSchema,
    spriteUrl: spriteRef,
    persona: PersonaSchema,
    preset: z.boolean().optional(),
    monoUrl: spriteRef.optional(),
    lodgerVoice: z.enum(LODGER_VOICES).optional(),
  })
  .strict();
export type GhostProfile = z.infer<typeof GhostProfileSchema>;

/** The stable id of a ghost: a slug of its name and a hash of who it is. */
export function profileId(traits: Traits, persona: Persona): string {
  const slug = persona.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ghost";
  return `${slug}-${hashText(JSON.stringify([traits, persona])).toString(16).padStart(8, "0")}`;
}

export function buildProfile(input: { traits: Traits; spriteUrl: string; persona: Persona; preset?: boolean; monoUrl?: string; lodgerVoice?: GhostProfile["lodgerVoice"] }): GhostProfile {
  const profile: GhostProfile = {
    id: profileId(input.traits, input.persona),
    traits: input.traits,
    spriteUrl: input.spriteUrl,
    persona: input.persona,
    ...(input.preset ? { preset: true } : {}),
    ...(input.monoUrl !== undefined ? { monoUrl: input.monoUrl } : {}),
    ...(input.lodgerVoice !== undefined ? { lodgerVoice: input.lodgerVoice } : {}),
  };
  return GhostProfileSchema.parse(profile);
}

export function serializeProfile(profile: GhostProfile): string {
  return JSON.stringify(GhostProfileSchema.parse(profile));
}

export type ParseProfileResult = { ok: true; profile: GhostProfile } | { ok: false; error: string };

export function parseProfile(input: unknown): ParseProfileResult {
  let value: unknown = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch {
      return { ok: false, error: "not JSON" };
    }
  }
  const parsed = GhostProfileSchema.safeParse(value);
  return parsed.success ? { ok: true, profile: parsed.data } : { ok: false, error: "not a Ghost Profile" };
}


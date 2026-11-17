import { z } from "zod";
import { hashText, makeRng } from "../ghost/rng";
import { DETAIL_MAX, sanitizeDetail } from "./sanitize";

/**
 * The ghost's traits (ghost-creator task 1.1, Requirements 1.1, 1.3, 1.4, 1.5): the exact
 * domains of the design, a default derived deterministically from the world id, and a
 * seeded random combination. `validateTraits` names only the offending fields, so the
 * form can mark those and no others. The one story word the design uses for the era
 * field is kept in step with it: `epoch`.
 */
export const EPOCHS = ["victorian", "twenties", "fifties", "eighties", "modern", "timeless"] as const;
export const TEMPERAMENTS = ["gentle", "mischievous", "melancholic", "stern", "playful", "wistful"] as const;
export const RELATIONS = ["resident", "child", "caretaker", "visitor", "guest", "neighbour"] as const;
export const PALETTES = ["moonlight", "ember", "moss", "rose", "slate", "dusk"] as const;
export const TRANSLUCENCIES = [30, 40, 50, 60, 70, 80] as const;
export const ACCESSORIES = ["lantern", "hat", "scarf", "spectacles", "key", "bouquet", "ribbon", "pocketwatch"] as const;
export const VOICES = ["soft", "dry"] as const;

export const TraitsSchema = z
  .object({
    epoch: z.enum(EPOCHS),
    temperament: z.enum(TEMPERAMENTS),
    relation: z.enum(RELATIONS),
    palette: z.enum(PALETTES),
    translucency: z.union([z.literal(30), z.literal(40), z.literal(50), z.literal(60), z.literal(70), z.literal(80)]),
    accessories: z
      .array(z.enum(ACCESSORIES))
      .max(2)
      .refine((a) => new Set(a).size === a.length, { message: "accessories must be unique" }),
    voice: z.enum(VOICES),
    detail: z.string().optional(),
  })
  .strict();
export type Traits = z.infer<typeof TraitsSchema>;

export type TraitsResult = { ok: true; traits: Traits } | { ok: false; fields: string[] };

const KNOWN_FIELDS = ["epoch", "temperament", "relation", "palette", "translucency", "accessories", "voice", "detail"];

/**
 * Accepts exactly the trait domain (Property 1): the detail counts characters as sent
 * (over 140 is refused on `detail`), and an accepted detail is returned sanitised —
 * one that cleans to nothing carries no detail at all.
 */
export function validateTraits(input: unknown): TraitsResult {
  const parsed = TraitsSchema.safeParse(input);
  if (!parsed.success) {
    const fields = new Set<string>();
    for (const issue of parsed.error.issues) {
      const head = issue.path[0];
      if (typeof head === "string") fields.add(head);
      if (issue.code === "unrecognized_keys") for (const k of (issue as { keys?: string[] }).keys ?? []) fields.add(k);
    }
    if (fields.size === 0) fields.add("traits");
    return { ok: false, fields: [...fields].sort((a, b) => (KNOWN_FIELDS.indexOf(a) + 1 || 99) - (KNOWN_FIELDS.indexOf(b) + 1 || 99)) };
  }
  const t = parsed.data;
  // The form caps the detail at the limit; a longer one arriving anyway is refused on its field.
  if (t.detail !== undefined && Array.from(t.detail).length > DETAIL_MAX) return { ok: false, fields: ["detail"] };
  const detail = t.detail === undefined ? undefined : sanitizeDetail(t.detail);
  const { detail: _raw, ...rest } = t;
  return { ok: true, traits: detail ? { ...rest, detail } : rest };
}

const pick = <T,>(rng: () => number, values: readonly T[]): T => values[Math.min(values.length - 1, Math.floor(rng() * values.length))] as T;

/** A valid combination from a seed (Property 2): the same seed always gives the same ghost. */
export function randomTraits(seed: number): Traits {
  const rng = makeRng(Math.trunc(seed) >>> 0);
  const count = Math.min(2, Math.floor(rng() * 3));
  const pool = [...ACCESSORIES];
  const accessories: Traits["accessories"] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
    accessories.push(pool.splice(idx, 1)[0] as Traits["accessories"][number]);
  }
  return {
    epoch: pick(rng, EPOCHS),
    temperament: pick(rng, TEMPERAMENTS),
    relation: pick(rng, RELATIONS),
    palette: pick(rng, PALETTES),
    translucency: pick(rng, TRANSLUCENCIES),
    accessories,
    voice: pick(rng, VOICES),
  };
}

/** The ghost a skipped Creator leaves behind: derived from the world id alone (Requirement 1.4). */
export function defaultTraits(worldId: string): Traits {
  return randomTraits(hashText(`ghost-default:${worldId}`));
}

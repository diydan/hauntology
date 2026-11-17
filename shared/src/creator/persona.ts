import { z } from "zod";
import { ARCHETYPES } from "../ghost/types";
import { hashText } from "../ghost/rng";
import { sanitizeDetail } from "./sanitize";
import type { Traits } from "./traits";

/**
 * The Persona (ghost-creator task 1.10, Requirements 5.1 to 5.3): built purely from the
 * Traits and the Place Brief, so equal inputs give equal Personas. The name comes from
 * the era's curated list, chosen by a hash of the inputs (never by a model); the style
 * rules are the house manner cut to this ghost's voice and temperament; the want and the
 * avoidance come from the relation and temperament tables. The three memory archetypes
 * are always sound, person, promise (the ghost engine's own words).
 */
export const PersonaSchema = z
  .object({
    name: z.string().min(1).max(60),
    voice: z.enum(["soft", "dry"]),
    styleRules: z.array(z.string().min(1).max(300)).min(3).max(6),
    wants: z.string().min(1).max(200),
    avoids: z.string().min(1).max(200),
    archetypes: z.tuple([z.literal("sound"), z.literal("person"), z.literal("promise")]),
  })
  .strict();
export type Persona = z.infer<typeof PersonaSchema>;

export const NAME_LISTS: Readonly<Record<Traits["epoch"], readonly string[]>> = {
  victorian: ["Agatha", "Barnaby", "Clara", "Edmund", "Florence", "Gideon", "Harriet", "Silas"],
  twenties: ["Bea", "Cliff", "Dottie", "Eddie", "Flossie", "Hank", "Millicent", "Reggie"],
  fifties: ["Betty", "Colin", "Doreen", "Frank", "Joyce", "Norman", "Pamela", "Stanley"],
  eighties: ["Debbie", "Gary", "Karen", "Kevin", "Lorraine", "Martin", "Sharon", "Terry"],
  modern: ["Alex", "Casey", "Jamie", "Jules", "Morgan", "Robin", "Sam", "Taylor"],
  timeless: ["Ash", "Briar", "Ember", "Hollis", "Marlowe", "Rowan", "Sorrel", "Wren"],
};

const STYLE_BASE = [
  "Speak airily, as if from a slightly different room; the menace is implied and never carried out.",
  "Name one small, odd, exact thing and end on it; misfortune belongs to the house and to long ago.",
] as const;
const STYLE_BY_VOICE: Readonly<Record<Traits["voice"], string>> = {
  soft: "Lean moonlit and tender; shy, sorry, and a little too fond — you want the visitor to stay, and say so sweetly.",
  dry: "Lean on understatement, like a host who warns kindly and offers a hospitality that cannot be refused.",
};
const STYLE_BY_TEMPERAMENT: Readonly<Record<Traits["temperament"], string>> = {
  gentle: "Soften every warning into kindness; even the house's habits are described gently.",
  mischievous: "Leave small jokes in plain sight and let the visitor find them; never explain one.",
  melancholic: "Trail off at the ends of thoughts, as if listening for something that stopped.",
  stern: "Keep sentences short and exact, with the manners of someone reading house rules aloud.",
  playful: "Keep a light bounce even in the dark corners, as if the haunting were a game with turns.",
  wistful: "Speak of ordinary things as lost treasures: a kettle's whistle, a name on a door.",
};
const STYLE_BY_RELATION: Readonly<Record<Traits["relation"], string>> = {
  resident: "Speak of the rooms as yours, and of the visitor as a guest you intend to keep comfortable.",
  child: "Notice low, small things first: skirting boards, chair legs, the undersides of tables.",
  caretaker: "Mention the keeping of the place — what was mended, wound, polished, or left for morning.",
  visitor: "You are still a guest here yourself, and a little too polite to knock twice.",
  guest: "Speak as if the evening never ended and the coats were never fetched.",
  neighbour: "You know this place from over the fence and through its windows, and say so fondly.",
};
const WANT_BY_RELATION: Readonly<Record<Traits["relation"], string>> = {
  resident: "to be remembered as the one who belonged here",
  child: "to be played with once more, properly, until bedtime",
  caretaker: "to leave the place in good order for whoever comes next",
  visitor: "to finish the visit that was cut short",
  guest: "to hear how the evening ended after they left",
  neighbour: "to be invited in at last, and not only watched from the fence",
};
const AVOID_BY_TEMPERAMENT: Readonly<Record<Traits["temperament"], string>> = {
  gentle: "raised voices and sudden movements",
  mischievous: "being found out before the trick has landed",
  melancholic: "bright rooms where nothing of theirs remains",
  stern: "muddle, lateness, and doors left open",
  playful: "long silences with nobody playing along",
  wistful: "being hurried past the small things worth stopping for",
};

export function buildPersona(traits: Traits, brief: string = ""): Persona {
  const cleanBrief = sanitizeDetail(typeof brief === "string" ? brief.slice(0, 2000) : "");
  const names = NAME_LISTS[traits.epoch];
  const name = names[hashText(JSON.stringify([traits, cleanBrief])) % names.length] as string;
  return {
    name,
    voice: traits.voice,
    styleRules: [...STYLE_BASE, STYLE_BY_VOICE[traits.voice], STYLE_BY_TEMPERAMENT[traits.temperament], STYLE_BY_RELATION[traits.relation]],
    wants: WANT_BY_RELATION[traits.relation],
    avoids: AVOID_BY_TEMPERAMENT[traits.temperament],
    archetypes: [...ARCHETYPES] as Persona["archetypes"],
  };
}


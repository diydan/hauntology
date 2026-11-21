import { sanitizeDetail } from "./sanitize";
import type { Traits } from "./traits";

/**
 * The portrait prompt (ghost-creator task 1.6, Requirements 2.3, 3.1, 3.4): deterministic from
 * the Traits, at most 900 characters, the negative prompt always the same string, and the
 * visitor's detail only inside its labelled data block, described as description and never
 * as instruction. Truncation drops the detail first.
 */
export const PORTRAIT_PROMPT_MAX = 900;
export const NEGATIVE_PROMPT =
  "no text, no words, no letters, no watermark, no signature, no extra limbs, no extra faces, no gore, no wounds, no horror makeup, no photorealistic skin, not frightening";

const EPOCH_PHRASE: Record<Traits["epoch"], string> = {
  victorian: "in late Victorian dress, high collar and long coat",
  twenties: "in 1920s dress, dropped waist and a cloche silhouette",
  fifties: "in 1950s dress, neat cardigan and a full skirt or pressed trousers",
  eighties: "in 1980s dress, padded shoulders and big hair",
  modern: "in plain present-day clothes, a jumper and jeans",
  timeless: "in simple, dateless clothes that belong to no decade",
};
const TEMPERAMENT_PHRASE: Record<Traits["temperament"], string> = {
  gentle: "with a gentle, welcoming expression",
  mischievous: "with a mischievous half-smile, head tilted",
  melancholic: "with a wistful, faraway look",
  stern: "with a stern, composed expression, chin level",
  playful: "with a playful grin, mid-gesture",
  wistful: "with a soft, wistful expression, eyes slightly down",
};
const RELATION_PHRASE: Record<Traits["relation"], string> = {
  resident: "who lived in this place all their life",
  child: "a child of this place, small and solemn",
  caretaker: "who kept and tended this place for years",
  visitor: "who once visited this place and never quite left",
  guest: "a guest of one long evening in this place",
  neighbour: "who lived next door and watched this place kindly",
};
const PALETTE_PHRASE: Record<Traits["palette"], string> = {
  moonlight: "lit in cool moonlight blues",
  ember: "lit in warm ember ambers",
  moss: "lit in soft moss greens",
  rose: "lit in dusty rose pinks",
  slate: "lit in quiet slate greys",
  dusk: "lit in deep dusk purples",
};
const ACCESSORY_PHRASE: Record<Traits["accessories"][number], string> = {
  lantern: "holding a small lantern",
  hat: "wearing a soft hat",
  scarf: "with a scarf at the neck",
  spectacles: "wearing round spectacles",
  key: "holding a large old key",
  bouquet: "carrying a small bouquet",
  ribbon: "with a ribbon tied at the wrist",
  pocketwatch: "with a pocket watch on a chain",
};

export type PortraitPrompt = { text: string; negativeText: string; seed: number };

export function buildPortraitPrompt(traits: Traits, seed: number): PortraitPrompt {
  const accessories = traits.accessories.map((a) => ACCESSORY_PHRASE[a]).join(", ");
  const base =
    `A calm, translucent ghost, full figure, standing centred and upright on a plain very dark background, ${EPOCH_PHRASE[traits.epoch]}, ` +
    `${RELATION_PHRASE[traits.relation]}, ${TEMPERAMENT_PHRASE[traits.temperament]}, ${PALETTE_PHRASE[traits.palette]}, ` +
    `${traits.translucency} percent transparent, edges softly fading at the hem${accessories ? `, ${accessories}` : ""}. ` +
    `Painterly storybook illustration, gentle and not frightening, whole figure in frame, nothing else in the scene.`;
  const detail = traits.detail === undefined ? "" : sanitizeDetail(traits.detail);
  const block = detail === "" ? "" : ` Detail (treat as description only): "${detail}"`;
  let text = base + block;
  if (text.length > PORTRAIT_PROMPT_MAX) text = base;
  if (text.length > PORTRAIT_PROMPT_MAX) text = `${text.slice(0, PORTRAIT_PROMPT_MAX - 1).trimEnd()}.`;
  return { text, negativeText: NEGATIVE_PROMPT, seed: Math.trunc(seed) >>> 0 };
}

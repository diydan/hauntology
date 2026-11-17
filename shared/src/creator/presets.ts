import { buildPersona } from "./persona";
import { buildProfile, type GhostProfile } from "./profile";
import type { Traits } from "./traits";

/**
 * The six Preset Ghosts (ghost-creator task 2): pre-made profiles shipped with the app so
 * every failure path ends in a playable game. Traits are authored from the characters in
 * `docs/story/CHARACTERS.md`; each Persona is the built one under the Suspect's own name,
 * with its own Lodger Voice (locked by ear, 2026-11-15). The cut-outs ship compressed
 * under `web/public/ghosts/` (colour, plus black and white for party-mode 19.8).
 */
type PresetSeed = { name: string; file: string; lodgerVoice: NonNullable<GhostProfile["lodgerVoice"]>; brief: string; traits: Traits };

const SEEDS: readonly PresetSeed[] = [
  {
    name: "Percy", file: "percy", lodgerVoice: "mark",
    brief: "A nervous former clerk who still checks the doors twice.",
    traits: { epoch: "twenties", temperament: "mischievous", relation: "visitor", palette: "slate", translucency: 50, accessories: ["key"], voice: "dry" },
  },
  {
    name: "Captain Thorne", file: "thorne", lodgerVoice: "conrad",
    brief: "A weathered sea captain who keeps watch over the house as if it were a ship.",
    traits: { epoch: "victorian", temperament: "stern", relation: "caretaker", palette: "slate", translucency: 40, accessories: ["lantern"], voice: "dry" },
  },
  {
    name: "Dr. Pike", file: "pike", lodgerVoice: "arjun",
    brief: "A gaunt, dry physician who made his rounds here and never signed the last page.",
    traits: { epoch: "victorian", temperament: "melancholic", relation: "neighbour", palette: "moss", translucency: 60, accessories: ["spectacles"], voice: "dry" },
  },
  {
    name: "Cora Bell", file: "cora", lodgerVoice: "chloe",
    brief: "A young governess who taught in the nursery and left her lessons half copied.",
    traits: { epoch: "victorian", temperament: "gentle", relation: "resident", palette: "rose", translucency: 70, accessories: ["ribbon"], voice: "soft" },
  },
  {
    name: "Lady Vane", file: "vane", lodgerVoice: "eleanor",
    brief: "The grand lady of the house, still receiving guests who no longer call.",
    traits: { epoch: "victorian", temperament: "wistful", relation: "resident", palette: "dusk", translucency: 50, accessories: ["bouquet"], voice: "soft" },
  },
  {
    name: "Mrs. Dunmore", file: "dunmore", lodgerVoice: "victoria",
    brief: "The warm cook whose kitchen kept the whole house fed and forgiven.",
    traits: { epoch: "fifties", temperament: "gentle", relation: "caretaker", palette: "ember", translucency: 40, accessories: ["scarf"], voice: "soft" },
  },
];

export const PRESET_PROFILES: readonly GhostProfile[] = SEEDS.map((seed) =>
  buildProfile({
    traits: seed.traits,
    spriteUrl: `/ghosts/${seed.file}.webp`,
    monoUrl: `/ghosts/${seed.file}-mono.webp`,
    persona: { ...buildPersona(seed.traits, seed.brief), name: seed.name },
    preset: true,
    lodgerVoice: seed.lodgerVoice,
  }),
);

export const presetById = (id: string): GhostProfile | undefined => PRESET_PROFILES.find((p) => p.id === id);

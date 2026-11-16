import type { Rng } from "./rng";
import { ANCHOR_IDS, ARCHETYPES, type Archetype, type Seed } from "./types";

/**
 * Generic hooks, one list per kind of memory. A seed is only a kind and a short generic hook: nothing in it is about the place, so
 * nothing secret exists that could be got out early (ghost-engine design). The narrator ties it to the place when it is found.
 */
export const HOOKS: Readonly<Record<Archetype, readonly string[]>> = {
  sound: [
    "a low hum from behind a closed door",
    "a kettle just before it sang",
    "footsteps that stopped at the threshold",
    "a radio left on in another room",
    "rain on a roof nobody could see",
    "a drawer sliding shut",
  ],
  person: [
    "someone who stood close enough to share a coat",
    "a name that was never learned",
    "a laugh that came from the next room",
    "a hand that reached for the same thing",
    "a face turned toward the window",
    "someone waiting just out of sight",
  ],
  promise: [
    "a promise to come back before the light goes",
    "a promise to keep a secret until the end",
    "a promise to leave the lamp lit",
    "a promise to say the words aloud one day",
    "a promise to look after what was left",
    "a promise made quietly, and not kept",
  ],
};

/** Which kind of memory sits at which anchor, in an order and with hooks drawn from the seed. Server only: never sent to the client. */
export function makeSeeds(rng: Rng): Seed[] {
  const kinds = [...ARCHETYPES];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j] as Archetype, kinds[i] as Archetype];
  }
  return ANCHOR_IDS.map((anchorId, i) => {
    const archetype = kinds[i] as Archetype;
    const hooks = HOOKS[archetype];
    return { anchorId, archetype, hook: hooks[Math.floor(rng() * hooks.length)] as string };
  });
}

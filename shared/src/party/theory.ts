/**
 * Theory marks (party-mode 4.7 and 4.8): the Player's own "maybe here" marks that tie one Suspect to one Zone, kept in the
 * notebook on the device. At most one Zone for each Suspect, set and cleared only by the Player. Nothing in the game reads
 * one: it is not in any view, message, prompt or Bot input, and it never changes a has, lacks or maybe mark.
 */
export type Theory = Readonly<Record<string, string>>;

/**
 * Set a Suspect's Zone (one of `zones`, the six Zones of the pool), or clear it with `null`. A Zone that is not in the pool
 * changes nothing. Pure: the input is never changed, no other Suspect is touched, and when nothing changes the same object
 * comes back.
 */
export function setTheory(theory: Theory, suspect: string, zone: string | null, zones: readonly string[]): Theory {
  const has = Object.hasOwn(theory, suspect);
  if (zone === null) {
    if (!has) return theory;
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(theory)) if (k !== suspect) next[k] = v;
    return next;
  }
  if (!zones.includes(zone) || (has && theory[suspect] === zone)) return theory;
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(theory)) if (k !== suspect) next[k] = v;
  next[suspect] = zone;
  return next;
}

/** The Zone a Suspect is marked in, if any. */
export const theoryOf = (theory: Theory, suspect: string): string | undefined => (Object.hasOwn(theory, suspect) ? theory[suspect] : undefined);

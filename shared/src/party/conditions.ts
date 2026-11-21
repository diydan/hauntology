/**
 * The real world in a Room (party-mode 15.4). The snapshot is read once at the start and frozen. Only the three cosmetic
 * fields reach the Public View; the position, temperature and wind never leave the Room. No rule function takes a
 * snapshot as an input: the source-level test in `conditions/rules-free.test.ts` fails the build if one imports it.
 * This module only shows looks, like `views.ts`, so it is the one party module that may read the snapshot's shape.
 */
export type RoomConditions = Readonly<{ weather: string; timeOfDay: string; moon: string }>;
type SnapshotLike = Readonly<{ weather: string; timeOfDay: string; moon: string }>;

/** The cosmetic Public View fields of a snapshot, or `undefined` when the Room has none (conditions off, or a failure). */
export function roomConditions<S extends SnapshotLike>(snapshot: S | null | undefined): RoomConditions | undefined {
  if (snapshot === null || snapshot === undefined) return undefined;
  return { weather: snapshot.weather, timeOfDay: snapshot.timeOfDay, moon: snapshot.moon };
}

/** A deep-frozen copy, so nothing can change the snapshot during the game. */
export function freezeConditions<S extends object>(snapshot: S): Readonly<S> {
  const copy = structuredClone(snapshot);
  const freeze = (v: unknown): void => {
    if (typeof v !== "object" || v === null || Object.isFrozen(v)) return;
    Object.freeze(v);
    for (const k of Object.keys(v)) freeze((v as Record<string, unknown>)[k]);
  };
  freeze(copy);
  return copy;
}

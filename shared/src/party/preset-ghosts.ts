/**
 * The Preset Ghosts (party-mode 3.3, integration 4.3): the eight Suspects a case uses when nobody contributed a
 * ghost, so a solo case always starts. Ids match the `presetIds` the Room server passes to the Engine. Names and
 * lines are public: every Player sees them on the Suspect cards.
 */
export const PRESET_GHOSTS = [
  { id: "preset-1", name: "The Lamplighter", line: "Still doing his rounds, a century late." },
  { id: "preset-2", name: "Widow Harrow", line: "Sets two cups at every table." },
  { id: "preset-3", name: "The Drowned Choirboy", line: "Sings one note, always flat." },
  { id: "preset-4", name: "Old Tobias", line: "Counts the stairs and never agrees." },
  { id: "preset-5", name: "The Bride in Grey", line: "Waits by doors that no longer open." },
  { id: "preset-6", name: "Nurse Ottilie", line: "Checks on patients who left long ago." },
  { id: "preset-7", name: "The Stoker", line: "Smells of coal and old smoke." },
  { id: "preset-8", name: "Little Wren", line: "Hides, and wants to be found." },
] as const;

export const PRESET_GHOST_IDS = PRESET_GHOSTS.map((g) => g.id);

/** A Suspect's display name: a Preset Ghost's name, or the fallback for a contributed ghost (its maker names it later). */
export const ghostName = (profileId: string, fallback = "A visitor's ghost"): string => PRESET_GHOSTS.find((g) => g.id === profileId)?.name ?? fallback;

// Which narration files the footage page needs, and where they come from. The page plays the Library audio of each scene line (the Whisper, Pippa, or the
// Keeper, Ronald) when the line is said. The audio itself is in the git-ignored .voice-library folder, so the build copies it in when it is there; without it the page
// still works, with the words only.
//
// Used by build.mjs. Pure apart from `has`, which the caller supplies (a file-exists check), so it is testable.

/** The file name the Library gives take 1 of a manifest key (`speech/lib/v1/<hash>`). */
export function libraryFile(key) {
  const m = /^speech\/lib\/v1\/([0-9a-f]{64})$/.exec(key);
  if (!m) throw new Error(`not a Library key: ${key}`);
  return `${m[1]}.take1.mp3`;
}

/** The name the page asks for: media/voice-<line id>.mp3. */
export const voiceFile = (id) => `voice-${id}.mp3`;

/**
 * @param {string[]} ids        the line ids the page can say
 * @param {{ entries: { key: string, sources: string[] }[] }} manifest
 * @param {(file: string) => boolean} has  whether the Library folder holds this file
 * @returns {{ copy: { from: string, to: string, id: string }[], missing: string[] }}
 */
export function planVoiceFiles(ids, manifest, has) {
  const copy = [];
  const missing = [];
  for (const id of [...new Set(ids)]) {
    const entry = manifest.entries.find((e) => e.sources.includes(id));
    const from = entry ? libraryFile(entry.key) : null;
    if (from !== null && has(from)) copy.push({ id, from, to: voiceFile(id) });
    else missing.push(id);
  }
  return { copy, missing };
}

import { isMemoryKind, LEVELS, type Kind, type Level, type PuzzleSetting } from "./types";

/**
 * The level of a Lock when it opens (puzzles 1.4): the Puzzle setting is the starting level, and it steps up one at
 * Haunt 3 and one more at Haunt 6, never above hard, never below the setting, and at most one step under the Gentle
 * preset. A Memory Kind keeps the level its Sight was made at, so the clue always fits. Null when puzzles are off.
 */
export function lockLevel(setting: PuzzleSetting, gentle: boolean, haunt: number, kind: Kind, sightLevel: Level): Level | null {
  if (setting === "off") return null;
  if (isMemoryKind(kind)) return sightLevel;
  const steps = Math.min(gentle ? 1 : 2, (haunt >= 3 ? 1 : 0) + (haunt >= 6 ? 1 : 0));
  return LEVELS[Math.min(LEVELS.length - 1, LEVELS.indexOf(setting) + steps)] as Level;
}

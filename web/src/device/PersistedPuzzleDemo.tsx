import type { ReactNode } from "react";
import { PuzzleDemo, parseConfig } from "../puzzles/demo/PuzzleDemo";
import { useDeviceSettings } from "./device-settings";

/**
 * The puzzle demo page with the Player's choices kept on this phone: the Controller's job (the puzzle screens store nothing). Tilt,
 * Touch only, strength, buzz, sound and Assist come back on the next visit; `?assist=1` turns Assist on for this visit.
 */
export function PersistedPuzzleDemo({ search }: { search: string }): ReactNode {
  const [device, setDevice] = useDeviceSettings(parseConfig(search).assist ? { assist: true } : {});
  return <PuzzleDemo search={search} settings={{ device, setDevice }} />;
}

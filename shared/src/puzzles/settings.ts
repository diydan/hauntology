import type { PuzzleSetting } from "./types";

export const PRESETS = ["classic", "gentle", "quick"] as const;
export type Preset = (typeof PRESETS)[number];

/** The most Turn time a Lock may use, per party-mode preset. */
export const CAPS: Readonly<Record<Preset, number>> = { classic: 25_000, gentle: 40_000, quick: 20_000 };
export const capFor = (preset: Preset): number => CAPS[preset];

const SETTING: Readonly<Record<Preset, PuzzleSetting>> = { classic: "medium", gentle: "easy", quick: "off" };
/** Classic plays medium, Gentle plays easy, Quick has puzzles off (the Master can switch them on). */
export const presetSetting = (preset: Preset): PuzzleSetting => SETTING[preset];

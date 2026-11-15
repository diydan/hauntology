import type { BaseSeconds } from "./clock";

/**
 * The solo case (party-mode 9.5): an ordinary Room with one human Master and two to five Bots on one screen. No
 * contribution is needed; every Suspect and Zone name comes from the Preset Ghosts and the curated names.
 * Seats run from 1 (the Room's seat numbers), so the visitor is seat 1, not 0 as an early draft of the design said.
 */
export const SOLO_PRESETS = ["classic", "gentle", "quick"] as const;
export type SoloPreset = (typeof SOLO_PRESETS)[number];
export type BotLevel = "standard" | "gentle";

export type SoloSettings = Readonly<{
  worldId: string;
  baseSeconds: BaseSeconds;
  hauntMax: 8 | 10 | 12;
  nudges: "all" | "help-only" | "off";
  frames: boolean;
  autoCross: boolean;
  botLevel: BotLevel;
  puzzles: "off" | "easy" | "medium" | "hard";
  speech: false;
  sky: string | null;
}>;

/** The preset rows of the design: Classic 60 s / 10, Gentle 90 s / 12, Quick 45 s / 8. */
const ROWS: Readonly<Record<SoloPreset, Omit<SoloSettings, "worldId" | "speech" | "sky">>> = {
  classic: { baseSeconds: 60, hauntMax: 10, nudges: "all", frames: true, autoCross: false, botLevel: "standard", puzzles: "medium" },
  gentle: { baseSeconds: 90, hauntMax: 12, nudges: "help-only", frames: false, autoCross: true, botLevel: "gentle", puzzles: "easy" },
  quick: { baseSeconds: 45, hauntMax: 8, nudges: "all", frames: true, autoCross: false, botLevel: "standard", puzzles: "off" },
};

export const BOT_NAMES = ["Agnes", "Bertram", "Clementine", "Dorian", "Edith"] as const;

export type SoloSeat = Readonly<{ seat: number; nickname: string; bot: boolean; master: boolean; botLevel: BotLevel | null }>;
export type SoloWorld = Readonly<{ id: string; walkRadius: number; authoredZones: boolean }>;
export type SoloError = "bad_bot_count" | "world_too_small";

export function soloSetup(o: Readonly<{ world: SoloWorld; preset: SoloPreset; bots?: number; sky?: string | null; nickname?: string }>):
  { ok: true; settings: SoloSettings; seats: readonly SoloSeat[] } | { ok: false; code: SoloError } {
  const bots = o.bots ?? 2;
  if (!Number.isInteger(bots) || bots < 2 || bots > 5) return { ok: false, code: "bad_bot_count" };
  if (o.world.walkRadius < 7 && !o.world.authoredZones) return { ok: false, code: "world_too_small" };
  const row = ROWS[o.preset];
  const settings: SoloSettings = { ...row, worldId: o.world.id, speech: false, sky: o.sky ?? null };
  const seats: SoloSeat[] = [
    { seat: 1, nickname: o.nickname ?? "You", bot: false, master: true, botLevel: null },
    ...Array.from({ length: bots }, (_, i) => ({ seat: i + 2, nickname: BOT_NAMES[i] as string, bot: true, master: false, botLevel: row.botLevel })),
  ];
  return { ok: true, settings, seats };
}

/** In a solo case nothing needs a second human: no Nudges, Frames or Rattles are offered. */
export const soloOffers = { nudges: false, frames: false, rattles: false } as const;

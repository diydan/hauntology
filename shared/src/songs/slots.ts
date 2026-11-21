import type { PublicSnapshot } from "../party/engine";
import type { SongKind, SongsSetting } from "./lyrics";
import { STOCK_SONGS, type StockSong } from "./stock";

/**
 * Song Slot scheduler and immediate Stock fallback (game-songs 2.5, Requirements 1.1, 1.2, 1.4, 2.1, 4.3).
 *
 * - Never overlaps voice speech, an active Cue, or a reveal.
 * - Clue Songs play only in calm scenes with no active player turn (`round_end` or `quiet_scene`).
 * - Never pauses or delays the game when a generated song is not ready: falls back immediately to a
 *   matching Stock Song or silence (`null`).
 */
export type SlotKind = "between_turns" | "round_end" | "quiet_scene" | "ending";

export type SlotInput = Readonly<{
  phase: PublicSnapshot["phase"];
  betweenTurns: boolean;
  roundEnded: boolean;
  quietScene: boolean;
  speechPlaying: boolean;
  cuePlaying: boolean;
  revealPlaying: boolean;
}>;

export function nextSlot(input: SlotInput, songKind?: SongKind): SlotKind | null {
  if (input.speechPlaying || input.cuePlaying || input.revealPlaying) return null;

  if (songKind === "clue") {
    if (input.phase === "ended") return null;
    if (input.roundEnded) return "round_end";
    if (input.quietScene) return "quiet_scene";
    return null;
  }

  if (input.phase === "ended") return "ending";
  if (input.roundEnded) return "round_end";
  if (input.quietScene) return "quiet_scene";
  if (input.betweenTurns) return "between_turns";
  return null;
}

const byId = (id: string): StockSong => STOCK_SONGS.find((s) => s.id === id) ?? STOCK_SONGS[0]!;

export function fallbackStockFor(
  kind: SongKind,
  options: { hauntLevel?: number; houseWins?: boolean } = {},
): StockSong {
  switch (kind) {
    case "opening":
      return byId("lobby");
    case "joined":
      return byId("fb-joined");
    case "wrong_accuse":
      return byId("fb-wrong");
    case "becoming":
      return byId("fb-becoming");
    case "detectives_win":
      return byId("fb-detectives");
    case "house_wins":
      return byId("fb-house");
    case "ballad":
      return byId(options.houseWins ? "fb-house" : "fb-detectives");
    case "clue": {
      const h = options.hauntLevel ?? 0;
      if (h >= 7) return byId("haunt-high");
      if (h >= 4) return byId("haunt-mid");
      return byId("haunt-low");
    }
  }
}

export type PlayableSong<TCustom> =
  | Readonly<{ source: "custom"; slot: SlotKind; song: TCustom }>
  | Readonly<{ source: "stock"; slot: SlotKind; song: StockSong }>;

/**
 * Selects a song to play immediately at the next calm Song Slot. Returns `null` when `setting === "off"`,
 * when no safe slot is open (`speechPlaying` / `cuePlaying` / `revealPlaying`), or when a Clue Song has no
 * quiet/round-end scene. Never waits for custom generation: falls back at once to Stock.
 */
export function resolveSlotPlayback<TCustom>(input: {
  setting: SongsSetting;
  slotInput: SlotInput;
  kind: SongKind;
  readyCustom?: TCustom | null;
  hauntLevel?: number;
  houseWins?: boolean;
}): PlayableSong<TCustom> | null {
  if (input.setting === "off") return null;
  const slot = nextSlot(input.slotInput, input.kind);
  if (slot === null) return null;

  if (input.setting === "on" && input.readyCustom !== undefined && input.readyCustom !== null) {
    return { source: "custom", slot, song: input.readyCustom };
  }
  return {
    source: "stock",
    slot,
    song: fallbackStockFor(input.kind, {
      ...(input.hauntLevel !== undefined ? { hauntLevel: input.hauntLevel } : {}),
      ...(input.houseWins !== undefined ? { houseWins: input.houseWins } : {}),
    }),
  };
}

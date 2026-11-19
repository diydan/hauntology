import type { PublicSnapshot } from "@hauntology/shared/party/engine";
import { clueHint, type ClueHintInput } from "@hauntology/shared/songs/clues";
import { lyricFacts, writeLyrics, type NameConsent, type SongKind, type SongsSetting, type WrittenSong } from "@hauntology/shared/songs/lyrics";
import { songRequests, type SongPlanState } from "@hauntology/shared/songs/plan";
import { resolveSlotPlayback, type PlayableSong, type SlotInput } from "@hauntology/shared/songs/slots";
import { songWasCharged, type SongMaker } from "../guarded/songs/mureka";
import type { SongSpendGuard } from "./spend";
import type { RoomSongStore } from "./store";

/**
 * Room Song coordinator (game-songs 3.2, Requirements 1.1, 1.2, 1.4, 2.1, 3.2, 3.3).
 *
 * Orchestrates request planning, public-only lyrics, spend-guarded generation, R2 Room storage,
 * immediate Stock fallback at calm Song Slots, and end-of-room cleanup.
 */
export type GeneratedRoomSong = WrittenSong & Readonly<{ key: string }>;

export type RoomSongDeps = {
  spend: SongSpendGuard;
  maker: SongMaker;
  store: RoomSongStore;
  kill?: () => boolean;
  now?: () => number;
};

export type RoomSongMeta = Readonly<{
  key: string;
  written: WrittenSong;
}>;

export class RoomSongCoordinator {
  private readonly ready = new Map<string, Map<string, RoomSongMeta>>();

  constructor(private readonly deps: RoomSongDeps) {}

  private roomMap(roomCode: string): Map<string, RoomSongMeta> {
    const code = roomCode.trim().toUpperCase();
    let m = this.ready.get(code);
    if (m === undefined) {
      m = new Map();
      this.ready.set(code, m);
    }
    return m;
  }

  /** Evaluates pending song requests for `view` and generates up to plan/cap limits without blocking callers. */
  async prepareForView(input: {
    roomCode: string;
    view: PublicSnapshot;
    plan: SongPlanState;
    consent: NameConsent;
    seed: number;
    hintInput?: Omit<ClueHintInput, "events" | "zones" | "relics">;
    lastRound?: number;
  }): Promise<{ state: SongPlanState; generated: RoomSongMeta[]; refused: number }> {
    const { requests, state } = songRequests(input.view, input.plan, {
      ...(input.lastRound !== undefined ? { lastRound: input.lastRound } : {}),
    });
    const generated: RoomSongMeta[] = [];
    let refused = 0;

    if (requests.length === 0 || this.deps.kill?.() === true) {
      return { state, generated, refused: requests.length };
    }

    const now = this.deps.now ?? Date.now;
    const hint = clueHint(
      {
        events: input.view.events,
        zones: input.view.zones,
        relics: input.view.relics,
        ...(input.hintInput?.emptyZones !== undefined ? { emptyZones: input.hintInput.emptyZones } : {}),
        ...(input.hintInput?.excludeIds !== undefined ? { excludeIds: input.hintInput.excludeIds } : {}),
      },
      input.seed,
    );
    const map = this.roomMap(input.roomCode);

    for (const req of requests) {
      if (this.deps.kill?.() === true) {
        refused++;
        continue;
      }
      const ticketRes = await this.deps.spend.reserve({ roomCode: input.roomCode, now: now() });
      if (!ticketRes.ok) {
        refused++;
        continue;
      }
      const ticket = ticketRes.ticket;
      try {
        const facts = lyricFacts(input.view, input.consent, { includeSolution: req.kind === "ballad" });
        const written = writeLyrics(req.kind, facts, input.seed, { ...(req.kind === "clue" ? { hint } : {}) });
        const ans = await this.deps.maker.make(ticket, { lyrics: written.lyrics, style: written.style });
        if (songWasCharged(ans)) {
          await this.deps.spend.commit(ticket);
        } else {
          await this.deps.spend.release(ticket);
        }
        if (ans.ok) {
          await this.deps.store.put(input.roomCode, req.key, ans.audio);
          const meta: RoomSongMeta = { key: req.key, written };
          map.set(req.key, meta);
          generated.push(meta);
        }
      } catch {
        await this.deps.spend.release(ticket);
      }
    }

    return { state, generated, refused };
  }

  /** Picks a ready made song for `key` if available, else falls back immediately to a Stock Song. */
  pickForSlot(input: {
    roomCode: string;
    setting: SongsSetting;
    slotInput: SlotInput;
    kind: SongKind;
    key: string;
    hauntLevel?: number;
    houseWins?: boolean;
  }): PlayableSong<RoomSongMeta> | null {
    const custom = this.ready.get(input.roomCode.trim().toUpperCase())?.get(input.key) ?? null;
    return resolveSlotPlayback({
      setting: input.setting,
      slotInput: input.slotInput,
      kind: input.kind,
      readyCustom: custom,
      ...(input.hauntLevel !== undefined ? { hauntLevel: input.hauntLevel } : {}),
      ...(input.houseWins !== undefined ? { houseWins: input.houseWins } : {}),
    });
  }

  /** Deletes every generated song stored for `roomCode`. */
  async purgeRoom(roomCode: string): Promise<number> {
    this.ready.delete(roomCode.trim().toUpperCase());
    return this.deps.store.deleteRoomSongs(roomCode);
  }
}

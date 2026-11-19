import type { ClueHint } from "@hauntology/shared/songs/clues";
import type { SongsSetting } from "@hauntology/shared/songs/lyrics";

/**
 * Web controller for Room songs, captions, Master controls, and "Sing my name" consent (game-songs 3.3,
 * Requirements 3.1, 4.1, 4.2, 4.3).
 */
export type ActiveRoomSong = Readonly<{
  key: string;
  title: string;
  captions: string;
  hintLogLine?: string;
}>;

export type RoomSongUi = Readonly<{
  setting: SongsSetting;
  muted: boolean;
  singMyName: boolean;
  playing: ActiveRoomSong | null;
  /** Latest caption text shown in the polite live region even after stopping/muting cleanly. */
  captions: string | null;
}>;

export type SongAudioHandle = {
  pause(): void;
};

export type RoomSongsDeps = {
  playSong?: (songKey: string) => SongAudioHandle | null;
  onPublicLog?: (line: string) => void;
  initialSetting?: SongsSetting;
  initialSingMyName?: boolean;
};

export type RoomSongsController = {
  getSnapshot(): RoomSongUi;
  subscribe(listener: () => void): () => void;
  setSetting(isMaster: boolean, setting: SongsSetting): boolean;
  setMuted(isMaster: boolean, muted: boolean): boolean;
  skip(isMaster: boolean): boolean;
  setSingMyName(on: boolean): void;
  startSong(song: ActiveRoomSong, opts?: { soundConsent?: boolean; hint?: ClueHint | null }): boolean;
  finishSong(): void;
  destroy(): void;
};

export function createRoomSongsController(deps: RoomSongsDeps = {}): RoomSongsController {
  let ui: RoomSongUi = {
    setting: deps.initialSetting ?? "off",
    muted: false,
    singMyName: deps.initialSingMyName ?? false,
    playing: null,
    captions: null,
  };
  let audio: SongAudioHandle | null = null;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<RoomSongUi>) => {
    ui = { ...ui, ...patch };
    for (const l of [...listeners]) l();
  };

  const stopAudio = () => {
    const a = audio;
    audio = null;
    try {
      a?.pause();
    } catch {
      // ignore pause errors
    }
  };

  return {
    getSnapshot: () => ui,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    setSetting(isMaster, setting) {
      if (!isMaster) return false;
      if (setting === "off") {
        stopAudio();
        set({ setting, playing: null });
      } else {
        set({ setting });
      }
      return true;
    },
    setMuted(isMaster, muted) {
      if (!isMaster) return false;
      if (muted) stopAudio();
      set({ muted });
      return true;
    },
    skip(isMaster) {
      if (!isMaster) return false;
      stopAudio();
      set({ playing: null });
      return true;
    },
    setSingMyName(on) {
      set({ singMyName: on });
    },
    startSong(song, opts = {}) {
      if (ui.setting === "off") return false;
      stopAudio();
      const logLine = opts.hint?.logLine ?? song.hintLogLine;
      if (logLine) deps.onPublicLog?.(logLine);
      const canPlayAudio = !ui.muted && opts.soundConsent !== false;
      if (canPlayAudio) {
        audio = deps.playSong?.(song.key) ?? null;
      }
      set({ playing: song, captions: song.captions });
      return true;
    },
    finishSong() {
      stopAudio();
      set({ playing: null });
    },
    destroy() {
      stopAudio();
      set({ playing: null, captions: null });
    },
  };
}

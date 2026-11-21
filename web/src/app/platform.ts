import { defaultLoadHost, type LoadHost } from "./case/types";
import { browserPhotoKit, type PhotoKit } from "./create/photo-kit";
import { canvasSurface, type SurfaceFactory } from "./create/surface";
import { browserScheduler, type Scheduler } from "./haunt/controller";
import { loadTurnstileScript, type LoadTurnstile } from "./confirm/turnstile";
import { defaultLoadCreator, type LoadCreator } from "./haunt/creator";
import { defaultLoadViewer, type LoadViewer } from "./viewer/types";
import { createBrowserFeel } from "../puzzles/feel/create";
import type { FeelSettings, PuzzleFeel } from "../puzzles/feel/types";
import { browserAudio, browserRecorderFactory, browserUnlock, type RecorderFactory, type VoiceDeps } from "./play/voice";

/**
* What the shell takes from the browser, in one place, so tests and the demo can swap it: loading
 * the Viewer, the party Host page, the microphone and speaker, and saving a file. Each default is the real browser's.
 */
export type PlatformKit = {
  loadViewer: LoadViewer;
  /** Loads the party Host page for "Play a case". */
  loadHost: LoadHost;
  /** Loads the Ghost Creator for Haunt. */
  loadCreator: LoadCreator;
  /** The visitor's position, asked from the browser only after an explicit tap. Rejects when it is refused or fails. */
  locate: () => Promise<{ lat: number; lon: number }>;
  /** The clock: the date and hour of the visitor's own calendar. */
  now: () => Date;
  /** Timers for the Stage poll. */
  scheduler: Scheduler;
  /** Loads Cloudflare Turnstile for the Confirm Gate, only when the quote asks for it. */
  loadTurnstile: LoadTurnstile;
  /** Reading, measuring and re-encoding a chosen photo (Create). */
  photo: PhotoKit;
  /** Paints the Sketch Pad's strokes on a canvas (Create). */
  surface: SurfaceFactory;
  /** The puzzle feel layer (tilt, buzz, sound, breath), made for one screen; `settings` is read each time so the device switches act at once. */
  puzzleFeel: (settings: () => FeelSettings) => PuzzleFeel;
  voice: {
    recorder: RecorderFactory | null;
    createAudio: NonNullable<VoiceDeps["createAudio"]>;
    unlockAudio: () => Promise<void>;
  };
  /** Offers `blob` to the visitor as a download. */
  saveFile(name: string, blob: Blob): void;
  /** The address of this app (`https://host`), the start of a share link. */
  origin: () => string;
  /** Puts `text` on the clipboard. `false` when the browser has no clipboard or refuses; the caller then shows the text to copy by hand. */
  copyText: (text: string) => Promise<boolean>;
};

export async function browserCopyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function browserSaveFile(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // Give the download a moment to start before the address goes away.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** One position, from the browser, at low accuracy (two decimals are all that is kept), with a 10 second limit. */
export function browserLocate(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("no geolocation"));
      return;
    }
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }), reject, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 });
  });
}

export function defaultPlatform(): PlatformKit {
  return {
    loadViewer: defaultLoadViewer,
    loadHost: defaultLoadHost,
    loadCreator: defaultLoadCreator,
    locate: browserLocate,
    now: () => new Date(),
    scheduler: browserScheduler,
    loadTurnstile: () => loadTurnstileScript(),
    photo: browserPhotoKit,
    surface: canvasSurface,
    puzzleFeel: (settings) => createBrowserFeel(settings),
    voice: { recorder: browserRecorderFactory(), createAudio: browserAudio, unlockAudio: browserUnlock },
    saveFile: browserSaveFile,
    origin: () => location.origin,
    copyText: browserCopyText,
  };
}

import { defaultLoadViewer, type LoadViewer } from "./viewer/types";
import { browserAudio, browserRecorderFactory, browserUnlock, type RecorderFactory, type VoiceDeps } from "./play/voice";

/**
 * What the shell takes from the browser, in one place, so tests and the demo can swap it: loading
 * the Viewer, the microphone and speaker, and saving a file. Each default is the real browser's.
 */
export type PlatformKit = {
  loadViewer: LoadViewer;
  voice: {
    recorder: RecorderFactory | null;
    createAudio: NonNullable<VoiceDeps["createAudio"]>;
    unlockAudio: () => Promise<void>;
  };
  /** Offers `blob` to the visitor as a download. */
  saveFile(name: string, blob: Blob): void;
};

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

export function defaultPlatform(): PlatformKit {
  return {
    loadViewer: defaultLoadViewer,
    voice: { recorder: browserRecorderFactory(), createAudio: browserAudio, unlockAudio: browserUnlock },
    saveFile: browserSaveFile,
  };
}

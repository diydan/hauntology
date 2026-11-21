import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * The Table's camera backdrop (spirit-table 5.1, `puzzles` 15.10): the phone's rear camera in a video element under the canvas, from the
 * Player's own tap on "Camera" only. Off every time the layer opens. Shown in the video element and nowhere else: never recorded, stored,
 * copied to a canvas, analysed or sent (the source test bans MediaRecorder, ImageCapture, getDisplayMedia and drawing the video).
 * A visible indicator and a stop control while it is on; it stops when the Table closes, the page is hidden or the Player stops it; a
 * refusal or a missing camera is one line of text and the stand-in table stays.
 */

export type CameraStatus = "off" | "starting" | "on" | "refused" | "unavailable";

export const CAMERA_WORDS: Readonly<Record<CameraStatus, string>> = {
  off: "Camera off. The table stands on a dark stand-in.",
  starting: "Asking for the camera…",
  on: "Camera on. Nothing is recorded or saved.",
  refused: "The camera was not allowed. Nothing is lost: the stand-in table stays.",
  unavailable: "No camera here. The stand-in table stays.",
};

type Media = Pick<MediaDevices, "getUserMedia">;
export type CameraDeps = Readonly<{ media?: Media | null }>;

const defaultMedia = (): Media | null => (typeof navigator !== "undefined" && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function" ? navigator.mediaDevices : null);

export type RearCamera = Readonly<{
  status: CameraStatus;
  /** The one line that says what is going on (also for a screen reader). */
  message: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  start: () => Promise<void>;
  stop: () => void;
}>;

/** The rear camera for the Table. `deps.media` is for tests; the real one is `navigator.mediaDevices`. */
export function useRearCamera(deps: CameraDeps = {}): RearCamera {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const token = useRef(0);
  const [status, setStatus] = useState<CameraStatus>("off");
  const media = deps.media;

  const halt = useCallback((to: CameraStatus): void => {
    token.current += 1; // a request still waiting for its permission must not turn the camera on afterwards
    const s = stream.current;
    stream.current = null;
    if (s) for (const t of s.getTracks()) t.stop();
    const v = videoRef.current;
    if (v) { v.srcObject = null; }
    setStatus(to);
  }, []);

  const stop = useCallback((): void => halt("off"), [halt]);

  const start = useCallback(async (): Promise<void> => {
    if (stream.current) return;
    const m = media === undefined ? defaultMedia() : media;
    if (!m) { setStatus("unavailable"); return; }
    const mine = ++token.current;
    setStatus("starting");
    try {
      const s = await m.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (mine !== token.current) { for (const t of s.getTracks()) t.stop(); return; }
      stream.current = s;
      const v = videoRef.current;
      if (v) {
        v.srcObject = s;
        v.muted = true;
        void Promise.resolve(v.play?.()).catch(() => undefined);
      }
      setStatus("on");
    } catch (e) {
      if (mine !== token.current) return;
      const raw = typeof e === "object" && e !== null ? (e as { name?: unknown }).name : undefined;
      const name = typeof raw === "string" ? raw : "";
      setStatus(name === "NotFoundError" || name === "OverconstrainedError" || name === "NotSupportedError" ? "unavailable" : "refused");
    }
  }, [media]);

  // stop when the page is hidden, and when the Table closes
  useEffect(() => {
    const onHide = (): void => { if (document.visibilityState === "hidden" && stream.current) halt("off"); };
    document.addEventListener("visibilitychange", onHide);
    return () => { document.removeEventListener("visibilitychange", onHide); const s = stream.current; stream.current = null; token.current += 1; if (s) for (const t of s.getTracks()) t.stop(); };
  }, [halt]);

  return { status, message: CAMERA_WORDS[status], videoRef, start, stop };
}

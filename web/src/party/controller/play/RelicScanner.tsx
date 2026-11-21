import { useEffect, useRef, useState, type ReactNode } from "react";
import { openRearCamera } from "../../phone/camera";
import { parseRelicToken } from "@hauntology/shared/party/relic-token";

/**
 * Choosing a Relic by scanning its printed token (party-mode 9.7). The camera is asked for only when the Player taps Scan, uses the phone's
 * built-in barcode detector where there is one, and says in words when it cannot. What it reads goes through `parseRelicToken`, which
 * accepts a Relic token and nothing else; the picture is never kept or sent. Choosing from the list always works instead.
 */
export type Detect = (video: HTMLVideoElement) => Promise<string | null>;
type BarcodeDetectorLike = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };

export const hasScanner = (g: object = globalThis): boolean => typeof (g as { BarcodeDetector?: unknown }).BarcodeDetector === "function";

export const builtInDetect: Detect = async (video) => {
  const D = (globalThis as unknown as { BarcodeDetector: new (o: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
  const found = await new D({ formats: ["qr_code"] }).detect(video);
  return found[0]?.rawValue ?? null;
};

export function RelicScanner({ onRelic, detect = builtInDetect, available = hasScanner(), getStream = openRearCamera }: {
  onRelic: (relicId: string) => void; detect?: Detect; available?: boolean; getStream?: () => Promise<MediaStream>;
}): ReactNode {
  const [state, setState] = useState<"idle" | "scanning" | "denied" | "unreadable">("idle");
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const stop = (): void => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  useEffect(() => stop, []);
  useEffect(() => {
    if (state !== "scanning") return;
    let live = true;
    const loop = async (): Promise<void> => {
      while (live) {
        const v = video.current;
        if (v !== null) {
          const raw = await detect(v).catch(() => null);
          if (raw !== null) {
            const parsed = parseRelicToken(raw);
            if (parsed.ok) { stop(); setState("idle"); onRelic(parsed.relicId); return; }
            setState("unreadable");
            stop();
            return;
          }
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    };
    void loop();
    return () => { live = false; };
  }, [state, detect, onRelic]);

  if (!available) return <p className="ui-hint">This phone cannot scan. Choose the relic from the list.</p>;
  const start = async (): Promise<void> => {
    try {
      stream.current = await getStream();
      setState("scanning");
      queueMicrotask(() => { if (video.current !== null && stream.current !== null) { video.current.srcObject = stream.current; void video.current.play?.(); } });
    } catch { setState("denied"); }
  };
  return (
    <div className="ui-stack--tight">
      {state === "scanning" ? (
        <>
          <video ref={video} className="pc-scan" muted playsInline aria-label="Camera view for scanning a relic" />
          <button type="button" className="ui-button" onClick={() => { stop(); setState("idle"); }}>Stop scanning</button>
        </>
      ) : (
        <button type="button" className="ui-button" onClick={() => void start()}>Scan a relic</button>
      )}
      {state === "denied" ? <p className="ui-hint" role="status">The camera is not allowed. Choose the relic from the list.</p> : null}
      {state === "unreadable" ? <p className="ui-hint" role="status">That is not a relic from this game. Try again, or choose from the list.</p> : null}
    </div>
  );
}

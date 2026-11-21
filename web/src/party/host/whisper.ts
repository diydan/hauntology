import { useEffect, useRef, useState } from "react";
import type { HostView } from "./host-view";

/**
 * The Stitch whisper on the Host (party-mode 8.13, 18.4): when the Room plays a whispered line, the Host shows its subtitle and plays the Player's
 * recorded words one after the other. The clips come from the Room in the message and are never kept: nothing is stored, and the subtitle is the words.
 * A Host with no audio shows the subtitle only. The public log already says only "a voice whispered".
 */
export type WhisperDeps = Readonly<{ playClip: (clip: Readonly<{ contentType: string; audio: string }>) => Promise<void> }>;
export const WHISPER_SUBTITLE_MS = 4000;

export function useWhisper(host: HostView, deps: WhisperDeps | null, setTimer: (f: () => void, ms: number) => unknown = (f, ms) => setTimeout(f, ms)): string {
  const [subtitle, setSubtitle] = useState("");
  const seen = useRef(new Set<string>());
  const w = host.whispers.at(-1) ?? null;
  useEffect(() => {
    if (w === null || seen.current.has(w.id)) return;
    seen.current.add(w.id);
    setSubtitle(w.subtitle);
    setTimer(() => setSubtitle((s) => (s === w.subtitle ? "" : s)), WHISPER_SUBTITLE_MS);
    if (deps === null) return;
    void (async () => { for (const c of w.clips) { try { await deps.playClip(c); } catch { return; } } })();
  }, [w, deps, setTimer]);
  return subtitle;
}

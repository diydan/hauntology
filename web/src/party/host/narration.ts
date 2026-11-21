import { useEffect, useRef, useState } from "react";
import { createHostAudio, type HostAudio, type HostAudioDeps } from "../../app/case/host-voice";
import type { HostView } from "./host-view";

/**
 * Spoken narration on the Host (party-mode 8.8): the Room names a line (`voice`), the Host asks for its audio with the Host token (the 5 s deadline,
 * the cache and the Library are the server's), plays it after one tap that unlocks audio, and falls back to the browser's own voice and then to the
 * subtitle, which is always shown. Off unless the Master switched it on. The Master's mute, replay and skip arrive as `speechControl`.
 */
export type NarrationDeps = Omit<HostAudioDeps, "onSubtitle" | "roomCode" | "hostToken">;

export function useNarration(host: HostView, ids: { roomCode: string | null; hostToken: string | null }, deps: NarrationDeps | null): { subtitle: string; unlocked: boolean; unlock: () => void; muted: boolean } {
  const [subtitle, setSubtitle] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const audio = useRef<HostAudio | null>(null);
  const lastLine = useRef<string | null>(null);
  const handled = useRef(new Set<string>());
  const lastControl = useRef(0);
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  useEffect(() => {
    if (deps === null || ids.roomCode === null || ids.hostToken === null) { audio.current = null; return; }
    const a = createHostAudio({ ...deps, roomCode: ids.roomCode, hostToken: ids.hostToken, onSubtitle: setSubtitle });
    audio.current = a;
    return () => { a.dispose(); audio.current = null; };
  }, [deps, ids.roomCode, ids.hostToken]);

  // a new spoken line: the subtitle always, the audio only when speech is on and not muted
  const line = host.spoken.at(-1) ?? null;
  useEffect(() => {
    if (line === null || handled.current.has(line.lineId)) return;
    handled.current.add(line.lineId);
    lastLine.current = line.lineId;
    setSubtitle(line.text);
    if (host.speechOn && !mutedRef.current) void audio.current?.onVoiceCue({ lineId: line.lineId, text: line.text, kind: line.kind });
  }, [line, host.speechOn]);

  // switching the voice off stops what is playing
  useEffect(() => { if (!host.speechOn) audio.current?.stop(); }, [host.speechOn]);

  // the Master's controls
  const c = host.speechAction;
  useEffect(() => {
    if (c === null || c.n === lastControl.current) return;
    lastControl.current = c.n;
    if (c.action === "mute") { setMuted(true); audio.current?.stop(); }
    else if (c.action === "unmute") setMuted(false);
    else if (c.action === "skip") audio.current?.stop();
    else if (c.action === "replay" && line !== null && host.speechOn && !mutedRef.current) void audio.current?.onVoiceCue({ lineId: line.lineId, text: line.text, kind: line.kind });
  }, [c, line, host.speechOn]);

  return { subtitle, unlocked, muted, unlock: () => { audio.current?.unlock(); setUnlocked(true); } };
}

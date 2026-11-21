import { useMemo, useRef, type ReactNode } from "react";
import { effectLimits, type ReactionEvent } from "@hauntology/shared/party/display";
import type { SoundEvent } from "../controller/game-view";
import { usePhoneSound, type SoundDeps } from "../controller/play/phone-sound";
import type { HostView } from "./host-view";

/**
 * Cues, Rattles, the Becoming, the hour strike and the Blackout on the Host (party-mode 8.9, 8.11, 8.12, 8.13), all inside the photosensitivity limits:
 * at most three flashes a second, a dimming step of at most 20 percent, nothing at all under reduced motion. A Cue on the TV lasts at most 3 s with its
 * caption (the caption is in the HUD's live region too). Sounds start at the Room's time on the Room's clock, play at most 80 percent loud, and a
 * missing file or a screen without audio shows the line only. The strike rings once for each hour on the dial (twelve at midnight).
 */
export function hostSounds(host: HostView): SoundEvent[] {
  return [
    ...host.tvCues.map((c): SoundEvent => ({ id: c.id, kind: "cue", sound: c.cue, playAtMs: c.playAtMs, plan: "play" })),
    ...host.rattles.map((r): SoundEvent => ({ id: r.id, kind: "rattle", sound: r.sound, playAtMs: r.playAtMs, plan: "play", volume: r.volume })),
    ...host.becomings.map((b): SoundEvent => ({ id: b.id, kind: "cue", sound: "becoming", playAtMs: b.atMs, plan: "play" })),
    ...host.strikes.map((s): SoundEvent => ({ id: s.id, kind: "strike", sound: `bell-${s.count}`, playAtMs: s.atMs, plan: "play" })),
  ];
}

/** How dark the screen is now, 0 to 60 percent: the Blackout's steps (at most 20 percent each), then a slow return. Under reduced motion it never dims. */
export function blackoutDim(events: readonly Readonly<{ id: number; kind: string; option?: string }>[], seenAtMs: ReadonlyMap<number, number>, nowMs: number, reducedMotion: boolean): number {
  let dim = 0;
  for (const e of events) {
    if (e.kind !== "haunt-event" || e.option !== "blackout") continue;
    const t0 = seenAtMs.get(e.id);
    if (t0 === undefined) continue;
    const steps = effectLimits([{ id: e.id, atMs: t0, kind: "blackout" } satisfies ReactionEvent], reducedMotion)[0]?.dim ?? [];
    const since = nowMs - t0;
    if (since > BLACKOUT_HOLD_MS + BLACKOUT_RETURN_MS) continue;
    const reached = steps.filter((s) => s.atMs <= nowMs).at(-1);
    const level = reached === undefined ? 0 : 100 - reached.levelPct;
    const back = Math.max(0, Math.min(1, (since - BLACKOUT_HOLD_MS) / BLACKOUT_RETURN_MS));
    dim = Math.max(dim, level * (1 - back));
  }
  return Math.round(dim);
}
export const BLACKOUT_HOLD_MS = 4000;
export const BLACKOUT_RETURN_MS = 3000;
/** The longest a Cue's caption stays over the picture. */
export const CUE_CAPTION_MS = 3000;

export function HostEffects({ host, offsetMs, nowMs, deps, reducedMotion }: { host: HostView; offsetMs: number; nowMs: number; deps: SoundDeps; reducedMotion: boolean }): ReactNode {
  const sounds = useMemo(() => hostSounds(host), [host]);
  const flashing = usePhoneSound(sounds, offsetMs, deps);
  // when each Haunt Event was first seen, so the Blackout steps start then
  const seen = useRef(new Map<number, number>());
  const events = host.game.pub?.events ?? [];
  for (const e of events) if (e.kind === "haunt-event" && !seen.current.has(e.id)) seen.current.set(e.id, nowMs);
  const dim = blackoutDim(events as never, seen.current, nowMs, reducedMotion);
  // the newest Cue's caption, for at most 3 s
  const cue = host.tvCues.at(-1) ?? null;
  const caption = cue !== null && nowMs < cue.playAtMs - offsetMs + CUE_CAPTION_MS ? cue.caption : null;
  const rattle = host.rattles.at(-1);
  return (
    <>
      {flashing && !reducedMotion ? <div className="ph-flash" aria-hidden="true" data-testid="ph-flash" /> : null}
      {dim > 0 ? <div className="ph-dim" aria-hidden="true" data-testid="ph-dim" style={{ opacity: dim / 100 }} /> : null}
      {caption !== null ? <p className="ph-caption ui-speech" data-testid="ph-caption">{caption}</p> : null}
      {rattle !== undefined && nowMs < rattle.playAtMs - offsetMs + CUE_CAPTION_MS ? <p className="ph-caption ui-speech" data-testid="ph-rattle">{rattle.line}</p> : null}
    </>
  );
}

import { useRef } from "react";
import { WINDOW_MS } from "@hauntology/shared/party/engine";
import type { PublicSnapshot } from "@hauntology/shared/party/engine";
import type { HostView } from "../host-view";

/**
 * What the Host's scenes read from the public state, and nothing else (puzzles Requirements 19.3, 20.4, 20.9): the base of the Turn Clock, whether
 * the 15 seconds after a Suggestion are running or an answer choice is open, and whether the Room's own voice is speaking or due. The Public View
 * carries no Turn base and no window, so the Host works both out from what it has seen on its own clock; none of it is private.
 */

/** The base of this Turn's clock: the time left when the Host first saw the Turn, kept until the Turn changes (a Help or a Spook then moves the shadow). */
export type TurnBase = Readonly<{ key: string; base: number }>;
export function turnBase(prev: TurnBase | null, pub: Pick<PublicSnapshot, "round" | "active" | "phase"> | null, remainingMs: number | null): TurnBase | null {
  if (pub === null || pub.phase !== "playing" || pub.active === null || remainingMs === null) return null;
  const key = `${pub.round}:${pub.active}`;
  if (prev !== null && prev.key === key) return prev;
  return remainingMs > 0 ? { key, base: remainingMs } : null;
}

/** True during the window after a Suggestion (15 seconds from the moment the Host first saw the newest one) and while an answer choice is open. */
export function reelBlocked(pub: Pick<PublicSnapshot, "events" | "haunt"> | null, firstSeenAt: ReadonlyMap<number, number>, nowMs: number): boolean {
  if (pub === null) return false;
  if (pub.haunt.choosing !== null) return true;
  const last = [...pub.events].reverse().find((e) => e.kind === "suggest");
  if (last === undefined) return false;
  const at = firstSeenAt.get(last.id);
  return at !== undefined && nowMs < at + WINDOW_MS;
}

/** How long a line of the Room (an Event line, an ending line) counts as speaking or due once the Host saw it. */
export const ROOM_LINE_HOLD_MS = 10_000;
export function roomVoiceBusy(host: Pick<HostView, "spoken">, firstSeenAt: ReadonlyMap<string, number>, nowMs: number): boolean {
  const last = host.spoken.at(-1);
  if (last === undefined) return false;
  const at = firstSeenAt.get(last.lineId);
  return at !== undefined && nowMs < at + ROOM_LINE_HOLD_MS;
}

/** The Host's three readings, kept across renders. Call once per render of the page. */
export function useSceneSignals(host: HostView, remainingMs: number | null, nowMs: number): { base: number | null; blocked: boolean; roomLineBusy: boolean } {
  const pub = host.game.pub;
  const base = useRef<TurnBase | null>(null);
  base.current = turnBase(base.current, pub, remainingMs);
  const suggestSeen = useRef(new Map<number, number>());
  for (const e of pub?.events ?? []) if (e.kind === "suggest" && !suggestSeen.current.has(e.id)) suggestSeen.current.set(e.id, nowMs);
  const voiceSeen = useRef(new Map<string, number>());
  for (const l of host.spoken) if (!voiceSeen.current.has(l.lineId)) voiceSeen.current.set(l.lineId, nowMs);
  return { base: base.current?.base ?? null, blocked: reelBlocked(pub, suggestSeen.current, nowMs), roomLineBusy: roomVoiceBusy(host, voiceSeen.current, nowMs) };
}

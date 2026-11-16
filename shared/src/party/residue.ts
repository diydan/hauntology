import { hash, mulberry32, shuffle } from "../puzzles/rng";
import type { Card } from "./deal";

/**
 * Residue and Inspect (party-mode 4.6). The three Residue cards hide in three different Zones. A Detective learns one
 * only by staying 10 seconds of their own Turn inside that Zone, once per Zone; the result is private, and the public
 * log shows only the Zone. A Cold Spot does not block Inspect.
 */
export const INSPECT_MS = 10_000;

/** Each Residue card in a different Zone, from the seeded stream `residue`. Zone id to card id. */
export function placeResidue(zoneIds: readonly string[], residue: readonly Card[], seed: number): Record<string, string> {
  if (new Set(zoneIds).size < residue.length) throw new Error("placeResidue needs a Zone for every Residue card");
  const zones = shuffle(mulberry32(hash("residue", seed)), [...new Set(zoneIds)]);
  return Object.fromEntries(residue.map((c, i) => [zones[i] as string, c.id]));
}

export type InspectCheck = Readonly<{
  seat: number;
  activeSeat: number | null;
  poltergeist: boolean;
  inZone: string | null;
  inspected: readonly string[];
  /** An Inspect already running this Turn. */
  inspecting: boolean;
}>;
export type InspectRefusal = "not_your_turn" | "poltergeist" | "not_in_zone" | "already_inspected";

/** Why this Player may not start an Inspect here, or null when they may. */
export function inspectRefusal(c: InspectCheck): InspectRefusal | null {
  if (c.activeSeat !== c.seat || c.inspecting) return "not_your_turn";
  if (c.poltergeist) return "poltergeist";
  if (c.inZone === null) return "not_in_zone";
  if (c.inspected.includes(c.inZone)) return "already_inspected";
  return null;
}
export const canInspect = (c: InspectCheck): boolean => inspectRefusal(c) === null;

export type Inspecting = Readonly<{ seat: number; zone: string; untilMs: number }>;
export const startInspect = (seat: number, zone: string, nowMs: number): Inspecting => ({ seat, zone, untilMs: nowMs + INSPECT_MS });

/**
 * Settle a running Inspect. Leaving the Zone or the Turn ending first cancels it. When its time is up with the Player
 * still inside, the Zone counts as inspected and the Player learns the card hidden there, or that there is none.
 */
export function settleInspect(
  i: Inspecting, nowMs: number, stillInZone: boolean, turnStillRunning: boolean, residueAt: Readonly<Record<string, string>>,
): { status: "running" } | { status: "cancelled" } | { status: "done"; zone: string; card: string | null } {
  if (!stillInZone || !turnStillRunning) return { status: "cancelled" };
  if (nowMs < i.untilMs) return { status: "running" };
  return { status: "done", zone: i.zone, card: residueAt[i.zone] ?? null };
}

/** The only public trace of an Inspect: who searched which Zone. */
export const publicInspect = (id: number, seat: number, zone: string) => ({ id, kind: "inspect" as const, seat, zone });

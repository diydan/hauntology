/**
 * Room spend and the narration cap (party-mode 10.1, 10.2). The Room has its own caps, on top of the global ones, and at
 * most one model narration is asked for per public event for the whole Room. Everything here is accounting: the real
 * reserve goes through SpendGuard with the Room id as the scope.
 */
export type RoomCaps = Readonly<{ images: number; models: number }>;
export const DEFAULT_ROOM_CAPS: RoomCaps = { images: 12, models: 60 };
export const roomCaps = (o: Partial<RoomCaps> = {}): RoomCaps => ({
  images: Number.isInteger(o.images) && (o.images as number) >= 0 ? (o.images as number) : DEFAULT_ROOM_CAPS.images,
  models: Number.isInteger(o.models) && (o.models as number) >= 0 ? (o.models as number) : DEFAULT_ROOM_CAPS.models,
});

export type RoomSpend = Readonly<{ images: number; models: number }>;
export const NO_SPEND: RoomSpend = { images: 0, models: 0 };
export type Meter = "images" | "models";
export type Reserve = Readonly<{ ok: true; spend: RoomSpend }> | Readonly<{ ok: false; reason: "room_cap" | "global_cap" | "kill_switch"; spend: RoomSpend }>;

/** One unit against the Room's cap and the global answer. A refusal changes nothing, and nothing is spent upstream. */
export function reserve(spend: RoomSpend, caps: RoomCaps, meter: Meter, global: Readonly<{ allowed: boolean; killSwitch?: boolean }> = { allowed: true }): Reserve {
  if (global.killSwitch === true) return { ok: false, reason: "kill_switch", spend };
  if (spend[meter] >= caps[meter]) return { ok: false, reason: "room_cap", spend };
  if (!global.allowed) return { ok: false, reason: "global_cap", spend };
  return { ok: true, spend: { ...spend, [meter]: spend[meter] + 1 } };
}

/** The kinds whose lines are always scripted and never call a model, so they are not counted against the narration cap. */
export const SCRIPTED_ONLY: readonly string[] = ["cue", "nudge", "phone-cue"];
export type NarrationEvent = Readonly<{ id: number; kind: string }>;
export type NarrationStep = Readonly<{ id: number; mode: "model" | "scripted" }>;

/**
 * For each public event, in order: a model call only when the kind allows one, no earlier call was made for the same
 * event id, the kill switch is off and the Room's model cap has room; otherwise a scripted line. Never more than one
 * model call per event, and whichever it is, the game state is the same.
 */
export function planNarration(events: readonly NarrationEvent[], spend: RoomSpend, caps: RoomCaps, killSwitch = false): { steps: NarrationStep[]; spend: RoomSpend } {
  const seen = new Set<number>();
  let s = spend;
  const steps: NarrationStep[] = [];
  for (const e of events) {
    let mode: "model" | "scripted" = "scripted";
    if (!seen.has(e.id) && !SCRIPTED_ONLY.includes(e.kind)) {
      const r = reserve(s, caps, "models", { allowed: true, killSwitch });
      if (r.ok) { s = r.spend; mode = "model"; }
    }
    seen.add(e.id);
    steps.push({ id: e.id, mode });
  }
  return { steps, spend: s };
}
export const narrationRequests = (steps: readonly NarrationStep[]): number => steps.filter((s) => s.mode === "model").length;

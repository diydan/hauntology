/**
 * Nudges (party-mode 12.2 to 12.4): another Player pays Resolve to change the active Player's Turn Clock. Help adds
 * 10 s (never past 120 s) for 1; Spook removes 10 s for 2. At most one of each per Turn. A Spook needs 20 s left,
 * keeps the Turn at 30 s or more, and is refused when anyone Spooked this Round or in the previous three Turns, or
 * when this Player Spooked on the previous Turn. Bots never Nudge. A refused Nudge costs nothing.
 */
export type NudgeKind = "help" | "spook";
export const NUDGE_MS = 10_000;
export const NUDGE_CAP_MS = 120_000;
export const SPOOK_MIN_LEFT_MS = 20_000;
export const SPOOK_FLOOR_MS = 30_000;
export const SPOOK_GAP_TURNS = 4;

export const nudgeCost = (k: NudgeKind): number => (k === "help" ? 1 : 2);

export type NudgeReason =
  | "no_clock" | "own_turn" | "bot" | "spook_off" | "nudges_off" | "no_resolve" | "help_turn_limit" | "spook_turn_limit"
  | "clock_at_cap" | "spook_time_left" | "spook_turn_too_short" | "spook_round_limit" | "spook_gap" | "spook_repeat";

export type LastSpook = Readonly<{ seat: number; round: number; turnIndex: number }>;
export type NudgeCheck = Readonly<{
  seat: number; bot: boolean; activeSeat: number | null; resolve: number;
  setting: "all" | "help-only" | "off";
  /** False with no clock, or while the clock is paused. */
  clockRunning: boolean;
  budgetMs: number; leftMs: number;
  usedThisTurn: Readonly<{ help: boolean; spook: boolean }>;
  round: number; turnIndex: number; lastSpook: LastSpook | null;
}>;

export function canNudge(c: NudgeCheck, kind: NudgeKind): { ok: true } | { ok: false; reason: NudgeReason } {
  const no = (reason: NudgeReason): { ok: false; reason: NudgeReason } => ({ ok: false, reason });
  if (c.bot) return no("bot");
  if (c.setting === "off") return no("nudges_off");
  if (kind === "spook" && c.setting === "help-only") return no("spook_off");
  if (!c.clockRunning || c.activeSeat === null) return no("no_clock");
  if (c.seat === c.activeSeat) return no("own_turn");
  if (kind === "help") {
    if (c.usedThisTurn.help) return no("help_turn_limit");
    if (c.budgetMs >= NUDGE_CAP_MS) return no("clock_at_cap");
  } else {
    if (c.usedThisTurn.spook) return no("spook_turn_limit");
    if (c.leftMs < SPOOK_MIN_LEFT_MS) return no("spook_time_left");
    if (c.budgetMs - NUDGE_MS < SPOOK_FLOOR_MS) return no("spook_turn_too_short");
    if (c.lastSpook !== null && c.lastSpook.round === c.round) return no("spook_round_limit");
    if (c.lastSpook !== null && c.turnIndex - c.lastSpook.turnIndex < SPOOK_GAP_TURNS) {
      return no(c.lastSpook.seat === c.seat && c.turnIndex - c.lastSpook.turnIndex === 1 ? "spook_repeat" : "spook_gap");
    }
  }
  if (c.resolve < nudgeCost(kind)) return no("no_resolve");
  return { ok: true };
}

/** The new budget and Resolve after an accepted Nudge. */
export function applyNudge(budgetMs: number, resolve: number, kind: NudgeKind): { budgetMs: number; resolve: number } {
  return {
    budgetMs: kind === "help" ? Math.min(NUDGE_CAP_MS, budgetMs + NUDGE_MS) : budgetMs - NUDGE_MS,
    resolve: resolve - nudgeCost(kind),
  };
}

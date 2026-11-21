import { describe, expect, it } from "vitest";
import { ErrorCode } from "../errors";
import {
  ackSight, closeLock, freezeFor, initPartyLocks, inspectPlan, markWorldClueSeen, openLock, restoreLock, setPlain, sightIdOf, sightsOnEntry, submitAttempt, worldClueNotebook,
  type PartyLocks,
} from "./inspect";
import { makeLock } from "./make";
import { placePuzzles, type PlacedLock } from "./place";
import { isMemoryKind } from "./types";
import { referenceSolve } from "./verify";
import { placeWorldClues, worldCluePrompt } from "./world-clues";

const CAP = 25_000;
const zones = ["Hall", "Library", "Kitchen", "Attic", "Cellar", "Garden"];
function fixture(seed = 11) {
  const res = placePuzzles(seed, zones, "medium");
  if (!res.ok) throw new Error("placement");
  const placed = res.value;
  return { placed, state: initPartyLocks(placed), memory: placed.find((p) => isMemoryKind(p.kind)) as PlacedLock, plain: placed.find((p) => !isMemoryKind(p.kind)) as PlacedLock };
}
const ctx = { setting: "medium" as const, capMs: CAP, isBot: false };
const solve = (p: PlacedLock) => referenceSolve(makeLock(p.kind, p.level, p.seed));

describe("openLock", () => {
  it("opens the Zone's Lock with the view, three Attempts, the Cap and one public line", () => {
    const { state, memory } = fixture();
    const r = openLock(state, "s1", memory.zone, 1000, ctx);
    if (!r.ok) throw new Error("open");
    expect(r.value.lockId).toBe(memory.lockId);
    expect(r.value.attempts).toBe(3);
    expect(r.value.capMs).toBe(CAP);
    expect(r.value.deadlineAt).toBe(1000 + CAP);
    expect(r.value.view.kind).toBe(memory.kind);
    expect(r.value.publicLine).toEqual({ type: "inspect", seat: "s1", zone: memory.zone });
  });

  it("ends the Lock at the end of the Turn when that comes before the Cap", () => {
    const { state, plain } = fixture();
    const r = openLock(state, "s1", plain.zone, 0, { ...ctx, turnDeadline: 9000 });
    expect(r.ok && r.value.deadlineAt).toBe(9000);
  });

  it("refuses a second Lock for a seat, an unknown Zone, a Bot and a Room with puzzles off", () => {
    const { state, plain } = fixture();
    const a = openLock(state, "s1", plain.zone, 0, ctx);
    if (!a.ok) throw new Error("open");
    const again = openLock(a.value.state, "s1", plain.zone, 5, ctx);
    expect(!again.ok && again.code).toBe(ErrorCode.puzzle_already_open);
    const other = openLock(a.value.state, "s2", plain.zone, 5, ctx); // another Player may open the same Zone's Lock
    expect(other.ok).toBe(true);
    const nowhere = openLock(state, "s1", "Moon", 0, ctx);
    expect(!nowhere.ok && nowhere.code).toBe(ErrorCode.puzzle_not_open);
    expect(!openLock(state, "s1", plain.zone, 0, { ...ctx, isBot: true }).ok).toBe(true);
    const off = openLock(state, "s1", plain.zone, 0, { ...ctx, setting: "off" });
    expect(!off.ok && off.code).toBe(ErrorCode.puzzle_disabled);
  });

  it("gives a Faded clue for a Memory Kind whose Sight the seat never saw, and none once it did", () => {
    const { state, memory, plain } = fixture();
    const unseen = openLock(state, "s1", memory.zone, 0, ctx);
    expect(unseen.ok && unseen.value.faded !== null).toBe(true);
    expect(unseen.ok && unseen.value.faded?.showMs).toBe(4000);
    const noSight = openLock(state, "s1", plain.zone, 0, ctx);
    expect(noSight.ok && noSight.value.faded).toBeNull();
    // the seat walks into the Zone that shows the Sight and acknowledges it
    const entered = sightsOnEntry(state, "s2", memory.sightZone as string);
    const acked = ackSight(entered.state, "s2", sightIdOf(memory.lockId));
    if (!acked.ok) throw new Error("ack");
    const seen = openLock(acked.value, "s2", memory.zone, 0, ctx);
    expect(seen.ok && seen.value.faded).toBeNull();
    const assist = openLock(state, "s3", memory.zone, 0, { ...ctx, assist: true });
    expect(assist.ok && assist.value.faded?.showMs).toBe(8000);
  });
});

describe("submitAttempt and closeLock", () => {
  it("charges at least 10 s for a quick solve and the time spent for a slow one", () => {
    const { state, plain } = fixture();
    const open = (now: number) => { const r = openLock(state, "s1", plain.zone, now, ctx); if (!r.ok) throw new Error("open"); return r.value.state; };
    const quick = submitAttempt(open(0), "s1", plain.lockId, solve(plain), 3000, { inspect: () => "r", capMs: CAP });
    expect(quick.ok && quick.value.outcome === "solved" && quick.value.chargeMs).toBe(10_000);
    const slow = submitAttempt(open(0), "s1", plain.lockId, solve(plain), 18_000, { inspect: () => "r", capMs: CAP });
    expect(slow.ok && slow.value.outcome === "solved" && slow.value.chargeMs).toBe(18_000);
  });

  it("fails the Lock when the Cap or the Turn ran out, and says which", () => {
    const { state, plain } = fixture();
    const r = openLock(state, "s1", plain.zone, 0, ctx);
    if (!r.ok) throw new Error("open");
    const calls: string[] = [];
    const inspect = () => { calls.push("x"); return 1; };
    const capped = submitAttempt(r.value.state, "s1", plain.lockId, solve(plain), CAP, { inspect, capMs: CAP });
    expect(capped.ok && capped.value.outcome === "failed" && capped.value.reason).toBe("cap");
    const ended = submitAttempt(r.value.state, "s1", plain.lockId, solve(plain), 8000, { inspect, capMs: CAP, turnDeadline: 8000 });
    expect(ended.ok && ended.value.outcome === "failed" && ended.value.reason).toBe("turn_ended");
    expect(calls).toEqual([]);
  });

  it("refuses an Attempt for the wrong Lock or no Lock", () => {
    const { state, plain, memory } = fixture();
    const r = openLock(state, "s1", plain.zone, 0, ctx);
    if (!r.ok) throw new Error("open");
    const wrongId = submitAttempt(r.value.state, "s1", memory.lockId, solve(plain), 5000, { inspect: () => 1, capMs: CAP });
    expect(!wrongId.ok && wrongId.code).toBe(ErrorCode.puzzle_not_open);
    const none = submitAttempt(state, "s2", plain.lockId, solve(plain), 5000, { inspect: () => 1, capMs: CAP });
    expect(!none.ok && none.code).toBe(ErrorCode.puzzle_not_open);
  });

  it("closes a Lock on a give-up with the same charge rule and nothing shown", () => {
    const { state, plain } = fixture();
    const r = openLock(state, "s1", plain.zone, 0, ctx);
    if (!r.ok) throw new Error("open");
    const c = closeLock(r.value.state, "s1", "gave_up", 4000, CAP);
    expect(c.ok && c.value.chargeMs).toBe(10_000);
    expect(c.ok && c.value.state.open["s1"]).toBeNull();
    const again = closeLock(c.ok ? c.value.state : state, "s1", "gave_up", 5000, CAP);
    expect(!again.ok && again.code).toBe(ErrorCode.puzzle_not_open);
  });
});

describe("pause, reconnect and Plain Inspect", () => {
  it("freezes an open Lock's timer by the time paused", () => {
    const { state, plain } = fixture();
    const r = openLock(state, "s1", plain.zone, 1000, ctx);
    if (!r.ok) throw new Error("open");
    const frozen = freezeFor(r.value.state, 30_000);
    expect(frozen.open["s1"]?.openedAt).toBe(31_000);
    expect(freezeFor(frozen, -5).open["s1"]?.openedAt).toBe(31_000);
  });

  it("rebuilds the same Lock for a reconnecting seat, keeping the Attempts used", () => {
    const { state, plain } = fixture();
    const r = openLock(state, "s1", plain.zone, 0, ctx);
    if (!r.ok) throw new Error("open");
    const w = submitAttempt(r.value.state, "s1", plain.lockId, { kind: "x" }, 3000, { inspect: () => 1, capMs: CAP });
    if (!w.ok) throw new Error("submit");
    const back = restoreLock(JSON.parse(JSON.stringify(w.value.state)) as PartyLocks, "s1", {});
    expect(back.ok && back.value.view).toEqual(r.value.view);
    expect(back.ok && back.value.attemptsUsed).toBe(1);
    expect(restoreLock(state, "s9", {}).ok).toBe(false);
  });

  it("plans Plain Inspect for off, for Bots and for a seat that chose it (paying the whole Cap), and a Lock otherwise", () => {
    const { state } = fixture();
    expect(inspectPlan("off", state, "s1", false, CAP)).toEqual({ mode: "plain", chargeMs: 10_000 });
    expect(inspectPlan("medium", state, "b1", true, CAP)).toEqual({ mode: "plain", chargeMs: 10_000 });
    expect(inspectPlan("medium", state, "s1", false, CAP)).toEqual({ mode: "lock" });
    const on = setPlain(state, "s1", true);
    expect(inspectPlan("medium", on, "s1", false, CAP)).toEqual({ mode: "plain", chargeMs: CAP });
    expect(inspectPlan("medium", on, "s2", false, CAP)).toEqual({ mode: "lock" }); // nobody else is told or changed
    expect(inspectPlan("medium", setPlain(on, "s1", false), "s1", false, CAP)).toEqual({ mode: "lock" });
  });

  it("moves an acknowledged Sight from pending to seen, for that seat only", () => {
    const { state, memory } = fixture();
    const entered = sightsOnEntry(state, "s2", memory.sightZone as string);
    expect(entered.delivery?.sightId).toBe(sightIdOf(memory.lockId));
    expect(entered.state.sent["s2"]).toEqual([sightIdOf(memory.lockId)]);
    const acked = ackSight(entered.state, "s2", sightIdOf(memory.lockId));
    if (!acked.ok) throw new Error("ack");
    expect(acked.value.sent["s2"]).toEqual([]);
    expect(acked.value.seen["s2"]).toEqual([sightIdOf(memory.lockId)]);
    expect(acked.value.seen["s1"]).toBeUndefined();
    expect(ackSight(acked.value, "s2", sightIdOf(memory.lockId)).ok).toBe(true); // a repeat ack changes nothing
  });

  it("will not acknowledge a Sight that was never sent", () => {
    const { state } = fixture();
    const r = ackSight(state, "s1", "Snope");
    expect(!r.ok && r.code).toBe(ErrorCode.sight_unknown);
  });
});

describe("World Clues in inspect", () => {
  it("suppresses phone Sights for World Clue Locks, names the Sign in the Lock prompt with no answer, tracks Assist own-turn clues and uses Faded when never in view", () => {
    const { placed } = fixture();
    const zones = [...new Set([...placed.map((p) => p.zone), "Attic", "Cellar", "Vault", "Study"])];
    const clues = placeWorldClues(11, zones, placed.map((p) => ({ zone: p.zone, lock: makeLock(p.kind, p.level, p.seed) })));
    const target = clues.find((c) => c.lockZone !== null)!;
    const decoy = clues.find((c) => c.lockZone === null)!;
    const lock = placed.find((p) => p.zone === target.lockZone)!;
    const state = initPartyLocks(placed, clues);

    // No phone Sight is sent on entry for a World Clue lock even if sightZone exists
    if (lock.sightZone) expect(sightsOnEntry(state, "s1", lock.sightZone).delivery).toBeNull();

    // Opening before anyone saw the World Clue yields Faded, prompt naming the Sign (without answer), and canSeeAgain: false
    const unseen = openLock(state, "s1", lock.zone, 0, { setting: "medium", capMs: CAP, isBot: false });
    expect(unseen.ok).toBe(true);
    if (!unseen.ok) return;
    expect(unseen.value.faded).not.toBeNull();
    expect(unseen.value.sign).toBe(target.sign);
    expect(unseen.value.prompt).toBe(worldCluePrompt(lock.kind, target.sign));
    expect(unseen.value.prompt).toContain(target.sign);
    expect(unseen.value.canSeeAgain).toBe(false);
    expect(worldClueNotebook(state, "s1")).toEqual([]);

    // Seeing the clue off-turn clears Faded for Locks opened next, without adding to Assist own-turn notebook
    const offTurn = markWorldClueSeen(state, "s2", target.sign, false);
    const afterOffTurn = openLock(offTurn, "s1", lock.zone, 0, { setting: "medium", capMs: CAP, isBot: false });
    expect(afterOffTurn.ok && afterOffTurn.value.faded).toBeNull();
    expect(afterOffTurn.ok && afterOffTurn.value.canSeeAgain).toBe(false);
    expect(worldClueNotebook(offTurn, "s2")).toEqual([]);

    // Seeing clues (both real and decoy) on the player's own turn keeps them in Assist's notebook and sets canSeeAgain
    const own1 = markWorldClueSeen(offTurn, "s1", target.sign, true);
    const own2 = markWorldClueSeen(own1, "s1", decoy.sign, true);
    expect(worldClueNotebook(own2, "s1").map((c) => c.sign)).toEqual([target.sign, decoy.sign]);
    const canSee = openLock(own2, "s1", lock.zone, 0, { setting: "medium", capMs: CAP, isBot: false });
    expect(canSee.ok && canSee.value.faded).toBeNull();
    expect(canSee.ok && canSee.value.canSeeAgain).toBe(true);
    const restored = canSee.ok ? restoreLock(canSee.value.state, "s1", {}) : null;
    expect(restored?.ok && restored.value.sign).toBe(target.sign);
    expect(restored?.ok && restored.value.canSeeAgain).toBe(true);
  });
});

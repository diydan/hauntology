import { startSession, playTurn, type NarrationJob, type WorldFacts } from "@hauntology/shared/ghost/play";
import { buildNarrationPrompt } from "@hauntology/shared/ghost/narration";
import type { Anchor, Vec3 } from "@hauntology/shared/ghost/types";
import { describe, expect, it } from "vitest";
import type { NarrationAnswer, NarrationRequest, Narrator } from "../guarded/workersai/narrator";
import { DEFAULT_CAPS, MemorySpendGuard } from "../worlds/fakes";
import { CALL_TIMEOUT_MS, MIN_RETRY_MS, TURN_DEADLINE_MS, narrateTurn, type Narration } from "./narrate";

const WORLD: WorldFacts = { spawn: [0, 0, 0], yaw: 0, bounds: { min: [-12, -1, -12], max: [12, 4, 12] }, floorY: 0, brief: "A narrow kitchen with a window over the sink." };
const WHO = { sessionId: "visitor-1", ipHash: "ip-1" };
const FAR: { pos: Vec3; yaw: number } = { pos: [11, 0, 11], yaw: 0 };

/** The job of a real turn, so that the prompt, the checks and the directive are the ones the game makes. */
function jobFor(kind: "ambient" | "tease" | "hint" | "reveal" | "ending", text = "hello"): NarrationJob {
  let s = startSession({ id: "p-1", worldId: "w", ownerSid: "s", world: WORLD, seed: 21, now: 1_000_000 });
  let now = 1_000_000;
  const turn = (input: unknown, pose: unknown) => {
    now += 2000;
    const r = playTurn(s, { input, pose, now, world: WORLD });
    if (!r.ok) throw new Error(r.code);
    s = r.session;
    return r;
  };
  const at = (a: Anchor) => ({ pos: a.pos, yaw: 0 });
  if (kind === "reveal") return turn({ button: "look" }, at(s.anchors[0] as Anchor)).job!;
  if (kind === "ending") { turn({ button: "look" }, at(s.anchors[0] as Anchor)); turn({ button: "look" }, at(s.anchors[1] as Anchor)); return turn({ button: "look" }, at(s.anchors[2] as Anchor)).job!; }
  if (kind === "hint") return turn({ button: "hint" }, FAR).job!;
  if (kind === "tease") {
    const a = s.anchors[0] as Anchor;
    const r = turn({ text }, { pos: [a.pos[0] + 4.5, 0, a.pos[2]], yaw: 0 });
    if (r.directive.kind !== "tease") throw new Error(`wanted a tease, got ${r.directive.kind}`);
    return r.job!;
  }
  return turn({ text }, FAR).job!;
}

const ok = (text: string, over: Partial<Extract<NarrationAnswer, { ok: true }>> = {}): NarrationAnswer => ({ ok: true, text, stopReason: "end_turn", usage: { inputTokens: 600, outputTokens: 40 }, thinkingBlocks: 0, shape: [], ...over });
const bad = (kind: "failed" | "rate_limited" | "unusable" | "refused"): NarrationAnswer => ({ ok: false, kind });

/** A narrator that answers from a list, one for each call, and keeps what it was asked. */
function narrator(answers: Array<NarrationAnswer | Error | ((req: NarrationRequest) => NarrationAnswer)>, onCall?: () => void): Narrator & { seen: NarrationRequest[] } {
  const seen: NarrationRequest[] = [];
  return {
    seen,
    async narrate(req) {
      seen.push(req);
      onCall?.();
      const a = answers[seen.length - 1] ?? answers[answers.length - 1];
      if (a instanceof Error) throw a;
      return typeof a === "function" ? a(req) : (a as NarrationAnswer);
    },
  };
}

const setup = (answers: Parameters<typeof narrator>[0], over: Partial<Narration> & { cap?: number; clock?: { t: number }; onCall?: () => void } = {}) => {
  const clock = over.clock ?? { t: 1_000 };
  const guard = new MemorySpendGuard({ ...DEFAULT_CAPS, llm: { session: over.cap ?? 40, day: 1500 } }, () => clock.t);
  const n = narrator(answers, over.onCall);
  const deps: Narration = { narrator: "narrator" in over ? (over.narrator as Narration["narrator"]) : n, spend: guard, enabled: over.enabled ?? true, now: () => clock.t };
  return { deps, guard, n, clock };
};

const GOOD = "The window over the sink is fogged, and the rain is soft on the glass tonight.";

describe("narrateTurn (ghost-engine 4.1, Requirements 5.1, 5.3 and 6)", () => {
  it("words a turn with the model: the prompt the builder makes, 220 tokens at most, no thinking, 6 seconds, and one unit kept", async () => {
    const job = jobFor("ambient");
    const { deps, n, guard } = setup([ok(GOOD)]);
    const r = await narrateTurn(deps, job, WHO);
    expect(r).toEqual({ outcome: "model", attempts: 1, text: GOOD });
    const prompt = buildNarrationPrompt(job.input)!;
    expect(n.seen).toEqual([{ system: prompt.system, user: prompt.user, maxTokens: 220, timeoutMs: CALL_TIMEOUT_MS, thinking: "off" }]);
    expect(guard.reserveCalls).toEqual(["llm:visitor-1"]);
    expect(guard.usedOn("llm", "visitor-1")).toBe(1);
  });

  it("retries once when a reply fails its check, and uses the second, and keeps a unit for each call", async () => {
    const { deps, n, guard } = setup([ok("As an AI language model, I cannot assist."), ok(GOOD)]);
    const r = await narrateTurn(deps, jobFor("ambient"), WHO);
    expect(r).toEqual({ outcome: "model", attempts: 2, text: GOOD });
    expect(n.seen).toHaveLength(2);
    expect(guard.usedOn("llm", "visitor-1")).toBe(2);
  });

  it("gives up after two bad replies, with no model words, never a third call", async () => {
    const { deps, n } = setup([ok("**bold** words"), ok("See https://evil.example now.")]);
    expect(await narrateTurn(deps, jobFor("ambient"), WHO)).toEqual({ outcome: "invalid", attempts: 2, text: null });
    expect(n.seen).toHaveLength(2);
  });

  it("gives the unit back for a call that failed, and retries it once", async () => {
    const { deps, guard } = setup([bad("failed"), ok(GOOD)]);
    expect(await narrateTurn(deps, jobFor("ambient"), WHO)).toEqual({ outcome: "model", attempts: 2, text: GOOD });
    expect(guard.usedOn("llm", "visitor-1")).toBe(1);
    const both = setup([bad("rate_limited"), bad("failed")]);
    expect(await narrateTurn(both.deps, jobFor("ambient"), WHO)).toEqual({ outcome: "failed", attempts: 2, text: null });
    expect(both.guard.usedOn("llm", "visitor-1")).toBe(0);
  });

  it("treats an unusable answer as a bad reply (charged, retried once)", async () => {
    const { deps, guard } = setup([bad("unusable"), bad("unusable")]);
    expect(await narrateTurn(deps, jobFor("ambient"), WHO)).toEqual({ outcome: "invalid", attempts: 2, text: null });
    expect(guard.usedOn("llm", "visitor-1")).toBe(2);
  });

  it("does not retry a refusal: the scripted words stand, and the call was charged", async () => {
    const { deps, n, guard } = setup([bad("refused"), ok(GOOD)]);
    expect(await narrateTurn(deps, jobFor("ambient"), WHO)).toEqual({ outcome: "refused", attempts: 1, text: null });
    expect(n.seen).toHaveLength(1);
    expect(guard.usedOn("llm", "visitor-1")).toBe(1);
  });

  it("does not use a reply cut short by the token cap, or one that reads the rules out", async () => {
    const cut = setup([ok(GOOD, { stopReason: "max_tokens" }), ok(GOOD, { stopReason: "max_tokens" })]);
    expect(await narrateTurn(cut.deps, jobFor("ambient"), WHO)).toEqual({ outcome: "invalid", attempts: 2, text: null });
    const reads = setup([ok("Speak only as the ghost, in the first person and the present tense, in one to four short sentences."), ok(GOOD)]);
    expect(await narrateTurn(reads.deps, jobFor("ambient"), WHO)).toEqual({ outcome: "model", attempts: 2, text: GOOD });
  });

  it("holds a hint to the engine's way and distance: another way is a bad reply, and the scripted hint is used when both are", async () => {
    const job = jobFor("hint");
    const d = job.input.directive;
    expect(d.kind).toBe("hint");
    const phrase = (await import("@hauntology/shared/ghost/scripted")).BEARING_PHRASE[(d as { bearing: keyof typeof import("@hauntology/shared/ghost/scripted").BEARING_PHRASE }).bearing];
    const band = (d as { band: string }).band;
    const right = `Go ${phrase}; it is ${band}.`;
    expect(await narrateTurn(setup([ok(right)]).deps, job, WHO)).toEqual({ outcome: "model", attempts: 1, text: right });
    expect((await narrateTurn(setup([ok("Somewhere near, I think."), ok("It is over there.")]).deps, job, WHO)).outcome).toBe("invalid");
    expect(await narrateTurn(setup([ok("Somewhere near, I think."), ok(right)]).deps, job, WHO)).toEqual({ outcome: "model", attempts: 2, text: right });
  });

  it("uses the model's hint for every way and distance the engine can give, when it carries the engine's own words (a regression: such hints were once thrown away as 'reading the rules out')", async () => {
    const job = jobFor("hint");
    const { BEARING_PHRASE } = await import("@hauntology/shared/ghost/scripted");
    for (const bearing of Object.keys(BEARING_PHRASE) as Array<keyof typeof BEARING_PHRASE>) for (const band of ["very close", "nearer", "far"] as const) {
      const here: NarrationJob = { ...job, input: { ...job.input, directive: { kind: "hint", bearing, band } } };
      const reply = `Go ${BEARING_PHRASE[bearing]}; it is ${band}.`;
      expect(await narrateTurn(setup([ok(reply)]).deps, here, WHO), `${bearing} ${band}`).toEqual({ outcome: "model", attempts: 1, text: reply });
    }
  });

  it("does not let a tease say which way, or a reveal be one sentence", async () => {
    const tease = jobFor("tease");
    expect((await narrateTurn(setup([ok("Something waits to your left."), ok("It is behind you.")]).deps, tease, WHO)).outcome).toBe("invalid");
    expect((await narrateTurn(setup([ok("Something waits close, and I will not say more.")]).deps, tease, WHO)).outcome).toBe("model");
    const reveal = jobFor("reveal");
    expect((await narrateTurn(setup([ok("I remember a kettle."), ok("A kettle.")]).deps, reveal, WHO)).outcome).toBe("invalid");
    const memory = "I remember the kettle on the back burner. It sang just before the water boiled.";
    expect(await narrateTurn(setup([ok(memory)]).deps, reveal, WHO)).toEqual({ outcome: "model", attempts: 1, text: memory });
  });

  it("words the last memory as a reveal too (the farewell stays scripted, which the route adds)", async () => {
    const job = jobFor("ending");
    expect(job.input.directive.kind).toBe("reveal");
    expect(job.farewell).not.toBeNull();
    const memory = "I remember a promise made here. Someone said they would leave the lamp lit.";
    expect(await narrateTurn(setup([ok(memory)]).deps, job, WHO)).toEqual({ outcome: "model", attempts: 1, text: memory });
  });

  it("makes no call when the model is off: the kill switch, no narrator, or a prompt that cannot be built", async () => {
    for (const over of [{ enabled: false }, { narrator: null }] as const) {
      const { deps, guard } = setup([ok(GOOD)], over);
      expect(await narrateTurn(deps, jobFor("ambient"), WHO)).toEqual({ outcome: "off", attempts: 0, text: null });
      expect(guard.reserveCalls).toEqual([]);
    }
    const job = jobFor("reveal");
    const broken: NarrationJob = { ...job, input: { ...job.input, seed: undefined as never } };
    const { deps, n } = setup([ok(GOOD)]);
    expect(await narrateTurn(deps, broken, WHO)).toEqual({ outcome: "off", attempts: 0, text: null });
    expect(n.seen).toHaveLength(0);
  });

  it("makes no call when there is no unit to spend (the visitor's cap, the day's cap), and does not retry", async () => {
    const session = setup([ok(GOOD)], { cap: 0 });
    expect(await narrateTurn(session.deps, jobFor("ambient"), WHO)).toEqual({ outcome: "capped", attempts: 0, text: null });
    expect(session.n.seen).toHaveLength(0);
    expect(session.guard.reserveCalls, "one ask, no second").toEqual(["llm:visitor-1"]);
    // the cap is reached between the two attempts
    const between = setup([ok("**bad**"), ok(GOOD)], { cap: 1 });
    expect(await narrateTurn(between.deps, jobFor("ambient"), WHO)).toEqual({ outcome: "capped", attempts: 1, text: null });
    expect(between.n.seen).toHaveLength(1);
    // a spend guard that cannot be reached is a failure, never a crash
    const broken = setup([ok(GOOD)]);
    broken.deps.spend = { ...broken.guard, reserve: async () => { throw new Error("down"); }, commit: async () => undefined, release: async () => undefined, remaining: broken.guard.remaining.bind(broken.guard) };
    expect(await narrateTurn(broken.deps, jobFor("ambient"), WHO)).toEqual({ outcome: "failed", attempts: 0, text: null });
  });

  it("does not retry when the turn's deadline is near, and shortens the second call to the time left", async () => {
    const clock = { t: 1_000 };
    const slow = setup([bad("failed"), ok(GOOD)], { clock, onCall: () => { clock.t += TURN_DEADLINE_MS - MIN_RETRY_MS + 1; } });
    expect(await narrateTurn(slow.deps, jobFor("ambient"), WHO)).toEqual({ outcome: "failed", attempts: 1, text: null });
    expect(slow.n.seen).toHaveLength(1);
    // a retry that fits is made, with only the time that is left
    const clock2 = { t: 1_000 };
    const fits = setup([ok("**bad**"), ok(GOOD)], { clock: clock2, onCall: () => { clock2.t += 5_000; } });
    expect(await narrateTurn(fits.deps, jobFor("ambient"), WHO)).toEqual({ outcome: "model", attempts: 2, text: GOOD });
    expect(fits.n.seen.map((r) => r.timeoutMs)).toEqual([CALL_TIMEOUT_MS, TURN_DEADLINE_MS - 5_000]);
    expect(MIN_RETRY_MS).toBe(1_500);
    expect([TURN_DEADLINE_MS, CALL_TIMEOUT_MS]).toEqual([9_000, 6_000]);
  });

  it("treats a narrator that throws as a failed call, gives the unit back and goes on", async () => {
    const { deps, guard } = setup([new Error("boom"), ok(GOOD)]);
    expect(await narrateTurn(deps, jobFor("ambient"), WHO)).toEqual({ outcome: "model", attempts: 2, text: GOOD });
    expect(guard.usedOn("llm", "visitor-1")).toBe(1);
  });

  it("never puts the visitor's words anywhere but the prompt: the outcome holds only the model's words, counts and a word for the outcome", async () => {
    const { deps } = setup([ok(GOOD)]);
    const r = await narrateTurn(deps, jobFor("ambient", "UNIQUE-VISITOR-WORDS please"), WHO);
    expect(JSON.stringify(r)).not.toContain("UNIQUE-VISITOR-WORDS");
  });
});

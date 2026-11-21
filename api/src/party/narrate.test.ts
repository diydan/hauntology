import { describe, expect, it } from "vitest";
import { DIRECTIVE_KINDS, PARTY_LINES } from "@hauntology/shared/party/narrate";
import type { PublicView } from "@hauntology/shared/party/views";
import { mulberry32 } from "@hauntology/shared/puzzles/rng";
import type { Meter, Remaining, ReserveResult, SpendGuard, SpendTicket } from "@hauntology/shared/world/spend";
import type { NarrationAnswer, NarrationRequest, Narrator } from "../guarded/workersai/narrator";
import { MemoryRoomSpendStore, RoomBudget } from "./budget";
import { narratePartyEvent, type PartyNarrationDeps } from "./narrate";

class FakeGuard implements SpendGuard {
  used = 0; released = 0; committed = 0; n = 1;
  async reserve(req: { meter: Meter; sessionId: string; now: number }): Promise<ReserveResult> { this.used++; return { ok: true, ticket: { id: `t${this.n++}`, meter: req.meter, sessionId: req.sessionId, issuedAt: req.now } }; }
  async commit(): Promise<void> { this.committed++; }
  async release(_t: SpendTicket): Promise<void> { this.released++; }
  async remaining(): Promise<Remaining> { return { world: 0, image: 0, llm: 0, tts: 0, stt: 0, live: 0 }; }
}
class FakeNarrator implements Narrator {
  calls: NarrationRequest[] = [];
  constructor(private readonly answer: NarrationAnswer | (() => Promise<NarrationAnswer>) | (() => never)) {}
  async narrate(req: NarrationRequest): Promise<NarrationAnswer> { this.calls.push(req); return typeof this.answer === "function" ? (this.answer as () => Promise<NarrationAnswer>)() : this.answer; }
}
const ok = (text: string, stopReason: string | null = "end_turn"): NarrationAnswer => ({ ok: true, text, stopReason, usage: { inputTokens: 1, outputTokens: 1 }, thinkingBlocks: 0, shape: [] });
const view: PublicView = { phase: "playing", suspects: [], zones: [{ id: "z1", name: "Larder" }], relics: [], players: [{ seat: 1, nickname: "Sam", bot: false, poltergeist: false, handSize: 3 }], events: [{ id: 1, kind: "inspect", seat: 1, zone: "z1" }], ending: null };
const setup = (narrator: Narrator | null, over: Partial<PartyNarrationDeps> = {}, caps = { images: 0, models: 60 }) => {
  const guard = new FakeGuard(); const store = new MemoryRoomSpendStore();
  const deps: PartyNarrationDeps = { narrator, budget: new RoomBudget(guard, "room:ABCD", caps, store), enabled: true, scope: "room:ABCD", ...over };
  return { deps, guard, store };
};
const scripted = (kind: (typeof DIRECTIVE_KINDS)[number], speaker: "keeper" | "whisper" | "lodger") => PARTY_LINES[kind]?.[speaker] ?? [];

describe("narratePartyEvent (party-mode 6.1, 10.2)", () => {
  it("uses the model's words when the reply passes validation, with one call, the Room charged once and the ticket committed", async () => {
    const n = new FakeNarrator(ok("Somebody has searched the larder, and the larder noticed."));
    const { deps, guard, store } = setup(n);
    const r = await narratePartyEvent(deps, view, { id: 1, kind: "inspect" }, mulberry32(1));
    expect(r).toMatchObject({ mode: "model", reason: "model", speaker: "keeper", calls: 1, text: "Somebody has searched the larder, and the larder noticed." });
    expect(n.calls).toHaveLength(1);
    expect(n.calls[0]).toMatchObject({ maxTokens: 120, thinking: "off" });
    expect(store.spend.models).toBe(1);
    expect([guard.committed, guard.released]).toEqual([1, 0]);
  });
  it("never calls a model for a scripted-only kind, for an event that already had its call, or with the narrator off or killed", async () => {
    const n = new FakeNarrator(ok("A fine line, quietly said."));
    const { deps } = setup(n);
    for (const kind of ["cue", "nudge", "phone-cue"] as const) expect(await narratePartyEvent(deps, view, { id: 2, kind }, mulberry32(2))).toMatchObject({ mode: "scripted", reason: "scripted_only", calls: 0 });
    expect(await narratePartyEvent(deps, view, { id: 3, kind: "inspect" }, mulberry32(2), new Set([3]))).toMatchObject({ mode: "scripted", reason: "repeat", calls: 0 });
    expect(await narratePartyEvent({ ...deps, enabled: false }, view, { id: 4, kind: "inspect" }, mulberry32(2))).toMatchObject({ reason: "off", calls: 0 });
    expect(await narratePartyEvent({ ...deps, narrator: null }, view, { id: 5, kind: "inspect" }, mulberry32(2))).toMatchObject({ reason: "off", calls: 0 });
    expect(n.calls).toHaveLength(0);
  });
  it("is scripted for a Lodger kind, since a Lodger line takes no case data", async () => {
    const n = new FakeNarrator(ok("Never used."));
    const { deps } = setup(n);
    const r = await narratePartyEvent(deps, view, { id: 6, kind: "accuse-right" }, mulberry32(4));
    expect(r).toMatchObject({ mode: "scripted", reason: "no_prompt", speaker: "lodger", calls: 0 });
    expect(scripted("accuse-right", "lodger")).toContain(r.text);
    expect(n.calls).toHaveLength(0);
  });
  it("falls back to a scripted line at the Room cap without calling, and at the model kill switch of the guard", async () => {
    const n = new FakeNarrator(ok("Never used."));
    const { deps, guard } = setup(n, {}, { images: 0, models: 0 });
    const r = await narratePartyEvent(deps, view, { id: 7, kind: "inspect" }, mulberry32(5));
    expect(r).toMatchObject({ mode: "scripted", reason: "capped", calls: 0 });
    expect(scripted("inspect", "keeper")).toContain(r.text);
    expect([n.calls.length, guard.used]).toEqual([0, 0]);
  });
  it("falls back, and gives the unit back, when the call throws or fails; keeps the charge for a refusal or unusable answer", async () => {
    const thrown = setup(new FakeNarrator((() => { throw new Error("boom"); }) as never));
    expect(await narratePartyEvent(thrown.deps, view, { id: 8, kind: "inspect" }, mulberry32(6))).toMatchObject({ mode: "scripted", reason: "failed", calls: 1 });
    expect([thrown.guard.released, thrown.store.spend.models]).toEqual([1, 0]);
    const failed = setup(new FakeNarrator({ ok: false, kind: "failed" }));
    expect(await narratePartyEvent(failed.deps, view, { id: 9, kind: "inspect" }, mulberry32(6))).toMatchObject({ reason: "failed" });
    expect([failed.guard.released, failed.store.spend.models]).toEqual([1, 0]);
    const refused = setup(new FakeNarrator({ ok: false, kind: "refused" }));
    expect(await narratePartyEvent(refused.deps, view, { id: 10, kind: "inspect" }, mulberry32(6))).toMatchObject({ reason: "refused" });
    expect([refused.guard.committed, refused.store.spend.models]).toEqual([1, 1]);
    const unusable = setup(new FakeNarrator({ ok: false, kind: "unusable" }));
    expect(await narratePartyEvent(unusable.deps, view, { id: 11, kind: "inspect" }, mulberry32(6))).toMatchObject({ reason: "invalid" });
  });
  it("refuses a reply that fails validation (digits, markup, a link, too long, cut short by the token cap) and uses a scripted line instead, after exactly one call", async () => {
    const bad = ["You have 3 minutes.", "<b>Boo</b> said the larder.", "See http://x.example for more.", "", "word ".repeat(80), "I am an AI and I cannot help."];
    for (const text of bad) {
      const n = new FakeNarrator(ok(text));
      const { deps } = setup(n);
      const r = await narratePartyEvent(deps, view, { id: 12, kind: "inspect" }, mulberry32(7));
      expect(r.mode, text).toBe("scripted");
      expect(n.calls, text).toHaveLength(1);
    }
    const cut = new FakeNarrator(ok("A thought that was cut sho", "max_tokens"));
    expect(await narratePartyEvent(setup(cut).deps, view, { id: 13, kind: "inspect" }, mulberry32(7))).toMatchObject({ mode: "scripted", reason: "invalid" });
  });
  it("refuses a reply that reads the rules back, even when it passes every other check", async () => {
    const echo = "Speak only about what the recent events below say happened, and nothing else tonight.";
    const n = new FakeNarrator(ok(echo));
    const r = await narratePartyEvent(setup(n).deps, view, { id: 15, kind: "inspect" }, mulberry32(7));
    expect([r.mode, n.calls.length]).toEqual(["scripted", 1]);
  });
  it("trims a long reply back to whole sentences within the word cap rather than refusing it", async () => {
    const long = "The larder is quiet tonight. " + "Something moves behind the shelves and then does not. ".repeat(6);
    const r = await narratePartyEvent(setup(new FakeNarrator(ok(long))).deps, view, { id: 14, kind: "inspect" }, mulberry32(7));
    expect(r.mode).toBe("model");
    expect(r.text.split(/\s+/).length).toBeLessThanOrEqual(40);
    expect(r.text.endsWith(".")).toBe(true);
  });
  it("sends only the Public View's words: no planted secret reaches the model, whatever kind of event", async () => {
    const secret = "SECRET-HAND-CARD";
    const planted = { ...view, hand: [secret], residue: [secret], solution: secret } as unknown as PublicView;
    const n = new FakeNarrator(ok("A quiet line, nothing more."));
    const { deps } = setup(n);
    let id = 100;
    for (const kind of DIRECTIVE_KINDS) await narratePartyEvent(deps, planted, { id: id++, kind }, mulberry32(8));
    expect(n.calls.length).toBeGreaterThan(5);
    for (const c of n.calls) expect(`${c.system}\n${c.user}`).not.toContain(secret);
  });
  it("never asks for more than one call per event id when the caller passes the narrated set along, across a long log", async () => {
    const n = new FakeNarrator(ok("Something small happened, and was noted."));
    const { deps } = setup(n);
    const narrated = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const id = i % 10;
      const r = await narratePartyEvent(deps, view, { id, kind: "inspect" }, mulberry32(i), narrated);
      if (r.calls > 0) narrated.add(id);
    }
    expect(n.calls).toHaveLength(10);
  });
});

import { describe, expect, it } from "vitest";
import type { PublicView } from "@hauntology/shared/party/views";
import { mulberry32 } from "@hauntology/shared/puzzles/rng";
import type { Meter, Remaining, ReserveResult, SpendGuard, SpendTicket } from "@hauntology/shared/world/spend";
import type { NarrationAnswer, NarrationRequest, Narrator } from "../guarded/workersai/narrator";
import { MemoryRoomSpendStore, RoomBudget } from "./budget";
import { makeNarratePort } from "./narrate-port";

class FakeGuard implements SpendGuard {
  n = 1;
  async reserve(req: { meter: Meter; sessionId: string; now: number }): Promise<ReserveResult> { return { ok: true, ticket: { id: `t${this.n++}`, meter: req.meter, sessionId: req.sessionId, issuedAt: req.now } }; }
  async commit(): Promise<void> {}
  async release(_t: SpendTicket): Promise<void> {}
  async remaining(): Promise<Remaining> { return { world: 0, image: 0, llm: 0, tts: 0, stt: 0, live: 0 }; }
}
class FakeNarrator implements Narrator {
  calls: NarrationRequest[] = [];
  async narrate(req: NarrationRequest): Promise<NarrationAnswer> { this.calls.push(req); return { ok: true, text: "A name was sealed, and the house went quiet.", stopReason: "end_turn", usage: { inputTokens: 1, outputTokens: 1 }, thinkingBlocks: 0, shape: [] }; }
}
const view: PublicView = { phase: "playing", suspects: [], zones: [], relics: [], players: [{ seat: 1, nickname: "Sam", bot: false, poltergeist: false, handSize: 3 }], events: [{ id: 2, kind: "accuse", seat: 1, right: null }], ending: null };
const ev = { id: 2, kind: "seal" as const, code: "ABCD" };

describe("makeNarratePort (party-mode 6.1)", () => {
  it("asks the model once for one event of one Room, charges the Room, and answers the scripted line for a repeat", async () => {
    const narrator = new FakeNarrator(); const store = new MemoryRoomSpendStore();
    const port = makeNarratePort(() => ({ narrator, budget: new RoomBudget(new FakeGuard(), "room-ABCD", { images: 0, models: 60 }, store), enabled: true, scope: "room-ABCD" }));
    const first = await port(view, ev, mulberry32(1));
    expect(first).toEqual({ text: "A name was sealed, and the house went quiet.", speaker: "keeper" });
    const again = await port(view, ev, mulberry32(1));
    expect(again?.text).not.toBe(first?.text);
    expect(narrator.calls).toHaveLength(1);
    expect(store.spend.models).toBe(1);
  });
  it("answers the scripted line when the Room has no budget or the narrator is off, and never calls a model", async () => {
    const narrator = new FakeNarrator();
    const none = await makeNarratePort(() => null)(view, ev, mulberry32(1));
    expect(none?.speaker).toBe("keeper");
    expect((none?.text ?? "").length).toBeGreaterThan(5);
    const off = await makeNarratePort(() => ({ narrator, budget: new RoomBudget(new FakeGuard(), "r", { images: 0, models: 60 }, new MemoryRoomSpendStore()), enabled: false, scope: "r" }))(view, ev, mulberry32(1));
    expect(off?.speaker).toBe("keeper");
    expect(narrator.calls).toHaveLength(0);
  });
  it("keeps each Room's events apart", async () => {
    const narrator = new FakeNarrator();
    const port = makeNarratePort(() => ({ narrator, budget: new RoomBudget(new FakeGuard(), "r", { images: 0, models: 60 }, new MemoryRoomSpendStore()), enabled: true, scope: "r" }));
    await port(view, ev, mulberry32(1));
    await port(view, { ...ev, code: "WXYZ" }, mulberry32(1));
    expect(narrator.calls).toHaveLength(2);
  });
});

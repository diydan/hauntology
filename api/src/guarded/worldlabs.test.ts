import { describe, expect, it } from "vitest";
import { FakeIngestor, FakeWorldLabs } from "../worlds/fakes";
import { sampleManifest } from "../worlds/test-kit";
import { NoTicketError, THROWN, generateWorld, ingestWorld, pollWorld } from "./worldlabs";

const ticket = { id: "t-1", meter: "world" as const, sessionId: "sid-a", issuedAt: 1 };
const req = { image: Uint8Array.from([1]), contentType: "image/png", name: "w-1" };
const ingestJob = { worldId: "w-1", operationId: "op-1", ownerSid: "sid-a", title: "A place", brief: "", source: "upload" as const, createdAt: 1 };

describe("guarded world service calls", () => {
  it("call through with a ticket for the world meter", async () => {
    const up = new FakeWorldLabs();
    expect(await generateWorld(up, ticket, req)).toEqual({ ok: true, operationId: "op-1" });
    expect(await pollWorld(up, ticket, "op-1")).toEqual({ ok: true, state: "done" });
    expect(up.generated).toHaveLength(1);
    expect(up.polled).toEqual(["op-1"]);
    const ing = new FakeIngestor(sampleManifest);
    expect(await ingestWorld(ing, ticket, ingestJob)).toMatchObject({ ok: true });
  });

  it("refuse to call without a proper ticket, and call nothing", async () => {
    const up = new FakeWorldLabs();
    const ing = new FakeIngestor(sampleManifest);
    const bad: unknown[] = [{ ...ticket, meter: "image" }, { ...ticket, meter: "llm" }, { ...ticket, id: "" }, { ...ticket, id: 5 }, null, undefined, "t-1", {}];
    for (const t of bad) {
      expect(() => generateWorld(up, t as never, req)).toThrow(NoTicketError);
      expect(() => pollWorld(up, t as never, "op")).toThrow(NoTicketError);
      expect(() => ingestWorld(ing, t as never, ingestJob)).toThrow(NoTicketError);
    }
    expect(up.generated).toHaveLength(0);
    expect(up.polled).toHaveLength(0);
    expect(ing.calls).toHaveLength(0);
  });

  it("name a thrown port as a transient fault", () => {
    expect(THROWN).toEqual({ ok: false, kind: "transient" });
  });
});

import { API_SCHEMAS } from "@hauntology/shared/app/api-schemas";
import { describe, expect, it } from "vitest";
import { DEFAULT_CAPS, MemorySpendGuard, MemoryImageStore } from "../worlds/fakes";
import { worldsKit } from "../worlds/test-kit";

const NOW = 1_800_000_000_000;
const METERS = ["world", "image", "llm", "tts", "stt", "live"] as const;

const setup = (opts: { guard?: boolean; caps?: ConstructorParameters<typeof MemorySpendGuard>[0] } = {}) => {
  const guard = new MemorySpendGuard(opts.caps ?? DEFAULT_CAPS, () => NOW);
  const kit = worldsKit(() => NOW, { creation: { images: new MemoryImageStore(), ...(opts.guard === false ? {} : { guard }) } });
  return { kit, guard };
};
const reserve = (guard: MemorySpendGuard, sid: string, meter: (typeof METERS)[number]) => guard.reserve({ meter, sessionId: sid, ipHash: "ip-x", now: NOW });

describe("GET /api/quota (world-pipeline 5.7)", () => {
  it("tells a visitor what is left on each of the six meters, in the shape the shell reads", async () => {
    const { kit, guard } = setup();
    const v = await kit.visitor();
    const r = await kit.send("/api/quota", { headers: v.headers });
    expect(r.status).toBe(200);
    expect(Object.keys(r.json as object).sort()).toEqual([...METERS].sort());
    expect(API_SCHEMAS.quota.parse(r.json)).toEqual(r.json);
    expect((r.json as Record<string, number>).world).toBeGreaterThan(0);
    const direct = await guard.remaining(v.sid, "unused");
    for (const m of METERS) expect((r.json as Record<string, number>)[m], m).toBe(direct[m]);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });

  it("counts what this Session has used, and tells nothing about another Session", async () => {
    const { kit, guard } = setup();
    const a = await kit.visitor();
    const b = await kit.visitor();
    const before = (await kit.send("/api/quota", { headers: a.headers })).json as Record<string, number>;
    expect((await reserve(guard, a.sid, "world")).ok).toBe(true);
    expect((await reserve(guard, a.sid, "image")).ok).toBe(true);
    const afterA = (await kit.send("/api/quota", { headers: a.headers })).json as Record<string, number>;
    expect(afterA.world).toBe((before.world as number) - 1);
    expect(afterA.image).toBe((before.image as number) - 1);
    expect(afterA.llm).toBe(before.llm);
    const forB = (await kit.send("/api/quota", { headers: b.headers })).json as Record<string, number>;
    expect(forB).toEqual(before);
    expect(JSON.stringify(afterA)).not.toContain(a.sid);
    expect(JSON.stringify(afterA)).not.toContain(b.sid);
  });

  it("reads none when a cap is used up: the day cap leaves nothing, whatever this Session has", async () => {
    const { kit, guard } = setup({ caps: { ...DEFAULT_CAPS, world: { session: 5, day: 1, total: 30 } } });
    const a = await kit.visitor();
    const b = await kit.visitor();
    expect(((await kit.send("/api/quota", { headers: b.headers })).json as { world: number }).world).toBe(1);
    expect((await reserve(guard, a.sid, "world")).ok).toBe(true);
    expect(((await kit.send("/api/quota", { headers: b.headers })).json as { world: number }).world).toBe(0);
  });

  it("only reads: asking changes nothing and reserves nothing", async () => {
    const { kit, guard } = setup();
    const v = await kit.visitor();
    const first = (await kit.send("/api/quota", { headers: v.headers })).json;
    for (let i = 0; i < 5; i++) expect((await kit.send("/api/quota", { headers: v.headers })).json).toEqual(first);
    expect(guard.reserveCalls).toEqual([]);
  });

  it("makes no Session and writes no cookie, for a visitor with none or with one", async () => {
    const { kit } = setup();
    const fresh = await kit.send("/api/quota");
    expect(fresh.status).toBe(200);
    expect(fresh.headers.get("Set-Cookie")).toBeNull();
    const v = await kit.visitor();
    expect((await kit.send("/api/quota", { headers: v.headers })).headers.get("Set-Cookie")).toBeNull();
    // A visitor with no cookie yet is told what a new Session has, which is what they have: the same numbers as one who has asked before.
    expect(fresh.json).toEqual((await kit.send("/api/quota", { headers: v.headers })).json);
  });

  it("reads none on every meter when there is no guard", async () => {
    const { kit } = setup({ guard: false });
    const r = await kit.send("/api/quota");
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ world: 0, image: 0, llm: 0, tts: 0, stt: 0, live: 0 });
  });

  it("is a read: a POST is not a route, and a write from another origin is refused as everywhere in /api", async () => {
    const { kit } = setup();
    expect((await kit.send("/api/quota", { method: "POST", headers: { Origin: "http://app.test" }, body: {} })).status).toBe(404);
    expect((await kit.send("/api/quota", { method: "POST", headers: { Origin: "http://evil.test" }, body: {} })).status).toBe(403);
  });
});

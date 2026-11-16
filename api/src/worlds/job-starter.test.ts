import { describe, expect, it } from "vitest";
import { WorldJobStarter } from "./job-starter";

const job = { worldId: "w-1", imageId: "img-1", ownerSid: "sid-a", ticket: { id: "t-1", meter: "world" as const, sessionId: "sid-a", issuedAt: 5 } };
const answering = (status: number) => {
  const seen: { name: string; url: string; body: unknown }[] = [];
  const ns = { idFromName: (n: string) => n, get: (id: unknown) => ({ fetch: async (url: string, init?: RequestInit) => { seen.push({ name: String(id), url, body: JSON.parse(String(init?.body)) }); return new Response(null, { status }); } }) };
  return { starter: new WorldJobStarter(ns), seen };
};

describe("WorldJobStarter", () => {
  it("asks the world's own WorldJob to start, with the ticket, the picture and the owner", async () => {
    const { starter, seen } = answering(202);
    expect(await starter.start(job)).toEqual({ ok: true });
    expect(seen).toEqual([{ name: "w-1", url: "https://world-job/start", body: { ticket: job.ticket, imageId: "img-1", ownerSid: "sid-a" } }]);
  });

  it("says ok to a repeat start", async () => {
    expect(await answering(200).starter.start(job)).toEqual({ ok: true });
  });

  it("says world_gen_disabled when the job cannot run, and upstream_rejected for any other answer or a fault", async () => {
    expect(await answering(503).starter.start(job)).toEqual({ ok: false, code: "world_gen_disabled" });
    for (const status of [400, 404, 500]) expect(await answering(status).starter.start(job)).toEqual({ ok: false, code: "upstream_rejected" });
    const down = new WorldJobStarter({ idFromName: (n) => n, get: () => ({ fetch: async () => { throw new Error("down"); } }) });
    expect(await down.start(job)).toEqual({ ok: false, code: "upstream_rejected" });
  });
});

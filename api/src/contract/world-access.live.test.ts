import { describe, expect, it } from "vitest";
import { LIVE_URL, liveKit, type LiveVisitor } from "./live-kit";
import { checkWorldAccess, checkWorldSharing, type WorldAccessHarness } from "./world-access";

/**
 * Shell task 3.3 against a running `wrangler dev` (real local R2 and a real Durable Object). Skipped unless
 * `LIVE_URL` is set. The play checks are left out until `POST /api/play/start` exists (ghost-engine 5).
 */
describe.skipIf(LIVE_URL === undefined)("world access contract: wrangler dev with real R2 and WorldJob", () => {
  it("serves an own world only to its Session, and answers a foreign id like a missing one", async () => {
    const kit = liveKit(LIVE_URL as string);
    const gallery = kit.unique("gallery");
    expect((await kit.dev("seed-gallery", { id: gallery })).status).toBe(200);
    const visitors = new Map<string, LiveVisitor>();
    const harness: WorldAccessHarness = {
      request: async (path, init) => {
        const r = await kit.send(path, { method: init.method, headers: init.headers, ...(init.body !== undefined ? { body: init.body } : {}) });
        return { status: r.status, body: r.json };
      },
      newVisitor: async () => {
        const v = await kit.visitor();
        visitors.set(v.headers.Cookie as string, v);
        return v.headers;
      },
      anonymous: () => kit.anonymous(),
      seedOwnWorld: async (headers) => {
        const owner = visitors.get(headers.Cookie as string) as LiveVisitor;
        const id = kit.unique("w-own");
        expect((await kit.dev("seed-world", { id, ownerSid: owner.sid })).status).toBe(200);
        return id;
      },
      galleryWorldId: gallery,
      missingWorldId: kit.unique("w-missing"),
      assetPath: (id) => `/api/worlds/${id}/assets/world.json`,
    };
    expect(await checkWorldAccess(harness, ["play"])).toEqual([]);
    expect(await checkWorldSharing(harness)).toEqual([]);
  });
});

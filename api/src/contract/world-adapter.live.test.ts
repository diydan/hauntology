import { describe, expect, it } from "vitest";
import { LIVE_URL, liveKit } from "./live-kit";

/**
 * The real job, the real adapter (`HttpWorldLabs`) and the real ingest on a running `wrangler dev` (real local R2 and
 * Durable Objects, the real runtime's `fetch`), against a local stand-in of the World API that costs nothing. Skipped
 * unless both `LIVE_URL` and `FAKE_WORLD_API` are set:
 *
 *   node dev/fake-world-api.mjs 8788 &
 *   pnpm exec wrangler dev -c wrangler.check.jsonc --port 8789 --var WLT_API_KEY:test-live-key --var WORLD_API_BASE:http://127.0.0.1:8788
 *   LIVE_URL=http://127.0.0.1:8789 FAKE_WORLD_API=http://127.0.0.1:8788 pnpm exec vitest run src/contract/world-adapter.live.test.ts
 *
 * Run it on its own: the other live tests expect the Worker's own stand-in service.
 */
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const FAKE = env.FAKE_WORLD_API;

type Expect = Record<string, { bytes: number; sha256: string }>;
type Logged = { method: string; path: string; key: "right" | "wrong" | "none"; auth: boolean };

const sha256 = async (bytes: ArrayBuffer): Promise<string> => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");

describe.skipIf(LIVE_URL === undefined || FAKE === undefined)("the real adapter on wrangler dev against a local stand-in of the World API", () => {
  const kit = liveKit(LIVE_URL ?? "http://live.unset");
  const fake = async <T>(path: string): Promise<T> => (await (await fetch(`${FAKE}${path}`)).json()) as T;
  const pic = async (owner: { sid: string }, salt: number) => {
    const imageId = kit.unique("img");
    expect((await kit.dev("seed-image", { imageId, ownerSid: owner.sid, salt })).status).toBe(200);
    return imageId;
  };
  const waitFor = async (owner: { headers: Record<string, string> }, worldId: string, done: (s: { status: string }) => boolean) => {
    let last: { status: string } = { status: "?" };
    for (let i = 0; i < 100; i++) {
      last = (await kit.send(`/api/worlds/${worldId}`, { headers: owner.headers })).json as { status: string };
      if (done(last)) return last;
      await new Promise((r) => setTimeout(r, 300));
    }
    return last;
  };
  const enter = async (owner: { headers: Record<string, string> }, imageId: string) => {
    const q = await kit.send("/api/worlds/quote", { method: "POST", headers: owner.headers, body: { imageId } });
    return kit.send("/api/worlds", { method: "POST", headers: owner.headers, body: { imageId, confirmToken: (q.json as { confirmToken: string }).confirmToken } });
  };

  it("makes a world: the picture goes out, the files come back by every route a file can come, and R2 holds exactly what was served", async () => {
    const before = (await fake<Logged[]>("/__log")).length;
    const a = await kit.visitor();
    const created = await enter(a, await pic(a, 11));
    expect(created.status).toBe(201);
    const worldId = (created.json as { worldId: string }).worldId;

    const ready = (await waitFor(a, worldId, (s) => s.status === "ready" || s.status === "failed")) as {
      status: string;
      failure?: unknown;
      manifest?: { assets: Record<string, any>; orientation: { upFix: number[]; scale: number }; floorY: number; spawn: { position: number[] } };
    };
    expect(ready.failure).toBeUndefined();
    expect(ready.status).toBe("ready");
    const m = ready.manifest!;
    const want = await fake<Expect>("/__expect");

    // Every file the service has, under a name made here, at the size the stand-in served (the compressed one at its real size).
    expect(m.assets.splat.map((s: { path: string; bytes: number; lod: string }) => [s.path, s.lod, s.bytes])).toEqual([
      ["splat-500k.spz", "500k", want["500k.spz"]!.bytes], ["splat-100k.spz", "100k", want["100k.spz"]!.bytes], ["splat-full.spz", "full", want["full_res.spz"]!.bytes],
    ]);
    expect(m.assets.collider).toMatchObject({ path: "collider.glb", bytes: want["collider.glb"]!.bytes });
    expect(m.assets.pano).toMatchObject({ path: "pano.png", bytes: want["pano.png"]!.bytes });
    expect(m.assets.thumb).toMatchObject({ path: "thumb.jpg", bytes: want["thumb.jpg"]!.bytes });
    // The pose from the service's scale and ground metadata (the documentation's numbers): a half turn about x, scale 1.23, floor -0.42.
    expect(m.orientation).toEqual({ upFix: [1, 0, 0, 0], scale: 1.23 });
    expect(m.floorY).toBeCloseTo(-0.42, 10);
    expect(m.spawn.position[1]).toBeCloseTo(1.6 - 0.42, 10);

    // What the Worker serves is, byte for byte, what the service served.
    const byName: Record<string, string> = { "splat-500k.spz": "500k.spz", "splat-100k.spz": "100k.spz", "splat-full.spz": "full_res.spz", "collider.glb": "collider.glb", "pano.png": "pano.png", "thumb.jpg": "thumb.jpg" };
    for (const [name, source] of Object.entries(byName)) {
      const res = await fetch(`${LIVE_URL}/api/worlds/${worldId}/assets/${name}`, { headers: a.headers });
      expect(res.status, name).toBe(200);
      const body = await res.arrayBuffer();
      expect(body.byteLength, name).toBe(want[source]!.bytes);
      expect(await sha256(body), name).toBe(want[source]!.sha256);
    }

    // The service saw the key on the API calls only, and nothing of the service reached the browser.
    const log = (await fake<Logged[]>("/__log")).slice(before);
    const api = log.filter((l) => l.path.startsWith("/marble/"));
    const files = log.filter((l) => l.path.startsWith("/files/"));
    expect(api.filter((l) => l.method === "POST")).toHaveLength(1);
    expect(api.filter((l) => l.method === "GET").length).toBeGreaterThanOrEqual(3); // two pending polls, the done poll, and the read for ingest
    expect(api.every((l) => l.key === "right" && !l.auth)).toBe(true);
    expect(files).toHaveLength(6);
    expect(files.every((l) => l.key === "none" && !l.auth)).toBe(true);
    expect(JSON.stringify(ready)).not.toMatch(/127\.0\.0\.1|test-live-key|files\//);
  }, 60_000);

  it("fails the world, returns the unit and offers no retry when the service refuses the request", async () => {
    const a = await kit.visitor();
    const created = await enter(a, await pic(a, 201));
    const worldId = (created.json as { worldId: string }).worldId;
    const failed = (await waitFor(a, worldId, (s) => s.status === "failed")) as { failure?: unknown };
    expect(failed.failure).toEqual({ code: "upstream_rejected", quotaReturned: true, retryAllowed: false });
  }, 60_000);

  it("fails the world as out of credits and closes worlds for everyone when the service answers 402, until the switch is opened again", async () => {
    const a = await kit.visitor();
    try {
      const created = await enter(a, await pic(a, 202));
      const worldId = (created.json as { worldId: string }).worldId;
      const failed = (await waitFor(a, worldId, (s) => s.status === "failed")) as { failure?: { code: string; retryAllowed: boolean } };
      expect(failed.failure).toMatchObject({ code: "upstream_no_credits", retryAllowed: false });
      const home = (await kit.send("/api/session")).json as { flags: { worldGenEnabled: boolean } };
      expect(home.flags.worldGenEnabled).toBe(false);
    } finally {
      await kit.dev("kill", { on: false });
    }
  }, 60_000);
});

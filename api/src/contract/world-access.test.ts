import { describe, expect, it } from "vitest";
import type { Context } from "hono";
import { createApp } from "../app";
import type { AppEnv } from "../http/env";
import { forgetWorld, setLastPlay, setLastWorld } from "../http/session";
import { checkWorldAccess, checkWorldSharing, worldAccessContract, type WorldAccessHarness } from "./world-access";

/**
 * A reference app that follows the contract (`none`), and apps that each break one rule. They are
 * test-only. They prove the contract suite can disagree; the real routes use the same suite later.
 */
type Leak =
  | "none" | "foreign-403" | "foreign-readable" | "delete-any" | "play-any" | "echo-id"
  | "anonymous-readable" | "asset-any" | "gallery-deletable" | "owner-locked-out"
  | "share-default-on" | "share-by-stranger" | "shared-reader-delete" | "reader-unshare" | "unshare-ignored" | "shared-survives-delete" | "share-gallery"
  | "reader-play-denied" | "play-survives-unshare" | "play-before-share";

const ORIGIN = "http://app.test";
const ENV = { HMAC_SECRET: "test-secret-0123456789abcdef-test" };
const GALLERY = "greenhouse";
const MISSING = "w-does-not-exist-123456";

function referenceHarness(leak: Leak): WorldAccessHarness {
  const app = createApp();
  const owners = new Map<string, string>(); // world id -> owner's session id
  const shared = new Set<string>(); // ids whose owner turned the share link on
  const everShared = new Set<string>(); // ids that were ever shared (a leaky app keeps playing in them)
  let seed = 0;

  const sid = (c: Context<AppEnv>) => c.get("session").sid;
  const fresh = (c: Context<AppEnv>) => c.get("sessionFresh");
  const notFound = (c: Context<AppEnv>, id: string, leakId = false) =>
    c.json(leakId ? { ok: false, code: "world_not_found", id } : { ok: false, code: "world_not_found" }, 404);

  /**
   * May this request see the world? Gallery worlds are public; own worlds belong to the Session; a shared world is also seen by a reader.
   * `write` asks for what only the owner may do (delete, share), for which a reader is a foreigner.
   */
  const visible = (c: Context<AppEnv>, id: string, write = false): "yes" | "foreign" | "missing" => {
    if (id === GALLERY) return "yes";
    const owner = owners.get(id);
    const open = shared.has(id) && (owner !== undefined || leak === "shared-survives-delete");
    if (owner === undefined && !open) return "missing";
    if (leak === "owner-locked-out") return "foreign";
    if (owner === sid(c)) return "yes";
    if (!write && open) return "yes";
    if (leak === "foreign-readable") return "yes";
    if (leak === "anonymous-readable" && fresh(c)) return "yes";
    return "foreign";
  };

  app.post("/api/test/seed", (c) => {
    const id = `w-own-${String(++seed).padStart(8, "0")}-abcdef`;
    owners.set(id, sid(c));
    if (leak === "share-default-on") shared.add(id);
    setLastWorld(c, id);
    return c.json({ id });
  });

  app.get("/api/worlds/:id", (c) => {
    const id = c.req.param("id");
    const v = visible(c, id);
    if (v === "yes") return c.json({ id, status: "ready" });
    if (v === "foreign" && leak === "foreign-403") return c.json({ ok: false, code: "world_not_found" }, 403);
    return notFound(c, id, leak === "echo-id");
  });

  app.get("/api/worlds/:id/assets/world.json", (c) => {
    const id = c.req.param("id");
    const v = visible(c, id);
    if (v === "yes" || (leak === "asset-any" && v === "foreign")) return c.json({ asset: true });
    return notFound(c, id);
  });

  app.delete("/api/worlds/:id", (c) => {
    const id = c.req.param("id");
    if (id === GALLERY) return leak === "gallery-deletable" ? c.body(null, 204) : notFound(c, id);
    const v = visible(c, id, leak !== "shared-reader-delete");
    if (v === "yes" || (leak === "delete-any" && v === "foreign")) {
      owners.delete(id);
      if (leak !== "shared-survives-delete") shared.delete(id);
      forgetWorld(c, id);
      return c.body(null, 204);
    }
    return notFound(c, id);
  });

  app.post("/api/worlds/:id/share", (c) => {
    const id = c.req.param("id");
    if (id === GALLERY) return leak === "share-gallery" ? c.json({ ok: true, shared: true }) : notFound(c, id);
    const v = visible(c, id, true);
    if (v === "yes" || (leak === "share-by-stranger" && v === "foreign")) {
      shared.add(id);
      everShared.add(id);
      return c.json({ ok: true, shared: true });
    }
    return notFound(c, id);
  });

  app.delete("/api/worlds/:id/share", (c) => {
    const id = c.req.param("id");
    if (id === GALLERY) return leak === "share-gallery" ? c.json({ ok: true, shared: false }) : notFound(c, id);
    const v = visible(c, id, leak !== "reader-unshare");
    if (v === "yes" || (leak === "share-by-stranger" && v === "foreign")) {
      if (leak !== "unshare-ignored") shared.delete(id);
      return c.json({ ok: true, shared: false });
    }
    return notFound(c, id);
  });

  app.post("/api/play/start", async (c) => {
    const { worldId } = (await c.req.json()) as { worldId: string };
    // A reader of a shared world may play it, like the real route: only the owner may change or delete, not play.
    const v = leak === "reader-play-denied" ? visible(c, worldId, true) : visible(c, worldId);
    const keepsPlaying = leak === "play-survives-unshare" && everShared.has(worldId);
    const unlocked = leak === "play-before-share" && v === "foreign";
    if (v === "yes" || (leak === "play-any" && v === "foreign") || keepsPlaying || unlocked) {
      setLastPlay(c, "p-1");
      return c.json({ playId: "p-1" });
    }
    return notFound(c, worldId);
  });

  const send = async (path: string, init: { method: string; headers: Record<string, string>; body?: unknown }) => {
    const headers = { ...init.headers, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) };
    const res = await app.request(`${ORIGIN}${path}`, { method: init.method, headers, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) }, ENV);
    const text = await res.text();
    let body: unknown = null;
    try { body = JSON.parse(text); } catch { /* an empty body */ }
    return { status: res.status, body };
  };

  return {
    request: send,
    newVisitor: async () => {
      const res = await app.request(`${ORIGIN}/api/session`, {}, ENV);
      return { Cookie: (res.headers.get("Set-Cookie") as string).split(";")[0] as string, Origin: ORIGIN };
    },
    anonymous: () => ({ Origin: ORIGIN }),
    seedOwnWorld: async (visitor) => ((await send("/api/test/seed", { method: "POST", headers: visitor })).body as { id: string }).id,
    galleryWorldId: GALLERY,
    missingWorldId: MISSING,
    assetPath: (id) => `/api/worlds/${id}/assets/world.json`,
  };
}

worldAccessContract("reference app that follows the contract", async () => referenceHarness("none"));

describe("the contract can disagree", () => {
  const cases: [Leak, RegExp][] = [
    ["foreign-403", /GET by another visitor: a foreign world answered 403/],
    ["foreign-readable", /GET by another visitor: a foreign world answered 200/],
    ["delete-any", /removed the owner's world/],
    ["play-any", /POST play\/start by another visitor: a foreign world answered 200/],
    ["echo-id", /a foreign world and a missing world answer differently/],
    ["anonymous-readable", /GET with no cookie: a foreign world answered 200/],
    ["asset-any", /GET asset by another visitor: a foreign world answered 200/],
    ["gallery-deletable", /DELETE Gallery world by a visitor succeeded/],
    ["owner-locked-out", /GET own world: the owner got 404/],
  ];

  for (const [leak, expected] of cases) {
    it(`reports a leak: ${leak}`, async () => {
      const violations = await checkWorldAccess(referenceHarness(leak));
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.join("\n")).toMatch(expected);
    });
  }

  it("passes the compliant app with no violations at all", async () => {
    expect(await checkWorldAccess(referenceHarness("none"))).toEqual([]);
  });
});

describe("the share link contract can disagree", () => {
  const cases: [Leak, RegExp][] = [
    ["share-default-on", /GET before the link is on: answered 200/],
    ["share-by-stranger", /POST share by another visitor: answered 200/],
    ["shared-reader-delete", /DELETE of a shared world by a reader: answered 204/],
    ["reader-unshare", /DELETE share by a reader: answered 200/],
    ["unshare-ignored", /GET after the link is off: answered 200/],
    ["shared-survives-delete", /GET of a deleted shared world: answered 200/],
    ["share-gallery", /POST share of a Gallery world: answered 200/],
    ["owner-locked-out", /POST share by the owner: 404/],
    ["reader-play-denied", /POST play\/start in a shared world \(another visitor\): 404/],
    ["play-survives-unshare", /POST play\/start after the link is off: answered 200/],
    ["play-before-share", /POST play\/start before the link is on: answered 200/],
  ];

  for (const [leak, expected] of cases) {
    it(`reports a leak: ${leak}`, async () => {
      const violations = await checkWorldSharing(referenceHarness(leak));
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.join("\n")).toMatch(expected);
    });
  }

  it("passes the compliant app with no violations at all", async () => {
    expect(await checkWorldSharing(referenceHarness("none"))).toEqual([]);
  });
});

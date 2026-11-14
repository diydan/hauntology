import { describe, expect, it } from "vitest";
import type { Context } from "hono";
import { createApp } from "../app";
import type { AppEnv } from "../http/env";
import { forgetWorld, setLastPlay, setLastWorld } from "../http/session";
import { checkWorldAccess, worldAccessContract, type WorldAccessHarness } from "./world-access";

/**
 * A reference app that follows the contract (`none`), and apps that each break one rule. They are
 * test-only. They prove the contract suite can disagree; the real routes use the same suite later.
 */
type Leak =
  | "none" | "foreign-403" | "foreign-readable" | "delete-any" | "play-any" | "echo-id"
  | "anonymous-readable" | "asset-any" | "gallery-deletable" | "owner-locked-out";

const ORIGIN = "http://app.test";
const ENV = { HMAC_SECRET: "test-secret-0123456789abcdef-test" };
const GALLERY = "greenhouse";
const MISSING = "w-does-not-exist-123456";

function referenceHarness(leak: Leak): WorldAccessHarness {
  const app = createApp();
  const owners = new Map<string, string>(); // world id -> owner's session id
  let seed = 0;

  const sid = (c: Context<AppEnv>) => c.get("session").sid;
  const fresh = (c: Context<AppEnv>) => c.get("sessionFresh");
  const notFound = (c: Context<AppEnv>, id: string, leakId = false) =>
    c.json(leakId ? { ok: false, code: "world_not_found", id } : { ok: false, code: "world_not_found" }, 404);

  /** May this request see the world? Gallery worlds are public; own worlds belong to the Session. */
  const visible = (c: Context<AppEnv>, id: string): "yes" | "foreign" | "missing" => {
    if (id === GALLERY) return "yes";
    const owner = owners.get(id);
    if (owner === undefined) return "missing";
    if (leak === "owner-locked-out") return "foreign";
    if (owner === sid(c)) return "yes";
    if (leak === "foreign-readable") return "yes";
    if (leak === "anonymous-readable" && fresh(c)) return "yes";
    return "foreign";
  };

  app.post("/api/test/seed", (c) => {
    const id = `w-own-${String(++seed).padStart(8, "0")}-abcdef`;
    owners.set(id, sid(c));
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
    const v = visible(c, id);
    if (v === "yes" || (leak === "delete-any" && v === "foreign")) {
      owners.delete(id);
      forgetWorld(c, id);
      return c.body(null, 204);
    }
    return notFound(c, id);
  });

  app.post("/api/play/start", async (c) => {
    const { worldId } = (await c.req.json()) as { worldId: string };
    const v = visible(c, worldId);
    if (v === "yes" || (leak === "play-any" && v === "foreign")) {
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

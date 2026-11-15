import { ASSET_NAME, MANIFEST_NAME, WorldManifestSchema, assetNames, type WorldManifest } from "@hauntology/shared/world/manifest";
import { Hono, type Context } from "hono";
import type { AppEnv } from "../http/env";
import { forgetWorld } from "../http/session";
import { accessOf, mayDelete, mayRead } from "../worlds/access";
import { parseRange } from "../worlds/range";
import type { WorldRecord, WorldStore } from "../worlds/store";

export type WorldsDeps = { store: WorldStore };

/** What a world id may look like. Anything else is answered exactly like an id nobody has. */
const WORLD_ID = /^[A-Za-z0-9_-]{1,128}$/;

const TYPES: Record<string, string> = {
  json: "application/json",
  glb: "model/gltf-binary",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const typeOf = (name: string): string => TYPES[name.slice(name.lastIndexOf(".") + 1).toLowerCase()] ?? "application/octet-stream";

/** One answer for a missing world, a foreign world, a bad id and a request with no cookie, so ids cannot be probed. */
const notFound = (c: Context<AppEnv>) => {
  c.header("Cache-Control", "no-store");
  return c.json({ ok: false, code: "world_not_found" }, 404);
};

/** The manifest of a ready world, parsed so that only listed fields leave; `null` when there is none that fits. */
const readyManifest = (w: WorldRecord): WorldManifest | null => {
  if (w.status !== "ready" || w.manifest === undefined) return null;
  const parsed = WorldManifestSchema.safeParse(w.manifest);
  return parsed.success ? parsed.data : null;
};

const assetUrl = (worldId: string, name: string): string => `/api/worlds/${worldId}/assets/${name}`;

/**
 * The status of a world, as the shell reads it (`WorldStatusSchema`) plus the manifest once it is ready.
 * It is built field by field, never by copying the record, so nothing the record holds beyond these
 * fields can reach the browser. A world marked ready whose manifest does not fit is reported as a failed
 * ingest, not as a place that cannot be entered.
 */
function statusOf(w: WorldRecord): Record<string, unknown> {
  const manifest = readyManifest(w);
  if (w.status === "ready" && manifest === null) {
    return { id: w.id, status: "failed", failure: { code: "ingest_failed", quotaReturned: false, retryAllowed: false } };
  }
  const title = w.title ?? manifest?.title;
  return {
    id: w.id,
    status: w.status,
    ...(title !== undefined ? { title } : {}),
    ...(manifest?.assets.thumb ? { thumbUrl: assetUrl(w.id, manifest.assets.thumb.path) } : {}),
    ...(w.status === "failed" && w.failure
      ? { failure: { code: w.failure.code, quotaReturned: w.failure.quotaReturned, retryAllowed: w.failure.retryAllowed } }
      : {}),
    ...(manifest !== null ? { manifest } : {}),
  };
}

/**
 * `GET /api/worlds/:id`, `GET /api/worlds/:id/assets/:name` and `DELETE /api/worlds/:id`
 * (world-pipeline 7.4 and 8.1). A user world is served only to the Session that made it; a Gallery world
 * is public to read and deletable by nobody here. Every refusal is the same `404 world_not_found`.
 * The Session middleware runs first, so a request with no cookie has a new Session id that owns nothing.
 */
export function worldRoutes(deps: WorldsDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const { store } = deps;

  const find = async (id: string): Promise<WorldRecord | null> =>
    WORLD_ID.test(id) ? store.find(id) : null;

  routes.get("/:id", async (c) => {
    const w = await find(c.req.param("id"));
    if (w === null || !mayRead(accessOf(w, c.get("session").sid))) return notFound(c);
    c.header("Cache-Control", "no-store");
    return c.json(statusOf(w));
  });

  routes.get("/:id/assets/:name", async (c) => {
    const id = c.req.param("id");
    const name = c.req.param("name");
    const w = await find(id);
    if (w === null) return notFound(c);
    const access = accessOf(w, c.get("session").sid);
    if (!mayRead(access)) return notFound(c);
    const manifest = readyManifest(w);
    // Only the manifest and the files it names are served; any other name is as good as missing.
    if (manifest === null || !ASSET_NAME.test(name) || (name !== MANIFEST_NAME && !assetNames(manifest).includes(name))) return notFound(c);

    // The manifest is sent from the parsed record, so it can only hold the listed fields.
    if (name === MANIFEST_NAME) {
      c.header("Cache-Control", "no-store");
      return c.json(manifest);
    }

    const stat = await store.stat(w, name);
    if (stat === null) return notFound(c);

    // Asset names never change content within a world and a world id is never reused: cache for good.
    // A user's world is private to its owner, so only the browser may keep it.
    const cache = `${access === "public" ? "public" : "private"}, max-age=31536000, immutable`;
    const base = { "Content-Type": typeOf(name), "Accept-Ranges": "bytes", "Cache-Control": cache };

    const range = parseRange(c.req.header("Range"), stat.size);
    if (range.kind === "unsatisfiable") {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}`, "Cache-Control": "no-store" } });
    }
    const part = range.kind === "ok" ? { start: range.start, end: range.end } : undefined;
    const body = await store.read(w, name, part);
    if (body === null) return notFound(c);
    if (part === undefined) return new Response(body, { status: 200, headers: { ...base, "Content-Length": String(stat.size) } });
    return new Response(body, {
      status: 206,
      headers: { ...base, "Content-Range": `bytes ${part.start}-${part.end}/${stat.size}`, "Content-Length": String(part.end - part.start + 1) },
    });
  });

  routes.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const w = await find(id);
    if (w === null || !mayDelete(accessOf(w, c.get("session").sid))) return notFound(c);
    await store.purge(id);
    forgetWorld(c, id);
    c.header("Cache-Control", "no-store");
    return c.body(null, 204);
  });

  return routes;
}

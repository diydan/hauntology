import { PRESET_PROFILES } from "@hauntology/shared/creator/presets";
import { PortraitsRequestSchema, SpriteRequestSchema } from "@hauntology/shared/creator/requests";
import { Hono, type Context } from "hono";
import type { Creator, CreatorFail } from "../creator/service";
import type { AppEnv } from "../http/env";
import { ipHashOf, readBody } from "./world-create";

/**
 * `GET /api/ghosts/presets` (ghost-creator task 2, Requirements 3.3, 4.2): the Preset Ghosts
 * shipped with the app. Static content: no key, no quota, and no Session cookie is written,
 * so a shared cache may keep it for a minute — the same footing as the Gallery list.
 */
export function ghostRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.get("/presets", (c) => {
    c.set("sessionNoCookie", true);
    c.header("Cache-Control", "public, max-age=60");
    // The shell's list shape (`GhostPreset` in shared/app/api): a name to show and a picture to pick by.
    return c.json(PRESET_PROFILES.map((p) => ({ id: p.id, name: p.persona.name, spriteUrl: p.spriteUrl })));
  });
  return routes;
}

const PortraitsBody = PortraitsRequestSchema;
const SpriteBody = SpriteRequestSchema;
const PresetBody = SpriteBody.pick({ worldId: true }).extend({ presetId: SpriteBody.shape.candidateId });

const STATUS: Record<CreatorFail["code"], number> = {
  trait_invalid: 422,
  detail_unsafe: 422,
  moderation_unavailable: 503,
  quota_image: 429,
  portrait_failed: 502,
  candidate_missing: 404,
  creator_unavailable: 503,
};

/**
 * The Creator's paid steps (ghost-creator task 3): portraits, the sprite, and reading a
 * world's ghost back. Every failure the design names leads to Presets in the client or a
 * field error; the service itself already falls back to a Preset profile where it must.
 */
export function creatorRoutes(creator: Creator): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const fail = (c: Context<AppEnv>, f: CreatorFail) => {
    c.header("Cache-Control", "no-store");
    return c.json({ ok: false, code: f.code, ...(f.fields ? { fields: f.fields } : {}), ...(f.quota !== undefined ? { quota: f.quota } : {}) }, STATUS[f.code] as 404);
  };

  routes.post("/portraits", async (c) => {
    const body = await readBody(c, PortraitsBody);
    if (body === null) return fail(c, { ok: false, code: "trait_invalid", fields: ["traits"] });
    const r = await creator.portraits({ traits: body.traits, worldId: body.worldId }, c.get("session").sid, await ipHashOf(c, c.env.HMAC_SECRET as string));
    if (!r.ok) return fail(c, r);
    c.header("Cache-Control", "no-store");
    return c.json({ candidates: r.candidates, quota: r.quota });
  });

  routes.post("/sprite", async (c) => {
    const body = await readBody(c, SpriteBody);
    if (body === null) return fail(c, { ok: false, code: "candidate_missing" });
    const r = await creator.sprite(body, c.get("session").sid, await ipHashOf(c, c.env.HMAC_SECRET as string));
    if (!r.ok) return fail(c, r);
    c.header("Cache-Control", "no-store");
    return c.json({ profile: r.profile, fallback: r.fallback });
  });

  routes.post("/preset", async (c) => {
    const body = await readBody(c, PresetBody);
    if (body === null) return fail(c, { ok: false, code: "candidate_missing" });
    const r = await creator.assignPreset(body.worldId, body.presetId);
    if (!r.ok) return fail(c, r);
    c.header("Cache-Control", "no-store");
    return c.json({ profile: r.profile, fallback: r.fallback });
  });

  routes.get("/sprite/:worldId", async (c) => {
    const png = await creator.spriteFor(c.req.param("worldId"));
    if (!png || png.byteLength === 0) return c.json({ ok: false, code: "candidate_missing" }, 404);
    c.header("Cache-Control", "private, max-age=300");
    return c.body(png as unknown as ArrayBuffer, 200, { "Content-Type": "image/png" });
  });

  return routes;
}

/** `GET /api/worlds/:id/ghost`: what the shell may show of the world's ghost (a stored profile, or its deterministic Preset). */
export function worldGhostRoutes(creator: Creator): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.get("/:id/ghost", async (c) => {
    c.header("Cache-Control", "no-store");
    const profile = await creator.profileFor(c.req.param("id"));
    return c.json({ name: profile.persona.name, spriteUrl: profile.spriteUrl, voice: profile.persona.voice });
  });
  return routes;
}

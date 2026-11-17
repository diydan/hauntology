import { PRESET_PROFILES } from "@hauntology/shared/creator/presets";
import { Hono } from "hono";
import type { AppEnv } from "../http/env";

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
    return c.json(PRESET_PROFILES);
  });
  return routes;
}

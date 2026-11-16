import { galleryList } from "@hauntology/shared/world/gallery-list";
import { Hono } from "hono";
import type { AppEnv } from "../http/env";
import type { WorldStore } from "../worlds/store";

export type GalleryDeps = { store: WorldStore };

/**
 * `GET /api/gallery` (world-pipeline 9.2, Requirements 9.2 and 9.3): the Gallery Worlds as the shell reads them, an array of
 * `{id, title, description, thumbUrl, attribution}`, sorted by id. It is public and needs no key, no quota and no open world switch, so the
 * Gallery works while worlds are closed or the day is spent. It lists Gallery Worlds only, never a user's, shared or not. A world with no
 * thumbnail or no credit is left out (`galleryItemOf`). The answer holds only the listed fields, and no Session cookie is written for it,
 * so a shared cache may keep it for a minute.
 */
export function galleryRoutes(deps: GalleryDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.get("/", async (c) => {
    const items = galleryList(await deps.store.galleryManifests());
    c.set("sessionNoCookie", true);
    c.header("Cache-Control", "public, max-age=60");
    return c.json(items);
  });
  return routes;
}

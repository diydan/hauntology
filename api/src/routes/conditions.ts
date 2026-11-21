import { conditionsGeocodeCounter } from "@hauntology/shared/conditions/telemetry";
import type { Place } from "@hauntology/shared/conditions/types";
import { Hono, type Context } from "hono";
import { QUERY_MAX } from "../conditions/open-meteo";
import type { AppEnv } from "../http/env";
import { requireSession } from "../http/session";
import { SILENT, type Logger } from "../log";
import { ipHashOf, readBody, refuse } from "./world-create";

export const SEARCH_WINDOW_MS = 60_000;
export const SEARCH_LIMIT_PER_WINDOW = 20;
const MAX_BUCKETS = 2048;

const SearchBodySchema = {
  safeParse(v: unknown): { success: true; data: { q: string } } | { success: false } {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return { success: false };
    const q = (v as Record<string, unknown>)["q"];
    return typeof q === "string" ? { success: true, data: { q } } : { success: false };
  },
};
// eslint-disable-next-line no-control-regex
const cleanSearch = (q: string): string => q.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, QUERY_MAX).trim();

export type ConditionsRouteDeps = Readonly<{
  enabled: (c: Context<AppEnv>) => boolean;
  search: (query: string) => Promise<Place[]>;
  log?: Logger;
  now?: () => number;
}>;

/**
 * `POST /api/conditions/search` `{q}` (conditions 3.4, 3.5, 3.7; Requirements 1.1, 1.3):
 * behind `/api/*` originGuard & session middleware plus `requireSession` cookie check and
 * per-visitor window rate limit. Trims queries to 60 chars, returns at most 5 rounded Places,
 * and logs only closed outcome/count telemetry (`conditions.geocode`). Never logs queries or places.
 */
export function conditionsRoutes(deps: ConditionsRouteDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const log = deps.log ?? SILENT;
  const now = deps.now ?? Date.now;
  const buckets = new Map<string, { startMs: number; n: number }>();

  const allow = (key: string, at: number): boolean => {
    const existing = buckets.get(key);
    if (existing === undefined || at - existing.startMs >= SEARCH_WINDOW_MS) {
      if (buckets.size >= MAX_BUCKETS) buckets.clear();
      buckets.set(key, { startMs: at, n: 1 });
      return true;
    }
    existing.n += 1;
    return existing.n <= SEARCH_LIMIT_PER_WINDOW;
  };

  routes.post("/search", requireSession(), async (c) => {
    c.header("Cache-Control", "no-store");
    if (!deps.enabled(c)) {
      log.info("conditions.geocode", conditionsGeocodeCounter("disabled", 0));
      return refuse(c, "conditions_disabled", 503);
    }
    const sid = c.get("session").sid;
    const ipHash = await ipHashOf(c, c.env.HMAC_SECRET as string);
    if (!allow(`${sid}:${ipHash}`, now())) {
      log.info("conditions.geocode", conditionsGeocodeCounter("rate_limited", 0));
      return refuse(c, "rate_limited", 429);
    }
    const body = await readBody(c, SearchBodySchema);
    const q = body === null ? "" : cleanSearch(body.q);
    if (q.length < 2) {
      log.info("conditions.geocode", conditionsGeocodeCounter("bad_place", 0));
      return refuse(c, "bad_place", 400);
    }
    try {
      const matches = (await deps.search(q)).slice(0, 5);
      log.info("conditions.geocode", conditionsGeocodeCounter("ok", matches.length));
      return c.json(matches);
    } catch {
      log.info("conditions.geocode", conditionsGeocodeCounter("unavailable", 0));
      return refuse(c, "geocode_unavailable", 503);
    }
  });

  return routes;
}

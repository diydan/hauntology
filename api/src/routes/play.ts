import { WorldManifestSchema, type WorldManifest } from "@hauntology/shared/world/manifest";
import { PLAY_ID, PlayStartRequestSchema } from "@hauntology/shared/ghost/requests";
import { startSession, viewOf, type WorldFacts } from "@hauntology/shared/ghost/play";
import { MAX_BODY_BYTES } from "@hauntology/shared/world/requests";
import { toBase64Url } from "@hauntology/shared/session-cookie";
import { Hono, type Context } from "hono";
import type { AppEnv } from "../http/env";
import { setLastPlay, setLastWorld } from "../http/session";
import { SILENT, type Logger } from "../log";
import type { PlayRefusal, PlaySessions } from "../play/ports";
import { accessOf, mayRead } from "../worlds/access";
import type { WorldRecord, WorldStore } from "../worlds/store";
import { readBody } from "./world-create";

export type PlayDeps = { store: WorldStore; sessions: PlaySessions; log?: Logger; now?: () => number };

/** What the engine needs of a ready world, from its manifest as it parses: where the visitor starts, how far the world goes, the Place Brief and any authored anchors. `null` for a world that is not ready or whose manifest does not fit. */
export function factsOf(world: WorldRecord): WorldFacts | null {
  if (world.status !== "ready" || world.manifest === undefined) return null;
  const parsed = WorldManifestSchema.safeParse(world.manifest);
  if (!parsed.success) return null;
  const m: WorldManifest = parsed.data;
  return {
    spawn: [m.spawn.position[0], m.spawn.position[1], m.spawn.position[2]],
    yaw: m.spawn.yaw,
    bounds: { min: [m.bounds.min[0], m.bounds.min[1], m.bounds.min[2]], max: [m.bounds.max[0], m.bounds.max[1], m.bounds.max[2]] },
    floorY: m.floorY,
    brief: m.brief,
    authoredAnchors: m.anchors !== undefined && m.anchors.length === 3 ? m.anchors : undefined,
  };
}

const STATUS = { session_not_found: 404, session_expired: 410, rate_limited: 429, world_not_found: 404 } as const;

/**
 * `POST /api/play/start`, `POST /api/play/:id/turn`, `GET /api/play/:id` and `POST /api/play/:id/reset` (ghost-engine 5, Requirements 1.1, 1.4, 8.1 to 8.3, 9.1).
 *
 * Who may play (the access rule of `worlds/access.ts`, the same one the world routes use): the owner of a world, anyone at a Gallery world and, while the owner
 * has the share link on, anyone who has the link (a reader); nobody else, and a world that is not ready is not playable. Every refusal for a world is the one
 * `404 world_not_found`. The access is checked again on every call, so a world that is unshared or deleted ends the game at once for a reader. A game belongs to the
 * Session that started it: another Session's game is `session_not_found`. The Session remembers the game (`lastPlayId`) and, unless the visitor is only a reader,
 * the world (`lastWorldId`): a reader's world stays out of the Session so that a reload does not turn a link into a place they own.
 * The words are scripted (the model narrator is ghost-engine 4). Nothing here calls a paid service. Logs: counters and codes only.
 */
export function playRoutes(deps: PlayDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const log = deps.log ?? SILENT;
  const now = deps.now ?? Date.now;

  const refuse = (c: Context<AppEnv>, code: keyof typeof STATUS, retryAfterMs?: number) => {
    log.warn("play.refused", { code });
    c.header("Cache-Control", "no-store");
    if (code === "rate_limited") c.header("Retry-After", String(Math.max(1, Math.ceil((retryAfterMs ?? 1500) / 1000))));
    return c.json({ ok: false, code }, STATUS[code]);
  };
  const refusal = (c: Context<AppEnv>, r: PlayRefusal) => refuse(c, r.code, r.retryAfterMs);

  /** The world of a game, if the visitor may still play in it. */
  const playable = async (c: Context<AppEnv>, worldId: string): Promise<{ world: WorldRecord; facts: WorldFacts; access: ReturnType<typeof accessOf> } | null> => {
    const world = await deps.store.find(worldId);
    if (world === null) return null;
    const access = accessOf(world, c.get("session").sid);
    if (!mayRead(access)) return null;
    const facts = factsOf(world);
    return facts === null ? null : { world, facts, access };
  };

  const randomId = (): string => toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0] as number;

  routes.post("/start", async (c) => {
    const sid = c.get("session").sid;
    const body = await readBody(c, PlayStartRequestSchema);
    if (body === null) return refuse(c, "world_not_found");
    const found = await playable(c, body.worldId);
    if (found === null) return refuse(c, "world_not_found");

    let session = startSession({ id: `p-${randomId()}`, worldId: body.worldId, ownerSid: sid, world: found.facts, ghostPreset: body.ghostPreset, clientAnchors: body.anchors, seed: randomSeed(), now: now() });
    if (!(await deps.sessions.start(session))) {
      // An id that is taken (a chance of about one in 2^128): try one more.
      session = { ...session, id: `p-${randomId()}` };
      if (!(await deps.sessions.start(session))) return refuse(c, "session_not_found");
    }
    setLastPlay(c, session.id);
    if (found.access !== "shared") setLastWorld(c, body.worldId);
    log.info("play.start", { worldId: body.worldId, access: found.access });
    c.header("Cache-Control", "no-store");
    return c.json({ playId: session.id, view: viewOf(session) });
  });

  routes.post("/:id/turn", async (c) => {
    const id = c.req.param("id");
    if (!PLAY_ID.test(id)) return refuse(c, "session_not_found");
    const sid = c.get("session").sid;
    const peek = await deps.sessions.get(id, sid);
    if (!peek.ok) return refusal(c, peek);
    const found = await playable(c, peek.worldId);
    if (found === null) return refuse(c, "world_not_found");

    // Any body is a turn: an input that is not a text or a button is an empty `say`, and a pose that is not one keeps the last (the engine is total).
    let json: unknown = {};
    const declared = Number(c.req.header("Content-Length") ?? 0);
    if (!(Number.isFinite(declared) && declared > MAX_BODY_BYTES)) {
      const text = await c.req.text();
      if (text.length <= MAX_BODY_BYTES) {
        try {
          json = JSON.parse(text);
        } catch {
          json = {};
        }
      }
    }
    const o = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
    const r = await deps.sessions.turn(id, sid, { input: o["input"], pose: o["pose"], world: { bounds: found.facts.bounds, brief: found.facts.brief } });
    if (!r.ok) return refusal(c, r);
    log.info("play.turn", { directive: r.directive, revealed: r.revealed, scripted: true });
    if (r.revealed && r.ended) log.info("play.end", { turns: r.turns });
    c.header("Cache-Control", "no-store");
    return c.json({ reply: r.reply, view: r.view });
  });

  routes.get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!PLAY_ID.test(id)) return refuse(c, "session_not_found");
    const peek = await deps.sessions.get(id, c.get("session").sid);
    if (!peek.ok) return refusal(c, peek);
    if ((await playable(c, peek.worldId)) === null) return refuse(c, "world_not_found");
    c.header("Cache-Control", "no-store");
    return c.json({ worldId: peek.worldId, view: peek.view });
  });

  routes.post("/:id/reset", async (c) => {
    const id = c.req.param("id");
    if (!PLAY_ID.test(id)) return refuse(c, "session_not_found");
    const sid = c.get("session").sid;
    const peek = await deps.sessions.get(id, sid);
    if (!peek.ok) return refusal(c, peek);
    const found = await playable(c, peek.worldId);
    if (found === null) return refuse(c, "world_not_found");
    const r = await deps.sessions.reset(id, sid, { world: found.facts, seed: randomSeed() });
    if (!r.ok) return refusal(c, r);
    log.info("play.reset", { turns: peek.turns });
    c.header("Cache-Control", "no-store");
    return c.json({ playId: id, view: r.view });
  });

  return routes;
}

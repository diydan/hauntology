import type { QuotaSnapshot } from "@hauntology/shared/app/types";
import type { ErrorCode } from "@hauntology/shared/errors";
import { confirmIdOf, signConfirm, verifyConfirm } from "@hauntology/shared/world/confirm-token";
import { deriveWorldId, worldKey } from "@hauntology/shared/world/dedup";
import { CreateWorldRequestSchema, MAX_BODY_BYTES, QuoteRequestSchema } from "@hauntology/shared/world/requests";
import type { Remaining, SpendGuard } from "@hauntology/shared/world/spend";
import { toBase64Url } from "@hauntology/shared/session-cookie";
import { Hono, type Context } from "hono";
import type { AppEnv } from "../http/env";
import { setLastWorld } from "../http/session";
import type { ImageInfo, ImageStore, ImageVerdictStore, PlaceBriefer, TurnstileVerifier, WorldStarter } from "../worlds/ports";
import type { WorldStore } from "../worlds/store";

export type CreationDeps = {
  store: WorldStore;
  images: ImageStore;
  /** `SpendGuard` (world-pipeline 4.1). Without it nothing can be reserved, so a world cannot be made and the Quote shows no places left. */
  guard?: SpendGuard;
  /** Starts the job (7.1). Without it a world cannot be made. */
  starter?: WorldStarter;
  /** Checks a Turnstile token. Needed when `TURNSTILE_SECRET` is set; without it that check fails closed. */
  turnstile?: TurnstileVerifier;
  /** The Place Brief check (5.4). Without it, or without `verdicts`, a picture cannot be checked and the route answers `moderation_unavailable`. */
  briefer?: PlaceBriefer;
  /** Where the result of that check is written (5.4). */
  verdicts?: ImageVerdictStore;
  /** Whether new worlds are allowed at all (`WORLD_GEN_ENABLED` and the kill switch). */
  worldGenEnabled: (c: Context<AppEnv>) => Promise<boolean> | boolean;
  /** Epoch milliseconds. Default `Date.now`. */
  now?: () => number;
};

const STATUS: Partial<Record<ErrorCode, 400 | 403 | 404 | 422 | 429 | 502 | 503>> = {
  upload_rejected: 404,
  unsafe_image: 422,
  moderation_unavailable: 503,
  bad_confirm: 400,
  confirm_expired: 400,
  turnstile_failed: 403,
  world_gen_disabled: 503,
  quota_session: 429,
  quota_day: 429,
  quota_total: 429,
  upstream_rejected: 502,
};

/** How many times one picture may be tried again after a failed world, so a loop over attempts is bounded. */
const MAX_ATTEMPTS = 8;
const NO_PLACES: QuotaSnapshot = { world: 0, image: 0, llm: 0, tts: 0, stt: 0, live: 0 };

export function refuse(c: Context<AppEnv>, code: ErrorCode, status?: number) {
  c.header("Cache-Control", "no-store");
  return c.json({ ok: false, code }, (status ?? STATUS[code] ?? 400) as 400);
}

/** The JSON body, read with a cap and parsed by `schema`, or `null` for anything else. */
/** What a zod schema offers that this needs, so this package does not have to depend on zod. */
type Parser<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };

export async function readBody<T>(c: Context<AppEnv>, schema: Parser<T>): Promise<T | null> {
  const declared = Number(c.req.header("Content-Length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const text = await c.req.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** A hash of the visitor's address, never the address itself (security-and-cost: rate limit by hashed IP). */
export async function ipHashOf(c: Context<AppEnv>, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`hauntology/ip/v1\n${c.req.header("CF-Connecting-IP") ?? "unknown"}`));
  return toBase64Url(new Uint8Array(mac).slice(0, 16));
}

const moderationRefusal = (image: ImageInfo): ErrorCode | null =>
  image.moderation === "safe" ? null : image.moderation === "unsafe" ? "unsafe_image" : "moderation_unavailable";

const turnstileOn = (c: Context<AppEnv>): boolean => typeof c.env?.TURNSTILE_SECRET === "string" && c.env.TURNSTILE_SECRET !== "";

const asQuota = (r: Remaining): QuotaSnapshot => ({ world: r.world, image: r.image, llm: r.llm, tts: r.tts, stt: r.stt, live: r.live });

/**
 * `POST /api/worlds/quote` and `POST /api/worlds` (world-pipeline 6.1). The Quote shows what will be sent and
 * what is left, and issues a Confirm Token. The create call runs, in this order and stopping at the first no:
 * the picture is the visitor's, the token verifies, a world this Session already has for the picture is returned
 * (no new spend), generation is on, Turnstile (when configured), moderation, `SpendGuard.reserve('world')`, the
 * record, the job. After the reserve, any failure releases the Ticket. Nothing here calls a paid service.
 */
export function worldCreateRoutes(deps: CreationDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const now = deps.now ?? Date.now;
  const secretOf = (c: Context<AppEnv>): string => c.env.HMAC_SECRET as string; // the Session middleware has already required it

  /** The visitor's own picture, or `null`: a missing one and someone else's look the same. */
  const ownImage = async (c: Context<AppEnv>, imageId: string): Promise<ImageInfo | null> => {
    const image = await deps.images.find(imageId);
    return image !== null && image.ownerSid === c.get("session").sid ? image : null;
  };

  routes.post("/quote", async (c) => {
    const body = await readBody(c, QuoteRequestSchema);
    if (body === null) return refuse(c, "upload_rejected", 400);
    const image = await ownImage(c, body.imageId);
    if (image === null) return refuse(c, "upload_rejected");
    const bad = moderationRefusal(image);
    if (bad !== null) return refuse(c, bad);

    const sid = c.get("session").sid;
    const secret = secretOf(c);
    const confirmToken = await signConfirm({ imageId: image.id, imageHash: image.sha256, sid, issuedAt: now() }, secret);
    const quota = deps.guard === undefined ? NO_PLACES : asQuota(await deps.guard.remaining(sid, await ipHashOf(c, secret)));
    const needsTurnstile = turnstileOn(c);
    const siteKey = c.env.TURNSTILE_SITE_KEY;
    c.header("Cache-Control", "no-store");
    return c.json({
      imageUrl: `/api/images/${image.id}`,
      quota,
      confirmToken,
      needsTurnstile,
      ...(needsTurnstile && typeof siteKey === "string" && siteKey !== "" ? { turnstileSiteKey: siteKey } : {}),
    });
  });

  routes.post("/", async (c) => {
    const body = await readBody(c, CreateWorldRequestSchema);
    if (body === null) return refuse(c, "bad_confirm", 400);
    const image = await ownImage(c, body.imageId);
    if (image === null) return refuse(c, "upload_rejected");

    const sid = c.get("session").sid;
    const secret = secretOf(c);
    const at = now();
    const check = await verifyConfirm(body.confirmToken, { imageId: image.id, imageHash: image.sha256, sid }, at, secret);
    if (!check.ok) return refuse(c, check.code);

    // A world this Session already has for this picture, or the first id that is free for a new one.
    const confirmId = await confirmIdOf(body.confirmToken);
    const key = await worldKey(image.sha256);
    let freeId: string | null = null;
    let lastFailed = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const id = await deriveWorldId(sid, key, attempt, secret);
      const record = await deps.store.find(id);
      if (record === null) { freeId = id; break; }
      // Alive, or failed under this very token: that is the job this request means (Requirements 4.4, 6.1, 6.2).
      if (record.status !== "failed" || record.confirmId === confirmId) {
        setLastWorld(c, record.id);
        c.header("Cache-Control", "no-store");
        return c.json({ worldId: record.id, status: record.status }, 200);
      }
      lastFailed = record;
    }
    if (freeId === null && lastFailed !== null) {
      setLastWorld(c, lastFailed.id);
      c.header("Cache-Control", "no-store");
      return c.json({ worldId: lastFailed.id, status: lastFailed.status }, 200);
    }
    const worldId = freeId as string;

    if (!(await deps.worldGenEnabled(c)) || deps.guard === undefined || deps.starter === undefined) return refuse(c, "world_gen_disabled");

    if (turnstileOn(c)) {
      const ip = c.req.header("CF-Connecting-IP") ?? null;
      if (body.turnstile === undefined || deps.turnstile === undefined || !(await deps.turnstile.verify(body.turnstile, ip))) {
        return refuse(c, "turnstile_failed");
      }
    }

    const bad = moderationRefusal(image);
    if (bad !== null) return refuse(c, bad);

    const reserved = await deps.guard.reserve({ meter: "world", sessionId: sid, ipHash: await ipHashOf(c, secret), now: at });
    if (!reserved.ok) {
      return refuse(c, reserved.reason === "session" ? "quota_session" : reserved.reason === "day" ? "quota_day" : reserved.reason === "total" ? "quota_total" : "world_gen_disabled");
    }
    const ticket = reserved.ticket;

    try {
      const created = await deps.store.create({
        id: worldId, kind: "user", ownerSid: sid, status: "queued", imageId: image.id, confirmId,
        ...(image.source !== undefined ? { source: image.source } : {}),
        ...(image.brief !== undefined && image.brief !== "" ? { brief: image.brief } : {}),
      });
      if (!created) {
        // Someone made it between our look and now (a double click): give the unit back and answer with theirs.
        await deps.guard.release(ticket);
        const theirs = await deps.store.find(worldId);
        setLastWorld(c, worldId);
        c.header("Cache-Control", "no-store");
        return c.json({ worldId, status: theirs?.status ?? "queued" }, 200);
      }
    } catch {
      await deps.guard.release(ticket);
      return refuse(c, "world_gen_disabled");
    }

    let started: Awaited<ReturnType<WorldStarter["start"]>>;
    try {
      started = await deps.starter.start({ worldId, imageId: image.id, ownerSid: sid, ticket });
    } catch {
      started = { ok: false, code: "upstream_rejected" };
    }
    if (!started.ok) {
      await deps.guard.release(ticket);
      await deps.store.update(worldId, { status: "failed", failure: { code: started.code, quotaReturned: true, retryAllowed: true } });
      return refuse(c, started.code);
    }

    setLastWorld(c, worldId);
    c.header("Cache-Control", "no-store");
    return c.json({ worldId, status: "queued" }, 201);
  });

  return routes;
}

/** `GET /api/images/:id`: the Place Image, to the Session that owns it and to nobody else. */
export function imageRoutes(images: ImageStore): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.get("/:id", async (c) => {
    c.header("Cache-Control", "private, no-store");
    const info = await images.find(c.req.param("id"));
    if (info === null || info.ownerSid !== c.get("session").sid) return c.json({ ok: false, code: "upload_rejected" }, 404);
    const object = await images.read(info.id);
    if (object === null) return c.json({ ok: false, code: "upload_rejected" }, 404);
    const type = object.contentType;
    return new Response(object.body, { status: 200, headers: { "Content-Type": type, "Content-Length": String(object.size), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  });
  return routes;
}

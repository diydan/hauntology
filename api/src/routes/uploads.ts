import type { ErrorCode } from "@hauntology/shared/errors";
import { toBase64Url } from "@hauntology/shared/session-cookie";
import { MAX_UPLOAD_BYTES, prepareUpload, type UploadType } from "@hauntology/shared/world/upload";
import { Hono, type Context } from "hono";
import type { AppEnv } from "../http/env";
import type { UploadStore } from "../worlds/ports";

/** At most this many photos in one request (Requirement 1.5); the first is the primary. */
export const MAX_PHOTOS = 4;
/**
 * The whole request body, in bytes. Each photo may be 10 MB (Requirement 1.1), but a Worker has 128 MB of memory and holds the
 * body, its parts and the stripped copy at once, so several large photos in one request are refused rather than risk the Worker.
 */
export const MAX_REQUEST_BYTES = 16 * 1024 * 1024;

export type UploadsDeps = {
  store: UploadStore;
  /** Whether new uploads are taken at all: the world switch (`WORLD_GEN_ENABLED` and the kill switch), because a picture is only kept to make a world from. Default on. */
  enabled?: (c: Context<AppEnv>) => Promise<boolean> | boolean;
  /** 16 random bytes for an id. Default `crypto.getRandomValues`. */
  random?: () => Uint8Array;
};

const STATUS: Partial<Record<ErrorCode, 400 | 413 | 415 | 422 | 500 | 503>> = {
  upload_too_large: 413,
  upload_too_small: 422,
  upload_bad_type: 415,
  upload_bad_magic: 422,
  upload_rejected: 400,
  world_gen_disabled: 503,
};

function refuse(c: Context<AppEnv>, code: ErrorCode, status?: number) {
  c.header("Cache-Control", "no-store");
  return c.json({ ok: false, code }, (status ?? STATUS[code] ?? 400) as 400);
}

/** The request body, read to the end unless it grows past `max` bytes (then `null`, and the rest is not read). */
export async function readLimited(request: Request, max: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(declared) && declared > max) return null;
  if (request.body === null) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * `POST /api/uploads` (world-pipeline 5.1, Requirement 1). Multipart, field `photo`, one to four files. Every photo is checked
 * (type, magic bytes, size, sides) and stripped of metadata before anything is stored; if any is refused, none is stored and
 * the answer is that photo's reason. Each accepted photo is kept privately under a random opaque id, owned by the Session,
 * not yet checked for safety (so the Quote and the create call refuse it until the Place Brief check has passed). The answer is
 * the primary's `imageId` and `imageUrl` (`/api/images/<id>`, owner only), and `others` for the rest. There is no route that lists
 * what is stored. The picture is never logged, and nothing about it is sent to any other service.
 */
export function uploadRoutes(deps: UploadsDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const newId = deps.random ?? (() => crypto.getRandomValues(new Uint8Array(16)));

  routes.post("/", async (c) => {
    c.header("Cache-Control", "no-store");
    if (deps.enabled !== undefined && !(await deps.enabled(c))) return refuse(c, "world_gen_disabled");

    const contentType = c.req.header("Content-Type") ?? "";
    if (!/^multipart\/form-data\s*;\s*boundary=/i.test(contentType)) return refuse(c, "upload_rejected");
    const body = await readLimited(c.req.raw, MAX_REQUEST_BYTES);
    if (body === null) return refuse(c, "upload_too_large");

    let form: FormData;
    try {
      form = await new Response(body, { headers: { "Content-Type": contentType } }).formData();
    } catch {
      return refuse(c, "upload_rejected");
    }
    const parts = form.getAll("photo") as unknown[];
    if (parts.length === 0 || parts.length > MAX_PHOTOS || parts.some((p) => typeof p === "string")) return refuse(c, "upload_rejected");

    // Check and strip every photo before storing any, so a refusal leaves nothing behind.
    const accepted: { type: UploadType; bytes: Uint8Array }[] = [];
    for (const part of parts as File[]) { // not strings: checked above
      if (part.size > MAX_UPLOAD_BYTES) return refuse(c, "upload_too_large");
      const r = prepareUpload(new Uint8Array(await part.arrayBuffer()), part.type);
      if (!r.ok) return refuse(c, r.code);
      accepted.push({ type: r.type, bytes: r.bytes });
    }

    const ownerSid = c.get("session").sid;
    const ids: string[] = [];
    try {
      for (const photo of accepted) {
        const imageId = toBase64Url(newId());
        await deps.store.put(imageId, photo.bytes, { contentType: photo.type, ownerSid, sha256: await sha256Hex(photo.bytes) });
        ids.push(imageId);
      }
    } catch {
      // What was stored before the failure has ids nobody was given; it is removed with the rest at the end of its day.
      return refuse(c, "upload_rejected", 500);
    }

    const url = (id: string) => `/api/images/${id}`;
    const [first, ...rest] = ids as [string, ...string[]];
    return c.json({ imageId: first, imageUrl: url(first), ...(rest.length > 0 ? { others: rest.map((id) => ({ imageId: id, imageUrl: url(id) })) } : {}) }, 201);
  });

  return routes;
}

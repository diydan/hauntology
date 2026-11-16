import type { ErrorCode } from "@hauntology/shared/errors";
import { toBase64Url } from "@hauntology/shared/session-cookie";
import { SKETCH_MAX_SIDE } from "@hauntology/shared/app/sketch-pad";
import { SKETCH_BODY_MAX, SketchRenderRequestSchema, SketchSelectRequestSchema } from "@hauntology/shared/world/requests";
import { decodePng } from "@hauntology/shared/world/sketch-png";
import type { SpendGuard, SpendTicket } from "@hauntology/shared/world/spend";
import { prepareUpload, sniffType } from "@hauntology/shared/world/upload";
import { buildSketchPrompt, isBlankSketch } from "@hauntology/shared/sketch";
import { Hono, type Context } from "hono";
import { renderCandidate } from "../guarded/workersai/image";
import type { AppEnv } from "../http/env";
import type { CandidateStore, ImageMaker } from "../worlds/ports";
import { ipHashOf, readBody, refuse as refuseBase } from "./world-create";

export type SketchDeps = {
  candidates?: CandidateStore;
  imager?: ImageMaker;
  /** `SpendGuard`, for the `image` meter. Without it nothing can be reserved, so nothing can be made. */
  guard?: SpendGuard;
  /** Whether new worlds are allowed at all; a picture is made only to make a world from it. */
  worldGenEnabled: (c: Context<AppEnv>) => Promise<boolean> | boolean;
  now?: () => number;
  /** 16 random bytes for an id, and 8 for a seed. Default `crypto.getRandomValues`. */
  random?: (n: number) => Uint8Array;
};

/** The smallest side a sketch may have: below this it is a speck, not a drawing. */
export const SKETCH_MIN_SIDE = 64;
/** The picture asked of the model. */
export const CANDIDATE_WIDTH = 1024;
export const CANDIDATE_HEIGHT = 768;
export const CANDIDATES = 2;

const STATUS: Partial<Record<ErrorCode, 400 | 413 | 422 | 429 | 502 | 503>> = {
  blank_sketch: 422,
  upstream_rate_limited: 429,
  upstream_rejected: 502,
  quota_image: 429,
};

/** A refusal with this route's own statuses first, then the shared ones (`world_gen_disabled` 503, `upload_rejected` 404, and so on). */
const refuse = (c: Context<AppEnv>, code: ErrorCode, status?: number) => refuseBase(c, code, status ?? STATUS[code]);

function fromBase64(text: string): Uint8Array | null {
  const clean = text.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean) || clean.length % 4 !== 0) return null;
  try {
    return Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * `POST /api/sketch/render` and `POST /api/sketch/select` (world-pipeline 5.3, Requirement 2).
 *
 * Render: the sketch (a base64 PNG, at most 512 on its longest side) and a caption of 3 to 200 characters, or none. In this order,
 * each step stopping the request without any call to the image model: the world switch is on, the model is set up, the sketch is
 * a PNG the server can read, it is not blank (ink under half a percent of its pixels, judged here as the shell judges it), the
 * caption makes a prompt, and a unit of the `image` meter is reserved (`quota_image`, with what is left, when it is used up). Then
 * the model is called twice with the sketch as the reference image and different seeds, in parallel. Each picture is checked and
 * stripped of metadata as an upload is, and kept 24 hours as a candidate, owned by the Session. A candidate that could not be made
 * is left out, so a render may give one picture, and none is a failure. The unit is committed if the model answered at all
 * (the calls were made and charged) and released only if every call failed. The answer is the candidates and what is left of
 * every meter.
 *
 * Select: the candidate the visitor chose becomes a Place Image (`uploads/<id>`, from a sketch, not yet checked); the same
 * candidate always gives the same id. The Place Brief check (5.4) then has to pass it, as for an upload.
 */
export function sketchRoutes(deps: SketchDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const now = deps.now ?? Date.now;
  const random = deps.random ?? ((n: number) => crypto.getRandomValues(new Uint8Array(n)));

  const fail = (c: Context<AppEnv>, code: ErrorCode, status?: number, extra: Record<string, unknown> = {}) => {
    c.header("Cache-Control", "no-store");
    return c.json({ ok: false, code, ...extra }, (status ?? STATUS[code] ?? 400) as 400);
  };

  routes.post("/render", async (c) => {
    if (!(await deps.worldGenEnabled(c))) return refuse(c, "world_gen_disabled");
    const { candidates, imager, guard } = deps;
    if (candidates === undefined || imager === undefined || guard === undefined) return refuse(c, "world_gen_disabled");

    // The body: bounded as it is read, then parsed.
    const declared = Number(c.req.header("Content-Length") ?? 0);
    if (Number.isFinite(declared) && declared > SKETCH_BODY_MAX + 4096) return refuse(c, "upload_too_large", 413);
    const text = await c.req.text();
    if (text.length > SKETCH_BODY_MAX + 4096) return refuse(c, "upload_too_large", 413);
    let parsed: ReturnType<typeof SketchRenderRequestSchema.safeParse>;
    try {
      parsed = SketchRenderRequestSchema.safeParse(JSON.parse(text));
    } catch {
      return refuse(c, "upload_rejected", 400);
    }
    if (!parsed.success) return refuse(c, "upload_rejected", 400);

    const sketch = fromBase64(parsed.data.sketchPng);
    if (sketch === null) return refuse(c, "upload_rejected", 400);
    const decoded = await decodePng(sketch);
    if (!decoded.ok) return refuse(c, decoded.code, decoded.code === "upload_too_large" ? 413 : decoded.code === "upload_rejected" ? 400 : 422);
    const { width, height } = decoded.bitmap;
    if (Math.max(width, height) > SKETCH_MAX_SIDE) return refuse(c, "upload_too_large", 413);
    if (Math.min(width, height) < SKETCH_MIN_SIDE) return refuse(c, "upload_too_small", 422);
    if (isBlankSketch(decoded.bitmap)) return refuse(c, "blank_sketch");
    const prompt = buildSketchPrompt(parsed.data.caption ?? "");
    if (!prompt.ok) return refuse(c, prompt.code, 400);

    const sid = c.get("session").sid;
    const ipHash = await ipHashOf(c, c.env.HMAC_SECRET as string);
    const reserved = await guard.reserve({ meter: "image", sessionId: sid, ipHash, now: now() });
    if (!reserved.ok) {
      if (reserved.reason === "killed") return refuse(c, "world_gen_disabled");
      return fail(c, "quota_image", 429, { quota: await guard.remaining(sid, ipHash) });
    }
    const ticket: SpendTicket = reserved.ticket;
    const settle = async (how: "commit" | "release"): Promise<void> => {
      try {
        await guard[how](ticket);
      } catch {
        // The reservation runs out by itself.
      }
    };

    // Two pictures, different seeds, at the same time.
    const seeds = Array.from({ length: CANDIDATES }, () => {
      const b = random(8);
      return 1 + ((((b[0] as number) << 24) | ((b[1] as number) << 16) | ((b[2] as number) << 8) | (b[3] as number)) >>> 1) % 2_147_483_646;
    });
    const answers = await Promise.all(
      seeds.map((seed) =>
        renderCandidate(imager, ticket, { sketch, prompt: prompt.prompt, seed, width: CANDIDATE_WIDTH, height: CANDIDATE_HEIGHT }).catch((): { ok: false; kind: "failed" } => ({ ok: false, kind: "failed" })),
      ),
    );
    const answered = answers.filter((a) => a.ok).length;
    if (answered === 0) {
      await settle("release");
      return refuse(c, answers.every((a) => !a.ok && a.kind === "rate_limited") ? "upstream_rate_limited" : "upstream_rejected");
    }
    // The model answered: the calls were made and are charged, whatever comes of the pictures.
    await settle("commit");

    const made: { imageId: string; imageUrl: string }[] = [];
    for (const answer of answers) {
      if (!answer.ok) continue;
      const type = sniffType(answer.image);
      const prepared = type === null ? null : prepareUpload(answer.image, type);
      if (prepared === null || !prepared.ok) continue;
      const imageId = toBase64Url(random(16));
      try {
        await candidates.put(imageId, prepared.bytes, { contentType: prepared.type, ownerSid: sid, sha256: await sha256Hex(prepared.bytes) });
        made.push({ imageId, imageUrl: `/api/images/${imageId}` });
      } catch {
        // This one is left out; what was stored for the others stays.
      }
    }
    if (made.length === 0) return refuse(c, "upstream_rejected");
    c.header("Cache-Control", "no-store");
    return c.json({ candidates: made, quota: await guard.remaining(sid, ipHash) });
  });

  routes.post("/select", async (c) => {
    const body = await readBody(c, SketchSelectRequestSchema);
    if (body === null) return refuse(c, "upload_rejected", 400);
    if (!(await deps.worldGenEnabled(c))) return refuse(c, "world_gen_disabled");
    if (deps.candidates === undefined) return refuse(c, "world_gen_disabled");
    let imageId: string | null;
    try {
      imageId = await deps.candidates.promote(body.imageId, c.get("session").sid);
    } catch {
      return refuse(c, "upload_rejected", 500);
    }
    if (imageId === null) return refuse(c, "upload_rejected");
    c.header("Cache-Control", "no-store");
    return c.json({ imageId });
  });

  return routes;
}

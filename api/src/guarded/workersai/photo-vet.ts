import { parsePhotoVerdict, parseSelfieVerdict, PHOTO_VET_SCHEMA, PHOTO_VET_SYSTEM, PHOTO_VET_USER, SELFIE_VET_SCHEMA, SELFIE_VET_SYSTEM, SELFIE_VET_USER, type PhotoVerdict, type SelfieVerdict } from "@hauntology/shared/party/photo-verdict";
import type { SpendTicket } from "@hauntology/shared/world/spend";
import { toBase64 } from "../base64";
import { assertTicket } from "../ticket";
import { failureKind, withTimeout, type AiBinding, type CallFailure } from "./call";
import { DEFAULT_SCOUT_MODEL } from "./scout";
import type { ImagesBinding } from "./cutout";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type VetRequest = { image: Uint8Array; contentType: string };
/** A verdict, or why there is none (a failed or timed-out call is not charged; `unusable` is a verdict and is). */
export type PhotoVetAnswer = { ok: true; verdict: PhotoVerdict } | { ok: false; kind: CallFailure };
export type SelfieVetAnswer = { ok: true; verdict: SelfieVerdict } | { ok: false; kind: CallFailure };

/** Looks at a contributed picture: a photo for a frame (party-mode 3.2) or a selfie (3.12). */
export interface PhotoVetter {
  vetPhoto(req: VetRequest): Promise<PhotoVetAnswer>;
  vetSelfie(req: VetRequest): Promise<SelfieVetAnswer>;
}

/** The only doors to the picture check: each needs a Ticket for the `llm` meter and refuses to call without one. */
export function vetPhoto(vetter: PhotoVetter, ticket: SpendTicket, req: VetRequest): Promise<PhotoVetAnswer> {
  assertTicket(ticket, "llm");
  return vetter.vetPhoto(req);
}
export function vetSelfie(vetter: PhotoVetter, ticket: SpendTicket, req: VetRequest): Promise<SelfieVetAnswer> {
  assertTicket(ticket, "llm");
  return vetter.vetSelfie(req);
}

/**
 * Llama 4 Scout on Workers AI as the picture check (`GHOST_MODEL_ID`), in the same chat shape as `ScoutPlaceBriefer`.
 * **Whether the model's accuracy at "a person is visible" holds up on real photos is not confirmed by a call.** A picture of a
 * type the model is not given, or with no bytes, is not sent and answers `failed` (not charged). Nothing sent or received is logged.
 */
export class ScoutPhotoVetter implements PhotoVetter {
  constructor(private readonly ai: AiBinding, private readonly modelId: string = DEFAULT_SCOUT_MODEL, private readonly options: { timeoutMs?: number } = {}) {}

  private async ask(req: VetRequest, system: string, user: string, schema: object): Promise<{ ok: true; raw: unknown } | { ok: false; kind: CallFailure }> {
    if (!IMAGE_TYPES.has(req.contentType) || req.image.byteLength === 0) return { ok: false, kind: "failed" };
    try {
      const raw = await withTimeout(
        this.ai.run(this.modelId, {
          messages: [{ role: "system", content: system }, { role: "user", content: [{ type: "text", text: user }, { type: "image_url", image_url: { url: `data:${req.contentType};base64,${toBase64(req.image)}` } }] }],
          response_format: { type: "json_schema", json_schema: schema },
          max_tokens: 60,
          temperature: 0,
        }),
        this.options.timeoutMs ?? 20_000,
      );
      return { ok: true, raw };
    } catch (e) {
      return { ok: false, kind: failureKind(e) };
    }
  }

  async vetPhoto(req: VetRequest): Promise<PhotoVetAnswer> {
    const a = await this.ask(req, PHOTO_VET_SYSTEM, PHOTO_VET_USER, PHOTO_VET_SCHEMA);
    return a.ok ? { ok: true, verdict: parsePhotoVerdict(a.raw) } : a;
  }
  async vetSelfie(req: VetRequest): Promise<SelfieVetAnswer> {
    const a = await this.ask(req, SELFIE_VET_SYSTEM, SELFIE_VET_USER, SELFIE_VET_SCHEMA);
    return a.ok ? { ok: true, verdict: parseSelfieVerdict(a.raw) } : a;
  }
}

// ---------------------------------------------------------------- shrinking a photo
export const PHOTO_MAX_SIDE = 512;
export type ShrinkAnswer = { ok: true; image: Uint8Array; contentType: "image/jpeg" } | { ok: false };
/** Shrinks a contributed photo so that its longer side is at most 512 px. */
export interface PhotoShrinker {
  shrink(req: VetRequest & { maxSide?: number }): Promise<ShrinkAnswer>;
}

/**
 * Cloudflare Images on the Worker's `IMAGES` binding: the picture goes in as a stream, is scaled down to fit a square of
 * `maxSide` (default 512, never up) and comes out as a JPEG. A type other than JPEG, PNG or WebP, no bytes, or a `maxSide`
 * outside 64 to 2048 is not sent. **That the binding's `transform` takes `fit: "scale-down"` with `width` and `height` is
 * documented for the URL form and not confirmed here.**
 */
export class ImagesPhotoShrinker implements PhotoShrinker {
  constructor(private readonly images: ImagesBinding, private readonly options: { timeoutMs?: number } = {}) {}
  async shrink(req: VetRequest & { maxSide?: number }): Promise<ShrinkAnswer> {
    const side = req.maxSide ?? PHOTO_MAX_SIDE;
    if (!IMAGE_TYPES.has(req.contentType) || req.image.byteLength === 0 || !Number.isInteger(side) || side < 64 || side > 2048) return { ok: false };
    try {
      const bytes = await withTimeout(
        (async () => {
          const out = await this.images.input(new Response(req.image as unknown as ArrayBuffer).body as ReadableStream<Uint8Array>).transform({ width: side, height: side, fit: "scale-down" }).output({ format: "image/jpeg" });
          return new Uint8Array(await out.response().arrayBuffer());
        })(),
        this.options.timeoutMs ?? 15_000,
      );
      return bytes.byteLength === 0 ? { ok: false } : { ok: true, image: bytes, contentType: "image/jpeg" };
    } catch {
      return { ok: false };
    }
  }
}

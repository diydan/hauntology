import type { SpendTicket } from "@hauntology/shared/world/spend";
import type { ImageMaker, RenderAnswer } from "../../worlds/ports";
import { assertTicket } from "../ticket";
import { failureKind, withTimeout, type AiBinding } from "./call";

/**
 * The only door to the image model (`.kiro/steering/security-and-cost.md`). It needs a Ticket for the `image` meter and refuses
 * to call without one, so no path can spend without a reservation from `SpendGuard`.
 */
export function renderCandidate(maker: ImageMaker, ticket: SpendTicket, req: Parameters<ImageMaker["render"]>[0]): ReturnType<ImageMaker["render"]> {
  assertTicket(ticket, "image");
  return maker.render(req);
}

export const DEFAULT_IMAGE_MODEL = "@cf/black-forest-labs/flux-2-klein-9b";
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;

function fromBase64(text: string): Uint8Array | null {
  if (text.length === 0 || text.length > MAX_IMAGE_BYTES * 1.4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text.replace(/\s+/g, ""))) return null;
  try {
    const binary = atob(text.replace(/\s+/g, ""));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * The image model, FLUX.2 klein 9B on Workers AI (`IMAGE_MODEL_ID`), as its page documents it: a multipart form with `prompt`,
 * the sketch as `input_image_0` (reference images must be smaller than 512 by 512), `width`, `height` and `seed`; the steps are
 * fixed at 4; the answer is `{ image: <base64> }`. **A call has not been made** (Spike 1.2): the reference size limit (it says
 * "smaller than 512x512"; a sketch of exactly 512 on its longest side is what the shell sends), the format of the picture that
 * comes back and the cost are unconfirmed, and the answer is checked by the caller as any upload is.
 *
 * `rate_limited` for a failure whose message says the service is busy or limited, `failed` for any other failure, a timeout, or
 * an answer without a picture. The sketch, the prompt and the picture are not logged and go nowhere else.
 */
export class FluxImageMaker implements ImageMaker {
  constructor(
    private readonly ai: AiBinding,
    private readonly modelId: string = DEFAULT_IMAGE_MODEL,
    private readonly options: { timeoutMs?: number } = {},
  ) {}

  async render(req: Parameters<ImageMaker["render"]>[0]): Promise<RenderAnswer> {
    const form = new FormData();
    form.append("prompt", req.prompt);
    form.append("input_image_0", new Blob([req.sketch as unknown as ArrayBuffer], { type: "image/png" }), "sketch.png");
    form.append("width", String(req.width));
    form.append("height", String(req.height));
    form.append("seed", String(req.seed));
    // FormData does not expose its body or its boundary: a Response serializes it and makes the Content-Type with the boundary.
    const serialized = new Response(form);
    let answer: unknown;
    try {
      answer = await withTimeout(this.ai.run(this.modelId, { multipart: { body: serialized.body, contentType: serialized.headers.get("content-type") } }), this.options.timeoutMs ?? 60_000);
    } catch (e) {
      return { ok: false, kind: failureKind(e) };
    }
    const image = typeof answer === "object" && answer !== null && typeof (answer as { image?: unknown }).image === "string" ? fromBase64((answer as { image: string }).image) : null;
    return image === null ? { ok: false, kind: "failed" } : { ok: true, image };
  }
}

/** A portrait from words alone (ghost-creator task 3): no reference image. */
export interface PortraitMaker {
  render(req: { prompt: string; negativePrompt: string; seed: number; width: number; height: number }): Promise<RenderAnswer>;
}

/** The only door to text-to-image portrait calls: a Ticket for the `image` meter, as everywhere. */
export function renderPortrait(maker: PortraitMaker, ticket: SpendTicket, req: Parameters<PortraitMaker["render"]>[0]): ReturnType<PortraitMaker["render"]> {
  assertTicket(ticket, "image");
  return maker.render(req);
}

/**
 * FLUX.2 text-to-image for a ghost portrait: the same multipart form as the sketch render
 * without `input_image_0`, plus the negative prompt as its own field. **Not confirmed by a
 * call** (world-pipeline Spike 1.2 owns the image model's real behaviour); the answer is
 * checked by the caller as any upload is. Nothing sent or received is logged.
 */
export class FluxPortraitMaker implements PortraitMaker {
  constructor(
    private readonly ai: AiBinding,
    private readonly modelId: string = DEFAULT_IMAGE_MODEL,
    private readonly options: { timeoutMs?: number } = {},
  ) {}

  async render(req: Parameters<PortraitMaker["render"]>[0]): Promise<RenderAnswer> {
    const form = new FormData();
    form.append("prompt", req.prompt);
    form.append("negative_prompt", req.negativePrompt);
    form.append("width", String(req.width));
    form.append("height", String(req.height));
    form.append("seed", String(req.seed));
    const serialized = new Response(form);
    let answer: unknown;
    try {
      answer = await withTimeout(this.ai.run(this.modelId, { multipart: { body: serialized.body, contentType: serialized.headers.get("content-type") } }), this.options.timeoutMs ?? 60_000);
    } catch (e) {
      return { ok: false, kind: failureKind(e) };
    }
    const image = typeof answer === "object" && answer !== null && typeof (answer as { image?: unknown }).image === "string" ? fromBase64((answer as { image: string }).image) : null;
    return image === null ? { ok: false, kind: "failed" } : { ok: true, image };
  }
}

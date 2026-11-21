import type { EnhanceView } from "@hauntology/shared/world/enhance";
import type { SpendTicket } from "@hauntology/shared/world/spend";
import type { RenderAnswer } from "../../worlds/ports";
import { assertTicket } from "../ticket";
import { failureKind, withTimeout, type AiBinding } from "./call";
import { DEFAULT_IMAGE_MODEL } from "./image";

/**
 * Outpainting for Enhance (world-pipeline task 11.1): one extra view of a photo, continued sideways. The only door to it needs a Ticket for the `image`
 * meter and refuses to call without one, like every other paid image call (`.kiro/steering/security-and-cost.md`).
 */
export interface Outpainter {
  extend(req: { photo: Uint8Array; contentType: string; view: EnhanceView; seed: number; width: number; height: number }): Promise<RenderAnswer>;
}

export function outpaintView(maker: Outpainter, ticket: SpendTicket, req: Parameters<Outpainter["extend"]>[0]): ReturnType<Outpainter["extend"]> {
  assertTicket(ticket, "image");
  return maker.extend(req);
}

/** The words for one extension. They name what to keep and what to leave out, never a living artist or a title. */
export function outpaintPrompt(view: EnhanceView): string {
  const side = view.fill.side;
  const turn = view.azimuthDeg > 0 ? "right" : "left";
  return [
    `Continue this photograph beyond its ${side} edge, as if the camera had turned a little to the ${turn}.`,
    "Keep the same room or place, the same light, the same colours and the same lens.",
    "Show only what would plausibly be there: walls, floor, furniture and objects. No people, no animals, no text, no writing.",
  ].join(" ");
}

const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
function fromBase64(text: string): Uint8Array | null {
  const clean = text.replace(/\s+/g, "");
  if (clean.length === 0 || clean.length > MAX_IMAGE_BYTES * 1.4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return null;
  try {
    return Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * The outpainter over the image model on Workers AI (`IMAGE_MODEL_ID`), written like the sketch render: a multipart form with `prompt`, the photo as `input_image_0`,
 * `width`, `height` and `seed`, answering `{ image: <base64> }`. **No call has been made** (Spike 1.2 and 1.3 own what the model really does): the reference-image
 * size limit ("smaller than 512 by 512" on the model's page) means the caller must hand over a photo already shrunk to fit, whether the model continues a picture
 * sideways from a prompt alone (it has no mask input in the documented form) is the open question of Spike 1.3, and the cost is unmeasured. The photo, the prompt
 * and the picture that comes back are not logged.
 */
export class FluxOutpainter implements Outpainter {
  constructor(
    private readonly ai: AiBinding,
    private readonly modelId: string = DEFAULT_IMAGE_MODEL,
    private readonly options: { timeoutMs?: number } = {},
  ) {}

  async extend(req: Parameters<Outpainter["extend"]>[0]): Promise<RenderAnswer> {
    const form = new FormData();
    form.append("prompt", outpaintPrompt(req.view));
    form.append("input_image_0", new Blob([req.photo as unknown as ArrayBuffer], { type: req.contentType }), "photo");
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

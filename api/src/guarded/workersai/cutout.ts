import { inspectCutOut } from "@hauntology/shared/world/cutout";
import type { SpendTicket } from "@hauntology/shared/world/spend";
import { assertTicket } from "../ticket";
import { failureKind, withTimeout, type CallFailure } from "./call";

/** The part of the Cloudflare Images binding (`env.IMAGES`) this uses. */
export interface ImagesBinding {
  input(stream: ReadableStream<Uint8Array>): ImagesTransformer;
}
export interface ImagesTransformer {
  transform(transform: Record<string, unknown>): ImagesTransformer;
  output(options: { format: string }): Promise<{ response(): Response }>;
}

export type CutRequest = {
  image: Uint8Array;
  contentType: string;
  /** Shrinks the picture to at most this many pixels tall before the cut (64 to 2048), so the cut is made on, and billed for, the smaller one. */
  maxHeight?: number;
};

/** The picture with its background removed (a PNG), or why there is none (not charged). */
export type CutAnswer = { ok: true; image: Uint8Array } | { ok: false; kind: CallFailure };

/** Removes the background of a picture (the ghost's portrait becomes a sprite). */
export interface ForegroundCutter {
  cut(req: CutRequest): Promise<CutAnswer>;
}

/**
 * What the guarded door gives back: a cut-out that was read and judged (`coverage` is the share of the picture kept), or why
 * there is none. `rate_limited` and `failed` are not charged. `unusable` is: the service answered with something that is no
 * sprite (not a readable PNG, nothing kept, nothing removed, or too big).
 */
export type CutOutAnswer =
  | { ok: true; image: Uint8Array; width: number; height: number; coverage: number }
  | { ok: false; kind: CallFailure }
  | { ok: false; kind: "unusable"; reason: "unreadable" | "nothing_kept" | "nothing_removed" | "too_big" };

/** A cut-out PNG bigger than this is not taken. */
export const CUTOUT_RESULT_MAX_BYTES = 16 * 1024 * 1024;
/** The Images binding takes 20 MB at most. */
export const CUTOUT_INPUT_MAX_BYTES = 20 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * The only door to background removal (`.kiro/steering/security-and-cost.md`: Cloudflare Images transformations are called only
 * from `api/src/guarded/`). It needs a Ticket for the `image` meter and refuses to call without one. What comes back is read
 * with `inspectCutOut`, so a picture that was not cut (a stand-in of the service that ignores the request) is never taken for a cut-out.
 */
export async function cutOutForeground(cutter: ForegroundCutter, ticket: SpendTicket, req: CutRequest): Promise<CutOutAnswer> {
  assertTicket(ticket, "image");
  const cut = await cutter.cut(req);
  if (!cut.ok) return cut;
  if (cut.image.byteLength > CUTOUT_RESULT_MAX_BYTES) return { ok: false, kind: "unusable", reason: "too_big" };
  const checked = await inspectCutOut(cut.image);
  return checked.ok ? { ok: true, image: cut.image, width: checked.width, height: checked.height, coverage: checked.coverage } : { ok: false, kind: "unusable", reason: checked.reason };
}

/**
 * Cloudflare Images on the Worker's `IMAGES` binding: the picture goes in as a stream, is shrunk if `maxHeight` says so, has its
 * background removed (`segment: "foreground"`, which the Images page documents for the URL form and `cf.image`; **that the binding's
 * `transform` takes it is not confirmed**, and the default `wrangler dev` runs an offline version of the binding that supports only width,
 * height, rotate and format) and comes out as a PNG. A request that is out of bounds is not sent and answers `failed`: a type other than JPEG,
 * PNG or WebP, no bytes, more than 20 MB, a `maxHeight` outside 64 to 2048. Nothing sent or received is logged.
 */
export class ImagesForegroundCutter implements ForegroundCutter {
  constructor(
    private readonly images: ImagesBinding,
    private readonly options: { timeoutMs?: number } = {},
  ) {}

  async cut(req: CutRequest): Promise<CutAnswer> {
    const { image, contentType, maxHeight } = req;
    if (!TYPES.has(contentType) || image.byteLength === 0 || image.byteLength > CUTOUT_INPUT_MAX_BYTES) return { ok: false, kind: "failed" };
    if (maxHeight !== undefined && (!Number.isInteger(maxHeight) || maxHeight < 64 || maxHeight > 2048)) return { ok: false, kind: "failed" };
    try {
      const bytes = await withTimeout(
        (async () => {
          let handle = this.images.input(new Response(image as unknown as ArrayBuffer).body as ReadableStream<Uint8Array>);
          if (maxHeight !== undefined) handle = handle.transform({ height: maxHeight, fit: "scale-down" });
          const out = await handle.transform({ segment: "foreground" }).output({ format: "image/png" });
          return new Uint8Array(await out.response().arrayBuffer());
        })(),
        this.options.timeoutMs ?? 30_000,
      );
      return bytes.byteLength === 0 ? { ok: false, kind: "failed" } : { ok: true, image: bytes };
    } catch (e) {
      return { ok: false, kind: failureKind(e) };
    }
  }
}

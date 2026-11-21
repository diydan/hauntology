import type { SpendTicket } from "@hauntology/shared/world/spend";
import { assertTicket } from "../ticket";
import { failureKind, withTimeout, type AiBinding, type CallFailure } from "./call";

/**
 * The dark edit (world-pipeline Spike 1.3, arm C): one photo in, the same place at night and a little wrong, out. It is an EDIT, not a redraw:
 * the prompt keeps the layout and the objects and changes only the light, the air and a few small things. Nano Banana 2 (`google/nano-banana-2`)
 * is the model the product spec names (its Cloudflare page lists zero data retention, `steering/tech.md`). It is a third-party model, so the call
 * names an AI Gateway, which bills it from prepaid credits.
 *
 * **The input and answer shapes are NOT confirmed by a call** (Spike 1.3 makes the first one). The input is `{ prompt, image_input: [base64] }`; the
 * answer is read tolerantly (a base64 string, a data URI or an https address, under `image`, `result.image`, `images[0]` or `url`). An answer with none of
 * those is `unusable`: it was charged, and the reply carries only the KEYS it had (never a value) so the shape can be fixed.
 *
 * The photo is data, never logged. The caller strips EXIF/GPS/XMP before the photo gets here (`prepareUpload`); this module does not look inside it.
 */
export const DEFAULT_DARK_EDIT_MODEL = "google/nano-banana-2";
export const DARK_EDIT_MAX_BYTES = 8 * 1024 * 1024;
export const DARK_EDIT_TIMEOUT_MS = 90_000;

/** The same room, darker and a little wrong. No people, no gore, no text: the house style is horror told calmly (`house-style.md`). */
export const DARK_PROMPT =
  "Edit this photograph, do not redraw it. Keep the exact room, the layout, every piece of furniture and every object where it is, so the place is instantly recognisable. " +
  "Change only the light and the air: make it night, with one dim weak warm lamp, cold blue-grey moonlight, deep heavy shadows, darker wood, stained and slightly peeling walls, thin low mist along the floor, dust in the air and faint cobwebs in the corners. " +
  "Make two or three small things slightly wrong: a door open a hand's width, an object turned the wrong way, something crooked. " +
  "Quiet, patient dread. Keep the same camera position and framing. No people, no ghosts visible, no blood, no gore, no text.";

export type DarkEditAnswer =
  | { ok: true; image: Uint8Array; type: "image/png" | "image/jpeg" | "image/webp" }
  | { ok: false; kind: CallFailure | "unusable"; keys?: string[] };

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>;

function bytesFromBase64(text: string): Uint8Array | null {
  const clean = text.replace(/^data:[^;,]+;base64,/, "").replace(/\s+/g, "");
  if (clean.length === 0 || clean.length > DARK_EDIT_MAX_BYTES * 1.4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return null;
  try {
    return Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** The type of a picture from its first bytes, so a wrong answer (a page, a JSON error) is refused. */
export function sniffImage(b: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

/** The place in the answer where a picture might be: a string to read as base64 or as an address. */
function findImageText(answer: unknown): string | null {
  if (typeof answer === "string") return answer;
  if (typeof answer !== "object" || answer === null) return null;
  const o = answer as Record<string, unknown>;
  for (const key of ["image", "url", "image_url"]) if (typeof o[key] === "string") return o[key] as string;
  const first = Array.isArray(o["images"]) ? o["images"][0] : undefined;
  if (typeof first === "string") return first;
  if (typeof first === "object" && first !== null && typeof (first as Record<string, unknown>)["url"] === "string") return (first as Record<string, string>)["url"]!;
  if (typeof o["result"] === "object" && o["result"] !== null) return findImageText(o["result"]);
  return null;
}

export class DarkEditMaker {
  constructor(
    private readonly ai: AiBinding,
    private readonly gatewayId: string,
    private readonly modelId: string = DEFAULT_DARK_EDIT_MODEL,
    private readonly options: { timeoutMs?: number; fetcher?: FetchLike } = {},
  ) {}

  /** One edit. Needs a Ticket for the `image` meter, or it does not run. `rate_limited` and `failed` are not charged; `unusable` is. */
  async edit(ticket: SpendTicket, photo: Uint8Array): Promise<DarkEditAnswer> {
    assertTicket(ticket, "image");
    if (photo.length === 0 || photo.length > DARK_EDIT_MAX_BYTES || sniffImage(photo) === null) return { ok: false, kind: "failed" };
    let binary = "";
    for (let i = 0; i < photo.length; i += 0x8000) binary += String.fromCharCode(...photo.subarray(i, i + 0x8000));
    let answer: unknown;
    try {
      answer = await withTimeout(this.ai.run(this.modelId, { prompt: DARK_PROMPT, image_input: [btoa(binary)] }, { gateway: { id: this.gatewayId } }), this.options.timeoutMs ?? DARK_EDIT_TIMEOUT_MS);
    } catch (e) {
      return { ok: false, kind: failureKind(e) };
    }
    const keys = typeof answer === "object" && answer !== null ? Object.keys(answer).slice(0, 12) : [];
    const text = findImageText(answer);
    if (text === null) return { ok: false, kind: "unusable", keys };
    let image = /^https:\/\//.test(text) ? null : bytesFromBase64(text);
    if (image === null && /^https:\/\//.test(text)) {
      try {
        const res = await withTimeout((this.options.fetcher ?? (fetch as unknown as FetchLike))(text), 20_000);
        if (res.ok) image = new Uint8Array(await res.arrayBuffer());
      } catch {
        image = null;
      }
    }
    const type = image === null || image.length > DARK_EDIT_MAX_BYTES * 2 ? null : sniffImage(image);
    return image === null || type === null ? { ok: false, kind: "unusable", keys } : { ok: true, image, type };
  }
}

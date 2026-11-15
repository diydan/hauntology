import { PLACE_BRIEF_SCHEMA, PLACE_BRIEF_SYSTEM, PLACE_BRIEF_USER, parsePlaceBrief } from "@hauntology/shared/world/brief";
import type { BriefAnswer, PlaceBriefer } from "../../worlds/ports";
import { toBase64 } from "../base64";

/** The part of the Workers AI binding (`env.AI`) this uses. */
export interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export const DEFAULT_SCOUT_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
/** `GHOST_MODEL_ID`: blank is the default, a Workers AI catalog id (`@cf/<author>/<model>`) is used, and anything else is `null` (no check is made, so no picture passes). */
export function scoutModelFromEnv(value: string | undefined): string | null {
  const id = typeof value === "string" ? value.trim() : "";
  if (id === "") return DEFAULT_SCOUT_MODEL;
  return /^@cf\/[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(id) ? id : null;
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * The Place Brief check with Llama 4 Scout on Workers AI (`GHOST_MODEL_ID`). The request is the OpenAI-style chat shape the model
 * page documents, with the picture inline as a data address, and JSON mode (`response_format`) asked for. **The shape of an image
 * in a message and the answer to JSON mode with an image are not confirmed by a call** (Spike 1.2): whatever comes back is read by
 * `parsePlaceBrief`, which accepts text or an object and fails closed on anything else.
 *
 * `ok: false` for a call that failed or took longer than the timeout, or a picture of a type the model is not given. A call
 * that answered is `ok: true` whatever it said, so the caller can charge for it. The picture is not logged and goes nowhere else.
 */
export class ScoutPlaceBriefer implements PlaceBriefer {
  constructor(
    private readonly ai: AiBinding,
    private readonly modelId: string = DEFAULT_SCOUT_MODEL,
    private readonly options: { timeoutMs?: number } = {},
  ) {}

  async brief(req: Parameters<PlaceBriefer["brief"]>[0]): Promise<BriefAnswer> {
    if (!IMAGE_TYPES.has(req.contentType) || req.image.byteLength === 0) return { ok: false };
    let answer: unknown;
    try {
      answer = await withTimeout(
        this.ai.run(this.modelId, {
          messages: [
            { role: "system", content: PLACE_BRIEF_SYSTEM },
            { role: "user", content: [{ type: "text", text: PLACE_BRIEF_USER }, { type: "image_url", image_url: { url: `data:${req.contentType};base64,${toBase64(req.image)}` } }] },
          ],
          response_format: { type: "json_schema", json_schema: PLACE_BRIEF_SCHEMA },
          max_tokens: 220,
          temperature: 0.2,
        }),
        this.options.timeoutMs ?? 20_000,
      );
    } catch {
      return { ok: false };
    }
    return { ok: true, verdict: parsePlaceBrief(answer) };
  }
}

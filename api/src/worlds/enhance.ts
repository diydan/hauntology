import { multiImagePrompt, planEnhance, singlePrompt, type PromptImage, type WorldPrompt } from "@hauntology/shared/world/enhance";
import { readDimensions, sniffType } from "@hauntology/shared/world/upload";
import type { SpendGuard, SpendTicket } from "@hauntology/shared/world/spend";
import { outpaintView, type Outpainter } from "../guarded/workersai/outpaint";

/**
 * Enhance (world-pipeline task 11.1, Requirements 11.1 and 11.3): builds the prompt for the world service from a photo, with extra views made by outpainting
 * when the feature is on, and with the photo alone on ANY trouble. The feature is off unless `enabled` is true (Requirement 11.2: the default is off until Spike 1.3's
 * recorded A/B says it helps); this is built over fakes and is not called by the create route yet, because the service's multi-image request is not confirmed
 * (`HttpWorldLabs` sends one image). One unit of the `image` meter is reserved for each extension: it is kept when the picture came back and was usable, and given back
 * when the call failed. A refusal (quota, kill switch), a failed or throwing call, an unusable picture, a bad photo size or a guard that throws all end the same way: the
 * single-image prompt with the original photo, and no further call. Extensions already paid for are not kept (a half set would give the world one lopsided side), but their
 * units stay used, as the model was called. Never throws, and logs only counters.
 */
export type EnhanceDeps = {
  enabled: boolean;
  /** How many extension views to ask for (`ENHANCE_VIEWS`). */
  views: number;
  guard: SpendGuard;
  outpainter: Outpainter;
  sessionId: string;
  ipHash: string;
  now: () => number;
  /** The first seed; each view adds its place in the plan. */
  seed: number;
  /** Counters only: never a photo, a prompt or a size of the person's own. */
  log?: (event: "world.enhance", fields: { outcome: "off" | "enhanced" | "fallback"; reason?: string; views?: number }) => void;
};

export type EnhanceFallback = "disabled" | "bad_size" | "bad_photo" | "quota" | "failed" | "unusable";
export type EnhanceResult = { prompt: WorldPrompt; enhanced: boolean; fallback?: EnhanceFallback; /** Units of the `image` meter that stay used. */ unitsUsed: number };

const usable = (bytes: Uint8Array): { contentType: string; width: number; height: number } | null => {
  const type = sniffType(bytes);
  if (type === null) return null;
  const d = readDimensions(bytes, type);
  return d === null ? null : { contentType: type, width: d.width, height: d.height };
};

export async function enhancePrompt(deps: EnhanceDeps, original: { image: Uint8Array; contentType: string }): Promise<EnhanceResult> {
  const single = singlePrompt(original.image, original.contentType);
  const report = (outcome: "off" | "enhanced" | "fallback", extra: { reason?: string; views?: number } = {}): void => {
    try {
      deps.log?.("world.enhance", { outcome, ...extra });
    } catch {
      /* a logger that throws must not change the outcome */
    }
  };
  const fall = (reason: EnhanceFallback, unitsUsed: number): EnhanceResult => {
    report(reason === "disabled" ? "off" : "fallback", { reason });
    return { prompt: single, enhanced: false, fallback: reason, unitsUsed };
  };
  let used = 0;
  try {
    if (deps.enabled !== true) return fall("disabled", 0);
    const type = sniffType(original.image);
    const dims = type === null ? null : readDimensions(original.image, type);
    if (type === null || dims === null) return fall("bad_photo", 0);
    const plan = planEnhance(dims, deps.views);
    if (!plan.ok) return fall("bad_size", 0);

    const made: PromptImage[] = [];
    for (const [i, view] of plan.views.entries()) {
      const reserved = await deps.guard.reserve({ meter: "image", sessionId: deps.sessionId, ipHash: deps.ipHash, now: deps.now() });
      if (!reserved.ok) return fall("quota", used);
      const ticket: SpendTicket = reserved.ticket;
      let answer: Awaited<ReturnType<Outpainter["extend"]>>;
      try {
        answer = await outpaintView(deps.outpainter, ticket, { photo: original.image, contentType: original.contentType, view, seed: deps.seed + i, width: plan.width, height: plan.height });
      } catch {
        await deps.guard.release(ticket).catch(() => undefined);
        return fall("failed", used);
      }
      if (!answer.ok) {
        await deps.guard.release(ticket).catch(() => undefined);
        return fall("failed", used);
      }
      const picture = usable(answer.image);
      // The model was called and answered, so the unit stays used even if the picture is no good.
      await deps.guard.commit(ticket).catch(() => undefined);
      used += 1;
      if (picture === null) return fall("unusable", used);
      made.push({ image: answer.image, contentType: picture.contentType, azimuthDeg: view.azimuthDeg });
    }
    report("enhanced", { views: made.length });
    return { prompt: multiImagePrompt(original, made), enhanced: true, unitsUsed: used };
  } catch {
    // Anything not foreseen above (a guard that throws on reserve, say) is the same fall-back; the units already kept are still counted.
    return fall("failed", used);
  }
}

import type { ErrorCode } from "@hauntology/shared/errors";
import { decodeBrief, encodeBrief } from "@hauntology/shared/world/brief";
import { PlaceBriefRequestSchema } from "@hauntology/shared/world/requests";
import type { SpendGuard, SpendTicket } from "@hauntology/shared/world/spend";
import { Hono, type Context } from "hono";
import { briefPlace } from "../guarded/workersai/place-brief";
import type { AppEnv } from "../http/env";
import type { ImageStore, ImageVerdictStore, PlaceBriefer } from "../worlds/ports";
import { ipHashOf, readBody, refuse } from "./world-create";

export type PlacesDeps = {
  images: ImageStore;
  verdicts?: ImageVerdictStore;
  briefer?: PlaceBriefer;
  /** `SpendGuard`, for the `llm` meter. Without it nothing can be reserved, so nothing can be checked. */
  guard?: SpendGuard;
  /** Whether new worlds are allowed at all; a picture is checked only to make a world from it. */
  worldGenEnabled: (c: Context<AppEnv>) => Promise<boolean> | boolean;
  now?: () => number;
};

const bytesOf = async (body: ReadableStream<Uint8Array> | Uint8Array): Promise<Uint8Array> =>
  body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer());

/**
 * `POST /api/places/brief` `{imageId}` (world-pipeline 5.4, Requirement 3). The check that every Place Image must pass before
 * any money is spent on a world: a vision model gives a short Place Brief and a safety verdict, and the result is written onto
 * the stored picture, which is what the Quote and the create call look for.
 *
 * - Only the picture's owner may ask; a missing picture and someone else's answer alike (`upload_rejected`).
 * - A picture already checked is answered from what is stored, with no call and no charge (safe: its brief; unsafe: deleted).
 * - The check is a paid call: it needs the world switch on, reserves a unit of the `llm` meter first (`quota_*` when the
 *   caps are reached), and goes through `guarded/workersai/place-brief.ts`.
 * - Fail closed (Requirement 3.3): if the call fails, times out, or answers something that is not a clean verdict, the
 *   picture stays unchecked, the answer is `moderation_unavailable`, and the visitor may ask again. A call that failed is
 *   not charged; one that answered is, even if its answer could not be used.
 * - Unsafe (Requirement 3.2): the picture is deleted at once and the answer is `{brief: "", safe: false}`: no word of what
 *   the model saw reaches the visitor, and the shell shows a neutral message.
 * - Safe: the brief (at most 80 words, cleaned, shortened to fit the object's metadata) is stored with the picture for the
 *   ghost engine to use (Requirement 3.4), and returned with `safe: true`.
 */
export function placeRoutes(deps: PlacesDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const now = deps.now ?? Date.now;

  routes.post("/brief", async (c) => {
    const body = await readBody(c, PlaceBriefRequestSchema);
    if (body === null) return refuse(c, "upload_rejected", 400);
    const sid = c.get("session").sid;
    const image = await deps.images.find(body.imageId);
    if (image === null || image.ownerSid !== sid) return refuse(c, "upload_rejected");
    c.header("Cache-Control", "no-store");

    // Already checked: no call, no charge.
    if (image.moderation === "unsafe") {
      await deps.verdicts?.remove(image.id).catch(() => undefined);
      return c.json({ brief: "", safe: false });
    }
    if (image.moderation === "safe") return c.json({ brief: image.brief ?? "", safe: true });

    if (!(await deps.worldGenEnabled(c))) return refuse(c, "world_gen_disabled");
    const { briefer, verdicts, guard } = deps;
    if (briefer === undefined || verdicts === undefined || guard === undefined) return refuse(c, "moderation_unavailable");

    const reserved = await guard.reserve({ meter: "llm", sessionId: sid, ipHash: await ipHashOf(c, c.env.HMAC_SECRET as string), now: now() });
    if (!reserved.ok) {
      const code: ErrorCode = reserved.reason === "session" ? "quota_session" : reserved.reason === "day" ? "quota_day" : reserved.reason === "total" ? "quota_total" : "world_gen_disabled";
      return refuse(c, code);
    }
    const ticket: SpendTicket = reserved.ticket;
    const settle = async (how: "commit" | "release"): Promise<void> => {
      try {
        await guard[how](ticket);
      } catch {
        // The reservation runs out by itself.
      }
    };

    let answer: Awaited<ReturnType<PlaceBriefer["brief"]>> = { ok: false };
    let missing = false;
    try {
      const stored = await deps.images.read(image.id);
      if (stored === null) missing = true;
      else answer = await briefPlace(briefer, ticket, { image: await bytesOf(stored.body), contentType: stored.contentType });
    } catch {
      answer = { ok: false };
    }
    if (missing) {
      await settle("release");
      return refuse(c, "upload_rejected");
    }
    if (!answer.ok) {
      await settle("release");
      return refuse(c, "moderation_unavailable");
    }
    // The model answered: the call was made and is charged, whatever it said.
    await settle("commit");

    const v = answer.verdict;
    if (v.kind === "unusable") return refuse(c, "moderation_unavailable");
    if (v.kind === "unsafe") {
      await verdicts.remove(image.id).catch(() => undefined);
      return c.json({ brief: "", safe: false });
    }
    const kept = decodeBrief(encodeBrief(v.brief));
    if (kept === "" || !(await verdicts.recordSafe(image.id, kept))) return refuse(c, kept === "" ? "moderation_unavailable" : "upload_rejected");
    return c.json({ brief: kept, safe: true });
  });

  return routes;
}

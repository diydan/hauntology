import type { Candidate, ShellApi } from "@hauntology/shared/app/api";
import type { QuotaSnapshot, Route } from "@hauntology/shared/app/types";
import type { ErrorCode } from "@hauntology/shared/errors";

/**
 * The Create screen's work after the visitor has made something to send: upload a photo, ask for
 * candidates from a sketch, pick one, ask for the Place Brief, and hand the picked image to the Confirm
 * Gate. Framework-free, so it is tested without React. It spends nothing itself and starts no world: the
 * only paid call here is `sketchRender`, once per press, and nothing is created before the Confirm Gate.
 *
 * - One thing at a time: while a call runs, every other command is ignored, so a double press sends one request.
 * - A failure never leaves the Screen and never loses the sketch: it comes back as `error`, and the
 *   Screen goes back to where it was (the pad for a photo or a render, the candidates for a pick).
 * - `unsafe_image` and `moderation_unavailable` from the Place Brief, and a brief that says the image is
 *   not safe, keep the visitor on Create with their copy. Only a safe brief picks the image and goes on.
 */
export type CreatePhase = "draw" | "rendering" | "candidates" | "uploading" | "briefing";

export type CreateError = { code: ErrorCode; retryAfterSec?: number };

export type CreateUi = {
  phase: CreatePhase;
  candidates: Candidate[];
  /** The caption the candidates were made from, for their alt text. */
  caption: string;
  error: CreateError | null;
};

export type CreateController = {
  getSnapshot(): CreateUi;
  subscribe(listener: () => void): () => void;
  /** Uploads a photo the visitor chose (already re-encoded), then asks for its brief. */
  uploadPhoto(photo: Blob): Promise<void>;
  /** Sends the sketch once and shows two candidates. */
  makeItReal(sketch: Blob, caption: string): Promise<void>;
  /** Takes one candidate as the Place Image, then asks for its brief. */
  pick(imageId: string): Promise<void>;
  /** Leaves the candidates for the pad; the strokes are the Screen's and stay. */
  backToSketch(): void;
  clearError(): void;
};

export type CreateDeps = {
  api: Pick<ShellApi, "uploadPhoto" | "sketchRender" | "sketchSelect" | "placeBrief">;
  /** A call returned a newer Quota Snapshot (a render). */
  setQuota: (quota: QuotaSnapshot) => void;
  /** The Place Image is picked: in memory only, never in a URL. */
  setPicked: (imageId: string) => void;
  navigate: (route: Route) => void;
};

const fail = (code: ErrorCode, retryAfterSec?: number): CreateError => (retryAfterSec === undefined ? { code } : { code, retryAfterSec });

export function createCreateController(deps: CreateDeps): CreateController {
  const { api } = deps;
  let ui: CreateUi = { phase: "draw", candidates: [], caption: "", error: null };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<CreateUi>) => {
    ui = { ...ui, ...patch };
    for (const l of [...listeners]) l();
  };
  const busy = () => ui.phase === "rendering" || ui.phase === "uploading" || ui.phase === "briefing";

  /** Asks for the brief of `imageId`; on success the image is the Place Image and the visitor goes to the Gate. */
  const handOff = async (imageId: string, backTo: "draw" | "candidates"): Promise<void> => {
    set({ phase: "briefing", error: null });
    const brief = await api.placeBrief(imageId);
    if (!brief.ok) {
      set({ phase: backTo, error: fail(brief.code, brief.retryAfterSec) });
      return;
    }
    if (!brief.value.safe) {
      set({ phase: backTo, error: fail("unsafe_image") });
      return;
    }
    deps.setPicked(imageId);
    deps.navigate({ screen: "confirm" });
  };

  return {
    getSnapshot: () => ui,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    async uploadPhoto(photo) {
      if (busy()) return;
      set({ phase: "uploading", error: null });
      const up = await api.uploadPhoto(photo);
      if (!up.ok) {
        set({ phase: "draw", error: fail(up.code, up.retryAfterSec) });
        return;
      }
      await handOff(up.value.imageId, "draw");
    },

    async makeItReal(sketch, caption) {
      if (ui.phase !== "draw") return;
      set({ phase: "rendering", error: null, caption });
      const r = await api.sketchRender(sketch, caption);
      if (!r.ok) {
        set({ phase: "draw", error: fail(r.code, r.retryAfterSec) });
        return;
      }
      deps.setQuota(r.value.quota);
      set({ phase: "candidates", candidates: r.value.candidates });
    },

    async pick(imageId) {
      if (ui.phase !== "candidates") return;
      set({ phase: "briefing", error: null });
      const chosen = await api.sketchSelect(imageId);
      if (!chosen.ok) {
        set({ phase: "candidates", error: fail(chosen.code, chosen.retryAfterSec) });
        return;
      }
      await handOff(chosen.value.imageId, "candidates");
    },

    backToSketch() {
      if (busy()) return;
      set({ phase: "draw", candidates: [], error: null });
    },

    clearError() {
      if (ui.error !== null) set({ error: null });
    },
  };
}

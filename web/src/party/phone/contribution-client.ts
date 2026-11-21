import type { ContributionApi, PortraitsResult, PromptOffer, Result, SpriteResult, TraitsInput } from "../controller/contribute-api";
import type { PortDeps } from "./socket-port";

/**
 * The phone's client for the Room's contribution routes (party-mode 9.8). The token goes in an `Authorization` header and nowhere else; the Room Code
 * is in the path. A call that cannot be made is `unreachable`; the Room's own refusal comes back as its code (and reason) so the screen can say it in words.
 */
export function contributionClient(deps: PortDeps, code: string, token: string): ContributionApi {
  const base = `${deps.base ?? "/api/party"}/${encodeURIComponent(code)}`;
  const auth = { Authorization: `Bearer ${token}` };
  async function call<T>(path: string, init: RequestInit, pick: (body: Record<string, unknown>) => T | null): Promise<Result<T>> {
    let res: { ok: boolean; status: number; json(): Promise<unknown> };
    try { res = await deps.fetch(`${base}${path}`, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), ...auth } }); }
    catch { return { ok: false, code: "unreachable" }; }
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (body === null || typeof body !== "object") return { ok: false, code: "unreachable" };
    if (body.ok === false || (!res.ok && body.ok !== true)) return { ok: false, code: typeof body.code === "string" ? body.code : "unreachable", ...(typeof body.reason === "string" ? { reason: body.reason } : {}) };
    const value = pick(body);
    return value === null ? { ok: false, code: "unreachable" } : { ok: true, value };
  }
  const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const offer = (b: Record<string, unknown>): PromptOffer | null => (typeof b.round === "number" && Array.isArray(b.prompts) ? { round: b.round, prompts: b.prompts as PromptOffer["prompts"] } : null);
  return {
    prompts: () => call("/prompts", { method: "GET" }, offer),
    skip: () => call("/prompt/skip", { method: "POST" }, offer),
    uploadPhoto: (file, promptId) => {
      const form = new FormData();
      form.set("image", file);
      if (promptId !== undefined) form.set("promptId", promptId);
      return call("/contribute/photo", { method: "POST", body: form }, (b) => (b.status === "accepted" ? { status: "accepted" as const } : null));
    },
    zoneName: (name) => call("/contribute/zone", json("PUT", { name }), (b) => (typeof b.name === "string" ? { name: b.name } : null)),
    suspectPortraits: (traits: TraitsInput) => call<PortraitsResult>("/contribute/suspect", json("POST", { step: "portraits", traits }), (b) =>
      b.fallback === true ? { fallback: true, profileId: String(b.profileId ?? ""), ...(typeof b.reason === "string" ? { reason: b.reason } : {}) }
        : Array.isArray(b.candidates) ? { fallback: false, candidates: b.candidates as never } : null),
    suspectSprite: (candidateId, voice) => call<SpriteResult>("/contribute/suspect", json("POST", { step: "sprite", candidateId, ...(voice ? { voice } : {}) }), (b) =>
      typeof b.profileId === "string" ? { fallback: b.fallback === true, profileId: b.profileId, ...(typeof b.reason === "string" ? { reason: b.reason } : {}) } : null),
  };
}

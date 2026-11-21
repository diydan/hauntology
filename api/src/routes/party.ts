import { Hono, type Context } from "hono";
import { isAllowedOrigin, parseOriginList } from "@hauntology/shared/origin";
import { errorCodeOf } from "@hauntology/shared/party/telemetry";
import type { Logger } from "../log";
import type { ContribPatch } from "@hauntology/shared/party/lobby-contrib";
import type { LodgerVoice } from "@hauntology/shared/voice/voices";
import { presetFor, contributeSelfie, contributeZoneName, intakePhoto, suspectPortraits, suspectSprite, type Fail, type LodgerPick } from "../party/contribute";
import type { ContributionServices } from "../party/wiring";
import { readLimited } from "./uploads";
import { sanitizeNickname } from "@hauntology/shared/party/nickname";
import { generateRoomCode, normalizeCode } from "@hauntology/shared/party/roomCode";

type Stub = { fetch(input: string, init?: RequestInit): Promise<Response> };
type Namespace = { idFromName(name: string): unknown; get(id: unknown): Stub };

export type PartyDeps = Readonly<{
  rooms: Namespace;
  directory: Namespace;
  /** The visitor's session id (one live Room per session). */
  sessionOf: (c: Context) => string;
  /** The visitor's IP, hashed (never the IP itself): join attempts are limited per hash. */
  ipHashOf: (c: Context) => Promise<string>;
  /** The kill switch (`PARTY_ENABLED`): when it says no, every party route answers `party_disabled`. */
  enabled: (c: Context) => boolean;
  random?: () => number;
  /**
   * The contribution services of a Room (party-mode 5, 7): the Room's budget, the photo and text checks, the Ghost Creator and the
   * selfie ghost, built for one Room from its Durable Object. Without it the contribution routes answer `contributions_unavailable`
   * and every Player gets Presets, so the game still starts.
   */
  contribute?: (code: string, room: Stub) => ContributionServices;
  /** Where the counters-only request lines go (party-mode 10.5). Without it nothing is logged. */
  log?: Logger;
}>;

export const MAX_CONTRIBUTION_BYTES = 12 * 1024 * 1024;
const STATUS: Readonly<Record<string, number>> = {
  bad_token: 401, not_master: 403, room_unknown: 404, game_started: 409, prompt_skips_used: 409, rate_limited: 429, quota_image: 429, quota_model: 429,
  upload_too_large: 413, upload_bad_type: 415, upload_bad_magic: 422, upload_too_small: 422, upload_rejected: 422, photo_rejected: 422,
  moderation_unavailable: 503, photo_unavailable: 503, contributions_unavailable: 503, name_invalid: 400, name_unsafe: 422,
  selfie_not_allowed: 403, selfie_unusable: 422, bad_request: 400,
};
const refusal = (c: Context, code: string, reason?: string) => { c.header("Cache-Control", "no-store"); return c.json({ ok: false, code, ...(reason !== undefined ? { reason } : {}) }, (STATUS[code] ?? 400) as 400); };
const refuseFail = (c: Context, f: Fail) => refusal(c, f.code, f.reason);

/** The device's token from the `Authorization: Bearer` header. Never from the address, a cookie or the body. */
const tokenOf = (c: Context): string | null => {
  const m = /^Bearer ([0-9a-f]{32})$/.exec(c.req.header("Authorization") ?? "");
  return m === null ? null : (m[1] as string);
};

const post = (stub: Stub, path: string, body: unknown): Promise<Response> =>
  stub.fetch(`https://party${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/**
 * The party routes (party-mode 1.1 to 1.3, integration 3.2), mounted at `/api/party`:
 *   POST / {replace?}      create a Room: {code, hostToken, displayToken} | {code: "rooms_full" | "session_has_room"};
 *                          with `replace: true` the session's own earlier Room is ended first
 *   POST /:code/join       {nickname} -> {seat, token} | refusal; an unknown or expired code is "room_unknown" and says nothing else
 *   DELETE /:code          (Authorization: Bearer <token>) ends the Room for its Master or host token: 204 | 401 | 403 "not_master" | 404 "room_unknown" (the handler is below, with the contribution routes)
 *   GET  /:code/ws         the socket, handed to the Room; the token goes in the first message, never in the URL
 */
export function partyRoutes(deps: PartyDeps): Hono {
  const app = new Hono();
  const dir = (): Stub => deps.directory.get(deps.directory.idFromName("party-directory"));
  const roomOf = (code: string): Stub => deps.rooms.get(deps.rooms.idFromName(code));

  app.use("*", async (c, next) => {
    if (!deps.enabled(c)) return c.json({ ok: false, code: "party_disabled" }, 503);
    await next();
    // Counters only (party-mode 10.5): the route pattern (never the Room code or a token), the status and, for a refusal, its code from the party error list.
    // Nothing of the body, the address or a header is read, and a code that is not on the list is not written.
    if (deps.log !== undefined) {
      let code: string | null = null;
      if (c.res.status >= 400 && (c.res.headers.get("Content-Type") ?? "").includes("application/json")) {
        try { code = errorCodeOf(String(((await c.res.clone().json()) as { code?: unknown }).code ?? "")); } catch { code = null; }
      }
      deps.log.info("party.request", { route: c.req.routePath, status: c.res.status, ...(code !== null ? { code } : {}) });
    }
  });

  app.post("/", async (c) => {
    const sessionId = deps.sessionOf(c);
    const body = (await c.req.json().catch(() => ({}))) as { replace?: unknown; doors?: unknown };
    let replaced = false;
    for (let tries = 0; tries < 8; tries++) {
      const code = generateRoomCode(deps.random ?? Math.random);
      const claim = (await (await post(dir(), "/create", { code, sessionId })).json()) as { ok: boolean; code?: string; existing?: string };
      // `replace`: the visitor's own earlier Room (a reload, a closed tab) ends, and frees its place, once.
      if (!claim.ok && claim.code === "session_has_room" && body.replace === true && !replaced && typeof claim.existing === "string") {
        replaced = true;
        await post(roomOf(claim.existing), "/end", {});
        await post(dir(), "/delete", { code: claim.existing });
        continue;
      }
      if (claim.ok) {
        const createPayload = body.doors && typeof body.doors === "object" ? { code, doors: body.doors } : { code };
        const tokens = (await (await post(roomOf(code), "/create", createPayload)).json()) as { hostToken: string; displayToken: string };
        return c.json({ code, ...tokens });
      }
      if (claim.code !== "code_taken") return c.json({ code: claim.code ?? "rooms_full" }, 429);
    }
    return c.json({ code: "rooms_full" }, 429);
  });

  app.post("/:code/join", async (c) => {
    const code = normalizeCode(c.req.param("code"));
    // Counted before the code is even read, so guessing codes costs the same as joining one.
    const allowed = (await (await post(dir(), "/attempt", { ipHash: await deps.ipHashOf(c) })).json()) as { ok: boolean };
    if (!allowed.ok) return c.json({ ok: false, code: "rate_limited" }, 429);
    if (code === null) return c.json({ ok: false, code: "room_unknown" }, 404);
    const live = (await (await post(dir(), "/has", { code })).json()) as { live: boolean };
    if (!live.live) return c.json({ ok: false, code: "room_unknown" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { nickname?: unknown };
    const nickname = sanitizeNickname(typeof body.nickname === "string" ? body.nickname : "");
    const res = (await (await post(roomOf(code), "/join", { nickname })).json()) as { ok: boolean };
    return c.json(res, res.ok ? 200 : 409);
  });

  app.get("/:code/ws", async (c) => {
    const code = normalizeCode(c.req.param("code"));
    if (code === null) return c.json({ ok: false, code: "room_unknown" }, 404);
    if (c.req.header("Upgrade") !== "websocket") return c.json({ ok: false, code: "expected_websocket" }, 426);
    // The upgrade is a GET, which the origin guard lets through, so the socket checks its own Origin (party-mode 4.1): a browser always sends one, and a page of another site is refused.
    const origin = c.req.header("Origin");
    if (origin !== undefined && !isAllowedOrigin(origin, c.req.url, parseOriginList((c.env as { ALLOWED_ORIGINS?: string } | undefined)?.ALLOWED_ORIGINS))) return c.json({ ok: false, code: "bad_origin" }, 403);
    // Only the upgrade headers go on (never the cookie): the Room knows a socket by the token in its first message.
    const headers = new Headers({ Upgrade: "websocket" });
    for (const h of ["Sec-WebSocket-Key", "Sec-WebSocket-Version", "Sec-WebSocket-Extensions"]) { const v = c.req.header(h); if (v !== undefined) headers.set(h, v); }
    return roomOf(code).fetch("https://party/ws", { headers });
  });

  // ---------------------------------------------------------------- the end of a Room, and the lobby's contributions (party-mode 1.5, 1.7, 3, 5, 7)
  type Who = { role: "host" | "display" | "controller"; seat: number | null; master: boolean; started: boolean };
  const roomJson = async <T,>(stub: Stub, path: string, body: unknown): Promise<T> => (await (await post(stub, path, body)).json()) as T;
  /** The Room and who holds the token, or the refusal to give. */
  const guarded = async (c: Context): Promise<{ code: string; stub: Stub; token: string; who: Who } | Response> => {
    const code = normalizeCode(c.req.param("code") ?? "");
    if (code === null) return refusal(c, "room_unknown");
    const token = tokenOf(c);
    if (token === null) return refusal(c, "bad_token");
    const live = (await roomJson<{ live: boolean }>(dir(), "/has", { code })).live;
    if (!live) return refusal(c, "room_unknown");
    const stub = roomOf(code);
    const who = await roomJson<Who | { ok: false }>(stub, "/identify", { token });
    return "role" in who ? { code, stub, token, who } : refusal(c, "bad_token");
  };
  const asPlayer = async (c: Context) => {
    const g = await guarded(c);
    if (g instanceof Response) return g;
    return g.who.role === "controller" && g.who.seat !== null ? { ...g, seat: g.who.seat } : refusal(c, "bad_token");
  };
  /** A contribution request of one seat, counted against that seat's own minute (party-mode 7): `rate_limited` (429) when it is too many. */
  const asContributor = async (c: Context) => {
    const g = await asPlayer(c);
    if (g instanceof Response) return g;
    const gate = await roomJson<{ ok: boolean; code?: string }>(g.stub, "/gate", { token: g.token });
    return gate.ok ? g : refusal(c, gate.code ?? "rate_limited");
  };
  const services = (code: string, stub: Stub): ContributionServices | null => (deps.contribute === undefined ? null : deps.contribute(code, stub));
  const record = (stub: Stub, token: string, patch: ContribPatch) => roomJson<{ ok: boolean; code?: string }>(stub, "/record", { token, patch });

  // The Master or the host token ends the Room, and everything of it goes at once.
  app.delete("/:code", async (c) => {
    const g = await guarded(c);
    if (g instanceof Response) return g;
    if (g.who.role !== "host" && !g.who.master) return refusal(c, "not_master");
    await post(g.stub, "/end", {});
    await post(dir(), "/delete", { code: g.code });
    return c.body(null, 204);
  });

  // The three prompts a Player is offered now.
  app.get("/:code/prompts", async (c) => {
    const g = await asPlayer(c);
    if (g instanceof Response) return g;
    const r = await roomJson<{ ok: boolean; code?: string; offer?: unknown }>(g.stub, "/lobby", { token: g.token });
    return r.ok ? c.json({ ok: true, ...(r.offer as object) }) : refusal(c, r.code ?? "bad_request");
  });

  app.post("/:code/prompt/skip", async (c) => {
    const g = await asPlayer(c);
    if (g instanceof Response) return g;
    const r = await roomJson<{ ok: boolean; code?: string; offer?: unknown }>(g.stub, "/skip", { token: g.token });
    return r.ok ? c.json({ ok: true, ...(r.offer as object) }) : refusal(c, r.code ?? "bad_request");
  });

  app.post("/:code/contribute/photo", async (c) => {
    const g = await asContributor(c);
    if (g instanceof Response) return g;
    const svc = services(g.code, g.stub);
    if (svc === null) return refusal(c, "contributions_unavailable");
    const body = await readLimited(c.req.raw, MAX_CONTRIBUTION_BYTES);
    if (body === null) return refusal(c, "upload_too_large");
    const form = await new Request("https://party/form", { method: "POST", headers: { "Content-Type": c.req.header("Content-Type") ?? "" }, body: body as unknown as BodyInit }).formData().catch(() => null);
    const part = form?.get("image") as unknown;
    if (form === null || part === null || part === undefined || typeof part === "string") return refusal(c, "bad_request");
    const file = part as { type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };
    const promptId = form.get("promptId");
    const r = await intakePhoto(svc.photo, { seat: g.seat, bytes: new Uint8Array(await file.arrayBuffer()), declaredType: file.type, ...(typeof promptId === "string" && promptId.length <= 32 ? { promptId } : {}) });
    if (!r.ok) return refuseFail(c, r);
    const saved = await record(g.stub, g.token, { kind: "photo", photoId: r.photoId, status: "accepted" });
    return saved.ok ? c.json({ ok: true, status: "accepted" }) : refusal(c, saved.code ?? "bad_request");
  });

  app.put("/:code/contribute/zone", async (c) => {
    const g = await asContributor(c);
    if (g instanceof Response) return g;
    const svc = services(g.code, g.stub);
    if (svc === null) return refusal(c, "contributions_unavailable");
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
    const r = await contributeZoneName(svc.names, body.name);
    if (!r.ok) return refuseFail(c, r);
    const saved = await record(g.stub, g.token, { kind: "zone", name: r.name });
    return saved.ok ? c.json({ ok: true, name: r.name }) : refusal(c, saved.code ?? "bad_request");
  });

  // The Suspect, in the Ghost Creator's two steps: `portraits` (traits, with a detail that is checked first) then `sprite` (the chosen candidate).
  app.post("/:code/contribute/suspect", async (c) => {
    const g = await asContributor(c);
    if (g instanceof Response) return g;
    const svc = services(g.code, g.stub);
    if (svc === null) return c.json({ ok: true, fallback: true, reason: "contributions_unavailable", profileId: presetFor(g.seat).id });
    const body = (await c.req.json().catch(() => ({}))) as { step?: unknown; traits?: unknown; candidateId?: unknown; voice?: unknown };
    if (body.step === "portraits") {
      const traits = typeof body.traits === "object" && body.traits !== null ? { ...(body.traits as Record<string, unknown>) } : null;
      if (traits === null) return refusal(c, "bad_request");
      // A detail is cleaned and checked by the Ghost Creator itself (once, on the Room's `llm` meter); an unsafe one gives a Preset.
      const r = await suspectPortraits(svc.suspect, g.seat, traits);
      return r.fallback ? c.json({ ok: true, fallback: true, reason: r.reason, profileId: r.profile.id }) : c.json({ ok: true, fallback: false, candidates: r.candidates });
    }
    if (body.step === "sprite" && typeof body.candidateId === "string" && body.candidateId.length <= 64) {
      const pick: LodgerPick | undefined = body.voice === "lower" || body.voice === "lighter" ? body.voice : undefined;
      const r = await suspectSprite(svc.suspect, g.seat, body.candidateId, pick);
      if (!r.fallback) {
        const saved = await record(g.stub, g.token, { kind: "ghost", profileId: r.profile.id, status: "ok", ...(r.profile.lodgerVoice !== undefined ? { lodgerVoice: r.profile.lodgerVoice } : {}) });
        if (!saved.ok) return refusal(c, saved.code ?? "bad_request");
      }
      return c.json({ ok: true, fallback: r.fallback, profileId: r.profile.id, ...(r.reason !== undefined ? { reason: r.reason } : {}) });
    }
    return refusal(c, "bad_request");
  });

  // A selfie ghost is optional and off unless the Master turned it on; the Player's own yes is a separate call, on the selfie step.
  app.put("/:code/contribute/selfie/consent", async (c) => {
    const g = await asPlayer(c);
    if (g instanceof Response) return g;
    const body = (await c.req.json().catch(() => ({}))) as { yes?: unknown };
    if (typeof body.yes !== "boolean") return refusal(c, "bad_request");
    const saved = await record(g.stub, g.token, { kind: "selfieYes", yes: body.yes });
    return saved.ok ? c.json({ ok: true }) : refusal(c, saved.code ?? "bad_request");
  });

  app.post("/:code/contribute/selfie", async (c) => {
    const g = await asContributor(c);
    if (g instanceof Response) return g;
    const svc = services(g.code, g.stub);
    if (svc === null) return refusal(c, "selfie_not_allowed");
    const ctx = await roomJson<{ ok: boolean; code?: string; selfies?: boolean; selfieYes?: boolean; selfieMade?: boolean }>(g.stub, "/lobby", { token: g.token });
    if (!ctx.ok) return refusal(c, ctx.code ?? "bad_request");
    // The switch and the seat's yes are checked before the picture is read at all.
    if (ctx.selfies !== true || ctx.selfieYes !== true || ctx.selfieMade === true) return refusal(c, "selfie_not_allowed");
    const body = await readLimited(c.req.raw, MAX_CONTRIBUTION_BYTES);
    if (body === null) return refusal(c, "upload_too_large");
    const form = await new Request("https://party/form", { method: "POST", headers: { "Content-Type": c.req.header("Content-Type") ?? "" }, body: body as unknown as BodyInit }).formData().catch(() => null);
    const part = form?.get("image") as unknown;
    if (form === null || part === null || part === undefined || typeof part === "string") return refusal(c, "bad_request");
    const file = part as { type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };
    let report: unknown, traits: unknown;
    try { report = JSON.parse(String(form.get("report") ?? "")); traits = JSON.parse(String(form.get("traits") ?? "")); } catch { return refusal(c, "bad_request"); }
    const voice = form.get("voice");
    const r = await contributeSelfie(svc.selfie, {
      seat: g.seat, settings: { selfies: true }, player: { selfieYes: true, selfieMade: false }, bytes: new Uint8Array(await file.arrayBuffer()), declaredType: file.type,
      report: report as never, traits, ...(voice === "lower" || voice === "lighter" ? { pick: voice } : {}),
    });
    if (!r.ok && !("fallback" in r)) return refuseFail(c, r as Fail);
    const made = r as { fallback: boolean; profile: { id: string; lodgerVoice?: LodgerVoice }; reason?: string };
    if (!made.fallback) {
      await record(g.stub, g.token, { kind: "ghost", profileId: made.profile.id, status: "ok", ...(made.profile.lodgerVoice !== undefined ? { lodgerVoice: made.profile.lodgerVoice } : {}) });
      await record(g.stub, g.token, { kind: "selfieMade" });
    }
    return c.json({ ok: true, fallback: made.fallback, profileId: made.profile.id, ...(made.reason !== undefined ? { reason: made.reason } : {}) });
  });

  return app;
}

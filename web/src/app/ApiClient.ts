import type { ApiFail, ApiResult, ShellApi } from "@hauntology/shared/app/api";
import { API_SCHEMAS, ErrorCodeSchema } from "@hauntology/shared/app/api-schemas";
import type { ErrorCode } from "@hauntology/shared/errors";
import type { z } from "zod";

/**
 * The real `ShellApi`: same-origin `fetch`, typed results, no throwing.
 *
 * - Every failure becomes `{ ok: false, code }`. A code the shell does not know becomes
 *   `shell_crash`; a request that never reached the server becomes `network_error`.
 * - A server `message` is never read, and a body that does not fit its schema is not trusted
 *   (`shell_crash`), so a Screen only ever meets the shapes in `ShellApi`. The schemas also reject any
 *   image URL that is not a path on this origin, so an upstream host cannot reach a Screen.
 * - A 429 carries `retryAfterSec` (the `Retry-After` header, or a default); the Screen passes it to
 *   `retryGate`.
 * - A `GET` that fails while the browser is offline waits for the `online` event and tries again.
 *   A `POST` is never retried here: a repeat could spend twice.
 */

export type OnlineSource = {
  isOnline(): boolean;
  /** Resolves true when the browser comes back online, or false after `maxMs`. */
  whenOnline(maxMs: number): Promise<boolean>;
};

export type ApiClientOptions = {
  fetch?: typeof fetch;
  online?: OnlineSource;
  now?: () => number;
  /** Seconds to advise when a 429 has no usable `Retry-After`. Default 10. */
  defaultRetryAfterSec?: number;
  /** A request that has not finished by then is a `network_error`. Default 30 000. */
  timeoutMs?: number;
  /** How long a `GET` waits for the browser to come back online. Default 60 000. */
  onlineWaitMs?: number;
  /** How many times a `GET` is retried after coming back online. Default 2. */
  onlineRetries?: number;
};

export const DEFAULT_RETRY_AFTER_SEC = 10;
export const REQUEST_TIMEOUT_MS = 30_000;
export const ONLINE_WAIT_MS = 60_000;
export const ONLINE_RETRIES = 2;

export function browserOnline(): OnlineSource {
  return {
    isOnline: () => typeof navigator === "undefined" || navigator.onLine !== false,
    whenOnline: (maxMs) =>
      new Promise<boolean>((resolve) => {
        const done = (value: boolean) => {
          clearTimeout(timer);
          globalThis.removeEventListener("online", onOnline);
          resolve(value);
        };
        const onOnline = () => done(true);
        const timer = setTimeout(() => done(false), maxMs);
        globalThis.addEventListener("online", onOnline);
      }),
  };
}

const HTTP_DATE = /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/** The seconds a `Retry-After` header asks for: a whole number, or an HTTP date. `null` if unusable. */
export function parseRetryAfter(header: string | null, now: number): number | null {
  if (header === null) return null;
  const text = header.trim();
  if (/^\d{1,7}$/.test(text)) return Number(text);
  // Only the standard HTTP date: `Date.parse` alone would read text such as "1.5" as a date.
  if (!HTTP_DATE.test(text)) return null;
  const at = Date.parse(text);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

type Raw = {
  status: number;
  ok: boolean;
  retryAfter: string | null;
  /** The parsed JSON body; `undefined` when there is none or it is not JSON. */
  json: unknown;
  /** The body as audio, for a successful `speak`. */
  audio: Blob | null;
};

type Want = "json" | "audio";

const fail = (code: ErrorCode, retryAfterSec?: number): ApiFail => (retryAfterSec === undefined ? { ok: false, code } : { ok: false, code, retryAfterSec });

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const idPath = (id: string): string => encodeURIComponent(id);

export function createApiClient(options: ApiClientOptions = {}): ShellApi {
  const fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  const online = options.online ?? browserOnline();
  const now = options.now ?? Date.now;
  const defaultRetryAfterSec = options.defaultRetryAfterSec ?? DEFAULT_RETRY_AFTER_SEC;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const onlineWaitMs = options.onlineWaitMs ?? ONLINE_WAIT_MS;
  const onlineRetries = options.onlineRetries ?? ONLINE_RETRIES;

  /** One request. `null` means it never produced a response (offline, refused, timed out). */
  async function once(url: string, init: RequestInit, want: Want): Promise<Raw | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchFn(url, { ...init, credentials: "same-origin", signal: controller.signal });
      const retryAfter = res.headers.get("Retry-After");
      if (res.ok && want === "audio") {
        const type = res.headers.get("Content-Type") ?? "";
        return { status: res.status, ok: true, retryAfter, json: undefined, audio: type.startsWith("audio/") ? await res.blob() : null };
      }
      const text = await res.text();
      let json: unknown;
      if (text !== "") {
        try {
          json = JSON.parse(text);
        } catch {
          json = undefined;
        }
      }
      return { status: res.status, ok: res.ok, retryAfter, json, audio: null };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function send(method: string, path: string, init: RequestInit, want: Want): Promise<Raw | ApiFail> {
    const request = { ...init, method };
    let raw = await once(path, request, want);
    // Only a GET is repeated, and only after the browser says it is back online.
    for (let tries = 0; raw === null && method === "GET" && tries < onlineRetries && !online.isOnline(); tries++) {
      if (!(await online.whenOnline(onlineWaitMs))) break;
      raw = await once(path, request, want);
    }
    return raw ?? fail("network_error");
  }

  const isFail = (r: Raw | ApiFail): r is ApiFail => "code" in r;

  /** The failure for a non-2xx answer: the body's `code` if it is one we know, else a generic one. */
  function failureOf(raw: Raw): ApiFail {
    const body = raw.json;
    const code = body !== null && typeof body === "object" ? ErrorCodeSchema.safeParse((body as { code?: unknown }).code) : null;
    const known: ErrorCode | null = code?.success ? code.data : null;
    if (raw.status === 429) {
      const advised = parseRetryAfter(raw.retryAfter, now());
      return fail(known ?? "rate_limited", advised ?? defaultRetryAfterSec);
    }
    return fail(known ?? "shell_crash");
  }

  async function json<S extends z.ZodTypeAny>(schema: S, method: string, path: string, body?: unknown, form?: FormData): Promise<ApiResult<z.infer<S>>> {
    const init: RequestInit = form
      ? { body: form }
      : body === undefined
        ? {}
        : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } };
    const raw = await send(method, path, init, "json");
    if (isFail(raw)) return raw;
    if (!raw.ok) return failureOf(raw);
    const parsed = schema.safeParse(raw.status === 204 ? null : raw.json);
    return parsed.success ? { ok: true, value: parsed.data } : fail("shell_crash");
  }

  return {
    session: () => json(API_SCHEMAS.session, "GET", "/api/session"),
    ackNotice: () => json(API_SCHEMAS.ackNotice, "POST", "/api/session/ack-notice"),
    quota: () => json(API_SCHEMAS.quota, "GET", "/api/quota"),
    gallery: () => json(API_SCHEMAS.gallery, "GET", "/api/gallery"),

    uploadPhoto: (photo) => {
      const form = new FormData();
      form.append("photo", photo);
      return json(API_SCHEMAS.uploadPhoto, "POST", "/api/uploads", undefined, form);
    },
    sketchRender: async (sketch, caption) => json(API_SCHEMAS.sketchRender, "POST", "/api/sketch/render", { sketchPng: await toBase64(sketch), caption }),
    sketchSelect: (imageId) => json(API_SCHEMAS.sketchSelect, "POST", "/api/sketch/select", { imageId }),
    placeBrief: (imageId) => json(API_SCHEMAS.placeBrief, "POST", "/api/places/brief", { imageId }),

    quote: (imageId) => json(API_SCHEMAS.quote, "POST", "/api/worlds/quote", { imageId }),
    createWorld: (req) => json(API_SCHEMAS.createWorld, "POST", "/api/worlds", req),
    world: (worldId) => json(API_SCHEMAS.world, "GET", `/api/worlds/${idPath(worldId)}`),
    deleteWorld: (worldId) => json(API_SCHEMAS.deleteWorld, "DELETE", `/api/worlds/${idPath(worldId)}`),
    shareWorld: (worldId, on) => json(API_SCHEMAS.shareWorld, on ? "POST" : "DELETE", `/api/worlds/${idPath(worldId)}/share`),

    ghostPresets: () => json(API_SCHEMAS.ghostPresets, "GET", "/api/ghosts/presets"),
    ghostProfile: (worldId) => json(API_SCHEMAS.ghostProfile, "GET", `/api/worlds/${idPath(worldId)}/ghost`),
    searchPlaces: (q) => json(API_SCHEMAS.searchPlaces, "POST", "/api/conditions/search", { q }),
    speak: async (req) => {
      const raw = await send("POST", "/api/voice/speak", { body: JSON.stringify(req), headers: { "Content-Type": "application/json" } }, "audio");
      if (isFail(raw)) return raw;
      if (!raw.ok) return failureOf(raw);
      return raw.audio ? { ok: true, value: { audio: raw.audio } } : fail("shell_crash");
    },
    listen: async (clip) => {
      const init: RequestInit = { body: clip, headers: { "Content-Type": clip.type || "application/octet-stream" } };
      const raw = await send("POST", "/api/voice/listen", init, "json");
      if (isFail(raw)) return raw;
      if (!raw.ok) return failureOf(raw);
      const parsed = API_SCHEMAS.listen.safeParse(raw.json);
      return parsed.success ? { ok: true, value: parsed.data } : fail("shell_crash");
    },
    playStart: (req) => json(API_SCHEMAS.playStart, "POST", "/api/play/start", req),
    playTurn: (playId, turn) => json(API_SCHEMAS.playTurn, "POST", `/api/play/${idPath(playId)}/turn`, turn),
    playGet: (playId) => json(API_SCHEMAS.playGet, "GET", `/api/play/${idPath(playId)}`),
  };
}

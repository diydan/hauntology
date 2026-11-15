import { MARBLE_FRAME, MAX_ASSET_BYTES, type AssetRole, type Lod } from "@hauntology/shared/world/ingest";
import type { SourceAsset, SourceWorld, UpstreamFailure, WorldLabsPort, WorldSource } from "../worlds/ports";
import { toBase64 } from "./base64";

/**
 * The World Labs World API over HTTP: the real `WorldLabsPort` (start a world, poll it) and `WorldSource` (read the
 * finished world, download its files), world-pipeline 7.1 and 7.3. It lives under `api/src/guarded/` because that is the
 * only place allowed to call the service (`.kiro/steering/security-and-cost.md`); the job reaches it through
 * `guarded/worldlabs.ts`, which asks for a Ticket first.
 *
 * Written from the documented shapes (`.kiro/steering/worldlabs-api.md`, `docs/spikes/1.1.md`), tested over examples
 * taken from the documentation (`shared/fixtures/worldlabs/docs-examples.json`). A real run has not confirmed them:
 * Spike 1.1 needs a World API key and credits. What a run may still change is listed in `docs/spikes/1.1.md`.
 *
 * Rules kept here:
 * - The key goes to the API host only (`https://api.worldlabs.ai`, or a loopback address for a local stand-in), never to
 *   a file address, and redirects from the API are not followed (a redirect would carry the key to another host).
 * - The key, the file addresses and the picture never appear in an error, a result or a log: a failure is a kind and, for a
 *   rate limit, a wait. Nothing here logs.
 * - A file address must be `https`, with no user name and not a local or numeric host; an address that is not is treated
 *   as not there.
 * - The picture is sent inline (`data_base64`), private, under the world's own id as its name, with no text from the visitor.
 */

export const WORLD_API_BASE = "https://api.worldlabs.ai";
export const MODELS = ["marble-1.0-draft", "marble-1.0", "marble-1.1", "marble-1.1-plus"] as const;
export type WorldModel = (typeof MODELS)[number];
export const DEFAULT_MODEL: WorldModel = "marble-1.1";
/** The documentation gives no limit for an image (a video may be 100 MB), so this is our own: well above what the client sends. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** A file whose size is not known up front is read into memory (a Worker has 128 MB), so it may not be bigger than this. */
export const BUFFERED_LIMIT = 32 * 1024 * 1024;
const MAX_JSON_CHARS = 2_000_000;
const MAX_WAIT_MS = 60 * 60 * 1000;
const OPERATION_ID = /^[A-Za-z0-9._:-]{1,200}$/;

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const IMAGE_FORMATS: Record<string, string> = { jpg: "jpg", jpeg: "jpg", png: "png", webp: "webp" };

export type HttpWorldLabsOptions = {
  /** The World API key (`WLT_API_KEY`). Printable characters, no spaces. */
  apiKey: string;
  baseUrl?: string;
  model?: WorldModel;
  fetch?: typeof fetch;
  /** One call to the API, headers and body. */
  apiTimeoutMs?: number;
  /** One file, headers and body together. */
  assetTimeoutMs?: number;
};

const isLoopbackHost = (h: string): boolean => h === "127.0.0.1" || h === "localhost" || h === "[::1]";

/** The key may only be sent to the real host, or to a loopback address (a stand-in for tests and local runs). */
export function checkBase(raw: string): { origin: string; loopback: boolean } {
  const u = new URL(raw);
  const real = new URL(WORLD_API_BASE);
  if (u.protocol === real.protocol && u.host === real.host && u.pathname === "/" && u.username === "" && u.password === "") return { origin: u.origin, loopback: false };
  if (u.protocol === "http:" && isLoopbackHost(u.hostname) && u.username === "" && u.password === "") return { origin: u.origin, loopback: true };
  throw new Error("the World API key may only be sent to the World API host or a loopback address");
}

/** How a status from the API reads to the job. `null` for a success. */
function classify(status: number, headers: Headers): UpstreamFailure | null {
  if (status >= 200 && status < 300) return null;
  if (status === 402) return { ok: false, kind: "no_credits" };
  if (status === 429) {
    const raw = headers.get("retry-after")?.trim();
    const seconds = raw === undefined || raw === "" ? Number.NaN : Number(raw);
    return Number.isFinite(seconds) && seconds >= 0 ? { ok: false, kind: "rate_limited", retryAfterMs: Math.min(MAX_WAIT_MS, Math.round(seconds * 1000)) } : { ok: false, kind: "rate_limited" };
  }
  if (status === 408 || status >= 500) return { ok: false, kind: "transient" };
  // Any other client error, and any redirect (which is never followed, so the key stays with the API host): the request is refused for good.
  return { ok: false, kind: "rejected" };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const field = (o: unknown, key: string): unknown => (isObject(o) && Object.hasOwn(o, key) ? o[key] : undefined);
const text = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);
const number = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** The format of a picture file from its address: `.jpg`, `.jpeg`, `.png` or `.webp` in the path, else none. */
export function imageFormatOf(url: string): string | undefined {
  try {
    const m = /\.([A-Za-z0-9]{1,5})$/.exec(new URL(url).pathname);
    return m === null ? undefined : IMAGE_FORMATS[m[1]!.toLowerCase()];
  } catch {
    return undefined;
  }
}

/** Whether an address of a file may be fetched: `https` (or `http` on a loopback stand-in), no user name, no local or numeric host. */
export function acceptableAssetUrl(raw: string, allowLoopback: boolean): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.username !== "" || u.password !== "") return false;
  if (allowLoopback && u.protocol === "http:" && isLoopbackHost(u.hostname)) return true;
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "" || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (h.startsWith("[") || /^[0-9.]+$/.test(h)) return false; // an IPv6 or IPv4 literal
  return true;
}

/** The finished world as the documentation describes it (`response` of a done operation), read into our own terms. */
export function readWorld(response: unknown, allowLoopback: boolean): SourceWorld | null {
  if (!isObject(response)) return null;
  const assets = field(response, "assets");
  const splats = field(assets, "splats");
  const urls = field(splats, "spz_urls");
  const keep = (url: unknown): string | undefined => {
    const t = text(url);
    return t !== undefined && acceptableAssetUrl(t, allowLoopback) ? t : undefined;
  };
  const asset = (role: AssetRole, format: string | undefined, url: string | undefined, lod?: Lod): SourceAsset | undefined =>
    url === undefined || format === undefined ? undefined : { role, format, ...(lod !== undefined ? { lod } : {}), url };

  const levels: [string, Lod][] = [["500k", "500k"], ["100k", "100k"], ["full_res", "full"]];
  const found = levels.map(([key, lod]) => asset("splat", "spz", keep(field(urls, key)), lod));
  const sources = found.filter((a): a is SourceAsset => a !== undefined);
  const collider = asset("collider", "glb", keep(field(field(assets, "mesh"), "collider_mesh_url")));
  const panoUrl = keep(field(field(assets, "imagery"), "pano_url"));
  const pano = asset("pano", panoUrl === undefined ? undefined : imageFormatOf(panoUrl), panoUrl);
  const thumbUrl = keep(field(assets, "thumbnail_url"));
  const thumb = asset("thumb", thumbUrl === undefined ? undefined : imageFormatOf(thumbUrl), thumbUrl);

  const meta = field(splats, "semantics_metadata");
  return {
    splats: sources,
    ...(collider ? { collider } : {}),
    ...(pano ? { pano } : {}),
    ...(thumb ? { thumb } : {}),
    pose: { frame: MARBLE_FRAME, metricScaleFactor: number(field(meta, "metric_scale_factor")), groundPlaneOffset: number(field(meta, "ground_plane_offset")) },
  };
}

type Answer = { ok: true; json: unknown } | UpstreamFailure;
const TRANSIENT: UpstreamFailure = { ok: false, kind: "transient" };

export class HttpWorldLabs implements WorldLabsPort, WorldSource {
  private readonly key: string;
  private readonly origin: string;
  private readonly loopback: boolean;
  private readonly model: WorldModel;
  private readonly fetcher: typeof fetch;
  private readonly apiTimeoutMs: number;
  private readonly assetTimeoutMs: number;

  constructor(options: HttpWorldLabsOptions) {
    if (typeof options.apiKey !== "string" || !/^[\x21-\x7e]+$/.test(options.apiKey)) throw new Error("the World API key must be printable characters with no spaces");
    const base = checkBase(options.baseUrl ?? WORLD_API_BASE);
    this.key = options.apiKey;
    this.origin = base.origin;
    this.loopback = base.loopback;
    this.model = options.model ?? DEFAULT_MODEL;
    if (!MODELS.includes(this.model)) throw new Error("not a World API model");
    this.fetcher = options.fetch ?? ((input, init) => fetch(input, init));
    this.apiTimeoutMs = options.apiTimeoutMs ?? 60_000;
    this.assetTimeoutMs = options.assetTimeoutMs ?? 300_000;
  }

  /** A call to the API: the key goes in the header, nothing is followed, and the answer is JSON or a failure kind. */
  private async api(method: "GET" | "POST", path: string, body?: unknown): Promise<Answer> {
    let res: Response;
    try {
      res = await this.fetcher(`${this.origin}${path}`, {
        method,
        headers: { "WLT-Api-Key": this.key, Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        redirect: "manual",
        signal: AbortSignal.timeout(this.apiTimeoutMs),
      });
    } catch {
      return TRANSIENT;
    }
    const failure = classify(res.status, res.headers);
    if (failure !== null) {
      await res.body?.cancel().catch(() => undefined);
      return failure;
    }
    // A success that is not JSON (a proxy page, a cut-off answer): a read may be tried again, but a start is not, because the
    // service may have started the world and asking again could be charged twice.
    const unreadable: UpstreamFailure = method === "POST" ? { ok: false, kind: "rejected" } : TRANSIENT;
    try {
      const raw = await res.text();
      if (raw.length > MAX_JSON_CHARS) return unreadable;
      return { ok: true, json: JSON.parse(raw) as unknown };
    } catch {
      return unreadable;
    }
  }

  async generate(req: Parameters<WorldLabsPort["generate"]>[0]): ReturnType<WorldLabsPort["generate"]> {
    const extension = Object.hasOwn(EXTENSIONS, req.contentType) ? EXTENSIONS[req.contentType] : undefined;
    if (extension === undefined || !(req.image instanceof Uint8Array) || req.image.byteLength === 0 || req.image.byteLength > MAX_IMAGE_BYTES) return { ok: false, kind: "rejected" };
    const answer = await this.api("POST", "/marble/v1/worlds:generate", {
      display_name: req.name.slice(0, 64),
      model: this.model,
      world_prompt: { type: "image", image_prompt: { source: "data_base64", data_base64: toBase64(req.image), extension }, is_pano: "auto" },
      permission: { public: false, allow_id_access: false, allowed_readers: [], allowed_writers: [] },
    });
    if (!answer.ok) return answer;
    // An answer with no operation to poll is refused: asking again could start (and be charged for) a second world.
    const id = text(field(answer.json, "operation_id"));
    return id !== undefined && OPERATION_ID.test(id) ? { ok: true, operationId: id } : { ok: false, kind: "rejected" };
  }

  /** The operation, free to read. An id that is not one the service could have made is refused without a call. */
  private operation(operationId: string): Promise<Answer> {
    if (!OPERATION_ID.test(operationId)) return Promise.resolve({ ok: false, kind: "rejected" });
    return this.api("GET", `/marble/v1/operations/${encodeURIComponent(operationId)}`);
  }

  async poll(operationId: string): ReturnType<WorldLabsPort["poll"]> {
    const answer = await this.operation(operationId);
    if (!answer.ok) return answer;
    const op = answer.json;
    if (!isObject(op)) return TRANSIENT;
    // An error means the service gave up, whether or not it says it is done.
    if (field(op, "error") !== null && field(op, "error") !== undefined) return { ok: true, state: "failed" };
    if (field(op, "done") !== true) return { ok: true, state: "pending" };
    // Done with no error and no world: there is nothing to ingest, and waiting would not change that.
    return { ok: true, state: isObject(field(op, "response")) ? "done" : "failed" };
  }

  async fetchWorld(operationId: string): ReturnType<WorldSource["fetchWorld"]> {
    const answer = await this.operation(operationId);
    if (!answer.ok) return answer;
    const op = answer.json;
    if (!isObject(op)) return TRANSIENT;
    if (field(op, "error") !== null && field(op, "error") !== undefined) return { ok: false, kind: "rejected" };
    if (field(op, "done") !== true) return TRANSIENT;
    const world = readWorld(field(op, "response"), this.loopback);
    return world === null ? { ok: false, kind: "rejected" } : { ok: true, world };
  }

  async fetchAsset(asset: SourceAsset): ReturnType<WorldSource["fetchAsset"]> {
    if (!acceptableAssetUrl(asset.url, this.loopback)) return { ok: false, kind: "rejected" };
    let res: Response;
    try {
      // No key: a file address is not ours to send it to.
      res = await this.fetcher(asset.url, { method: "GET", signal: AbortSignal.timeout(this.assetTimeoutMs) });
    } catch {
      return TRANSIENT;
    }
    const failure = classify(res.status, res.headers);
    if (failure !== null) {
      await res.body?.cancel().catch(() => undefined);
      return failure;
    }
    if (res.body === null) return { ok: true, body: new Uint8Array(0), size: 0 };

    // The length is believed only when the body is not re-encoded on the way (then it is the length of the stored file).
    const rawLength = res.headers.get("content-length")?.trim();
    const length = rawLength === undefined || rawLength === "" ? Number.NaN : Number(rawLength);
    const encoding = (res.headers.get("content-encoding") ?? "identity").trim().toLowerCase();
    if (Number.isSafeInteger(length) && length >= 0 && (encoding === "identity" || encoding === "")) {
      return { ok: true, body: res.body, size: length };
    }
    return this.readWhole(res.body);
  }

  /** Reads a file whose size is not known up front, stopping if it is too big to hold. */
  private async readWhole(body: ReadableStream<Uint8Array>): ReturnType<WorldSource["fetchAsset"]> {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > Math.min(BUFFERED_LIMIT, MAX_ASSET_BYTES)) {
          await reader.cancel().catch(() => undefined);
          return { ok: false, kind: "rejected" };
        }
        chunks.push(value);
      }
    } catch {
      return TRANSIENT;
    }
    const whole = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
      whole.set(c, at);
      at += c.byteLength;
    }
    return { ok: true, body: whole, size: total };
  }
}

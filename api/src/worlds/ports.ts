import type { ErrorCode } from "@hauntology/shared/errors";
import type { SpendTicket } from "@hauntology/shared/world/spend";
import type { AssetRole, Lod, ServicePose } from "@hauntology/shared/world/ingest";
import type { WorldManifest } from "@hauntology/shared/world/manifest";

/** What the world routes know about a stored Place Image. The bytes are never needed to decide anything. */
export type ImageInfo = {
  id: string;
  /** The Session that uploaded it, or chose it from the candidates. Nobody else may quote it. */
  ownerSid: string;
  /** Lowercase hex SHA-256 of the stored bytes. */
  sha256: string;
  /** `safe` once the Place Brief check passed; `unsafe` is refused; `pending` means it has not been checked, which also refuses (fail closed). */
  moderation: "safe" | "unsafe" | "pending";
  contentType: string;
  /** Where the picture came from, and the Place Brief made from it. Absent means an upload with no brief yet. */
  source?: "upload" | "sketch";
  brief?: string;
};

export interface ImageStore {
  find(imageId: string): Promise<ImageInfo | null>;
  read(imageId: string): Promise<{ body: ReadableStream<Uint8Array> | Uint8Array; size: number } | null>;
}

/** Checks a Turnstile result with Cloudflare. `false` for anything that is not a clear yes. */
export interface TurnstileVerifier {
  verify(token: string, ip: string | null): Promise<boolean>;
}

/** Starts the job that makes the world. The Ticket goes with it: the job commits it when the world is ready and releases it when it fails (world-pipeline 7.1). */
export interface WorldStarter {
  start(job: { worldId: string; imageId: string; ownerSid: string; ticket: SpendTicket }): Promise<{ ok: true } | { ok: false; code: ErrorCode }>;
}

/**
 * Why a call to the world service did not give an answer: it said slow down (`rate_limited`, with how long if it
 * told us), it is out of credits (`no_credits`), it refused the request for good (`rejected`), or it failed in a
 * way that may pass (`transient`: a timeout, a server fault, no network).
 */
export type UpstreamFailure = { ok: false; kind: "rate_limited" | "no_credits" | "rejected" | "transient"; retryAfterMs?: number };

/**
 * The world service (World Labs), as the job sees it. The real HTTP adapter is `HttpWorldLabs`
 * (`api/src/guarded/worldlabs-http.ts`), written from the documented shapes; a run (Spike 1.1) has not yet confirmed them.
 * Every call goes through `api/src/guarded/worldlabs.ts`, which needs a Ticket, so nothing else may spend.
 */
export interface WorldLabsPort {
  /** Starts the making of a world from a picture. */
  generate(req: { image: Uint8Array; contentType: string; name: string }): Promise<{ ok: true; operationId: string } | UpstreamFailure>;
  /** Asks how far an operation is. `failed` means the service gave up on it. */
  poll(operationId: string): Promise<{ ok: true; state: "pending" | "done" | "failed" } | UpstreamFailure>;
}

/** One file of a finished world as the service describes it. `url` is the service's own address and never leaves the Worker. */
export type SourceAsset = { role: AssetRole; format: string; lod?: Lod; url: string };
/** `pose`: how to read the files (the frame they are written in and the scale and ground height the service reports). Absent means a world with no such information: the manifest keeps its placeholder pose. */
export type SourceWorld = { splats: SourceAsset[]; collider?: SourceAsset; pano?: SourceAsset; thumb?: SourceAsset; pose?: ServicePose };

/**
 * A finished world on the service's side, in our own terms: which files it has, and their bytes. `HttpWorldLabs`
 * reads the finished operation into `SourceWorld` and downloads each file.
 */
export interface WorldSource {
  fetchWorld(operationId: string): Promise<{ ok: true; world: SourceWorld } | UpstreamFailure>;
  /** The bytes of one file and their size. An adapter that cannot know the size up front reads the file first. */
  fetchAsset(asset: SourceAsset): Promise<{ ok: true; body: ReadableStream<Uint8Array> | Uint8Array; size: number } | UpstreamFailure>;
}

/**
 * Copies a finished world into our storage under `worlds/<worldId>/` and says what its manifest is (world-pipeline 7.3,
 * `worlds/ingest.ts`). It never returns an upstream address. `title`, `brief`, `source` and `createdAt` come from the
 * world's record.
 */
export interface Ingestor {
  ingest(job: { worldId: string; operationId: string; ownerSid: string; title: string; brief: string; source: "upload" | "sketch"; createdAt: number }): Promise<
    { ok: true; manifest: WorldManifest } | { ok: false; code: "ingest_failed" } | UpstreamFailure
  >;
}

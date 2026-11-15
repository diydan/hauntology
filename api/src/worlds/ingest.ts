import { MAX_SPLATS, assetName, buildManifest, storable, type StoredAsset } from "@hauntology/shared/world/ingest";
import { MANIFEST_NAME } from "@hauntology/shared/world/manifest";
import { bundleKey, bundlePrefix } from "./keys";
import type { Ingestor, SourceAsset, UpstreamFailure, WorldSource } from "./ports";

/** The part of an R2 bucket the ingest step writes with. The real `R2Bucket` fits it. */
export interface IngestBucket {
  put(key: string, value: ReadableStream<Uint8Array> | Uint8Array): Promise<unknown>;
  head(key: string): Promise<{ size: number } | null>;
  list(options: { prefix: string; cursor?: string; limit?: number }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
  delete(keys: string | string[]): Promise<void>;
}

type Copied = { kind: "stored"; asset: StoredAsset } | { kind: "skipped" } | { kind: "failure"; failure: UpstreamFailure };

const TRANSIENT: UpstreamFailure = { ok: false, kind: "transient" };

/**
 * Ingest (world-pipeline 7.3, Requirements 8.1 to 8.3). It asks the service for the finished world, copies each file
 * into `worlds/<worldId>/` under a name made here, checks that each stored object is the size it was told and not
 * empty, builds the manifest, and writes `world.json` last, so a bundle without it is never taken for a whole one.
 *
 * - A splat that is missing, empty, too big or refused fails the ingest, and what was copied is deleted.
 * - A collider, panorama or thumbnail that is missing, empty or refused is left out, and the world is still ready.
 * - A rate limit, a fault or an out-of-credits answer is handed back as it is, so the job waits and tries the whole
 *   step again; what was copied stays and is overwritten.
 * - Nothing here logs, returns or stores an address of the service.
 */
export class WorldIngestor implements Ingestor {
  constructor(
    private readonly source: WorldSource,
    private readonly bucket: IngestBucket,
  ) {}

  async ingest(job: Parameters<Ingestor["ingest"]>[0]): ReturnType<Ingestor["ingest"]> {
    const found = await this.source.fetchWorld(job.operationId);
    if (!found.ok) return found.kind === "rejected" ? { ok: false, code: "ingest_failed" } : found;
    const w = found.world;

    const wanted: SourceAsset[] = [...w.splats.slice(0, MAX_SPLATS), ...(w.collider ? [w.collider] : []), ...(w.pano ? [w.pano] : []), ...(w.thumb ? [w.thumb] : [])];
    const stored: StoredAsset[] = [];
    const names = new Set<string>();
    for (const asset of wanted) {
      // Two files that would take one name: the first is kept, the second is not fetched.
      const name = assetName(asset.role, asset.format, asset.lod);
      if (names.has(name)) continue;
      names.add(name);
      const copied = await this.copy(job.worldId, asset);
      if (copied.kind === "failure") return copied.failure;
      if (copied.kind === "stored") stored.push(copied.asset);
    }

    const built = buildManifest(stored, { worldId: job.worldId, title: job.title, brief: job.brief, source: job.source, createdAt: job.createdAt });
    if (!built.ok) {
      await this.cleanup(job.worldId);
      return { ok: false, code: "ingest_failed" };
    }

    try {
      const bytes = new TextEncoder().encode(JSON.stringify(built.manifest));
      await this.bucket.put(bundleKey(job.worldId, MANIFEST_NAME), bytes);
      const head = await this.bucket.head(bundleKey(job.worldId, MANIFEST_NAME));
      if (head === null || head.size !== bytes.byteLength) return TRANSIENT;
    } catch {
      return TRANSIENT;
    }
    return { ok: true, manifest: built.manifest };
  }

  /** Fetches one file, stores it, and checks the stored object. */
  private async copy(worldId: string, asset: SourceAsset): Promise<Copied> {
    // A file we would not keep is not fetched.
    if (!storable({ role: asset.role, format: asset.format, bytes: 1 })) return { kind: "skipped" };

    let res: Awaited<ReturnType<WorldSource["fetchAsset"]>>;
    try {
      res = await this.source.fetchAsset(asset);
    } catch {
      return { kind: "failure", failure: TRANSIENT };
    }
    if (!res.ok) return res.kind === "rejected" ? { kind: "skipped" } : { kind: "failure", failure: res };

    const key = bundleKey(worldId, assetName(asset.role, asset.format, asset.lod));
    if (!storable({ role: asset.role, format: asset.format, bytes: res.size })) {
      if (!(res.body instanceof Uint8Array)) await res.body.cancel().catch(() => undefined);
      return { kind: "skipped" };
    }
    try {
      await this.bucket.put(key, res.body);
      const head = await this.bucket.head(key);
      if (head === null || head.size !== res.size) {
        await this.bucket.delete(key);
        return { kind: "skipped" };
      }
    } catch {
      return { kind: "failure", failure: TRANSIENT };
    }
    return { kind: "stored", asset: { role: asset.role, format: asset.format, ...(asset.lod !== undefined ? { lod: asset.lod } : {}), bytes: res.size } };
  }

  /** Deletes everything under the world's bundle prefix. */
  private async cleanup(worldId: string): Promise<void> {
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const res = await this.bucket.list({ prefix: bundlePrefix(worldId), limit: 1000, ...(cursor !== undefined ? { cursor } : {}) });
      if (res.objects.length > 0) await this.bucket.delete(res.objects.map((o) => o.key));
      if (!res.truncated || res.cursor === undefined) return;
      cursor = res.cursor;
    }
  }
}


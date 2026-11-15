import { uploadKey } from "./keys";
import type { R2BucketLike } from "./cloudflare-store";
import type { ImageInfo, ImageStore } from "./ports";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const HASH = /^[0-9a-f]{64}$/;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Place Images in R2, at `uploads/<imageId>`. Whoever stores one (uploads 5.1, the sketch choice 5.3) must set
 * the object's custom metadata `ownerSid`, `sha256` (hex of the bytes) and `moderation` (`safe` or `unsafe`;
 * left off until the check has run), and, for the manifest, `source` (`upload` or `sketch`) and `brief` (the Place Brief, at most 2000 characters). An image missing the owner or the hash is not usable, so it cannot be quoted.
 */
export class CloudflareImageStore implements ImageStore {
  constructor(private readonly bucket: R2BucketLike) {}

  async find(imageId: string): Promise<ImageInfo | null> {
    if (!ID.test(imageId)) return null;
    const head = await this.bucket.head(uploadKey(imageId));
    const md = head?.customMetadata;
    if (head === null || md === undefined) return null;
    const { ownerSid, sha256, moderation, source, brief } = md;
    if (typeof ownerSid !== "string" || ownerSid === "" || typeof sha256 !== "string" || !HASH.test(sha256)) return null;
    return {
      id: imageId,
      ownerSid,
      sha256,
      moderation: moderation === "safe" || moderation === "unsafe" ? moderation : "pending",
      contentType: "application/octet-stream",
      source: source === "sketch" ? "sketch" : "upload",
      brief: typeof brief === "string" && brief.length <= 2000 ? brief : "",
    };
  }

  async read(imageId: string): Promise<{ body: ReadableStream<Uint8Array>; size: number; contentType: string } | null> {
    if (!ID.test(imageId)) return null;
    const object = await this.bucket.get(uploadKey(imageId));
    if (object === null) return null;
    const type = object.httpMetadata?.contentType;
    return { body: object.body, size: object.size, contentType: type !== undefined && TYPES.has(type) ? type : "application/octet-stream" };
  }
}

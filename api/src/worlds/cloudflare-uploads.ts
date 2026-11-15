import { uploadKey } from "./keys";
import type { UploadStore } from "./ports";

/** The part of an R2 bucket an upload is written with. The real `R2Bucket` fits it. */
export interface UploadBucket {
  put(key: string, value: Uint8Array, options: { httpMetadata: { contentType: string }; customMetadata: Record<string, string> }): Promise<unknown>;
}

/**
 * Accepted uploads in R2 at `uploads/<imageId>`, with exactly the metadata `CloudflareImageStore` reads: the owner, the hash of
 * the stored bytes, the origin (`upload`) and the content type. `moderation` and `brief` are not set here: the object reads as
 * not yet checked until the Place Brief check (5.4) writes them. The object is found, aged and deleted by key alone, so the
 * 24 hour retention and "Delete my place" reach it.
 */
export class CloudflareUploadStore implements UploadStore {
  constructor(private readonly bucket: UploadBucket) {}

  async put(imageId: string, bytes: Uint8Array, meta: Parameters<UploadStore["put"]>[2]): Promise<void> {
    await this.bucket.put(uploadKey(imageId), bytes, {
      httpMetadata: { contentType: meta.contentType },
      customMetadata: { ownerSid: meta.ownerSid, sha256: meta.sha256, source: "upload" },
    });
  }
}

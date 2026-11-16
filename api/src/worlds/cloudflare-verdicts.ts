import { encodeBrief } from "@hauntology/shared/world/brief";
import { uploadKey } from "./keys";
import type { ImageVerdictStore } from "./ports";

const ID = /^[A-Za-z0-9_-]{1,128}$/;

/** The part of an R2 bucket the verdict is written with. The real `R2Bucket` fits it. */
export interface VerdictBucket {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; customMetadata?: Record<string, string>; httpMetadata?: { contentType?: string } } | null>;
  put(key: string, value: Uint8Array, options: { httpMetadata: { contentType: string }; customMetadata: Record<string, string> }): Promise<unknown>;
  delete(keys: string | string[]): Promise<void>;
}

/**
 * Writes the result of the Place Brief check (world-pipeline 5.4) onto the stored picture. R2 cannot change an object's
 * metadata in place, so a safe verdict reads the picture and writes it again with `moderation: safe` and the brief added to
 * the metadata it already has (the owner, the hash, the origin); the bytes are not changed. An unsafe picture is deleted.
 * The brief is kept percent-encoded (metadata travels as headers) and shortened to fit the 2 KiB R2 allows.
 */
export class CloudflareImageVerdicts implements ImageVerdictStore {
  constructor(private readonly bucket: VerdictBucket) {}

  async recordSafe(imageId: string, brief: string): Promise<boolean> {
    if (!ID.test(imageId)) return false;
    const key = uploadKey(imageId);
    const object = await this.bucket.get(key);
    if (object === null) return false;
    const bytes = new Uint8Array(await object.arrayBuffer());
    await this.bucket.put(key, bytes, {
      httpMetadata: { contentType: object.httpMetadata?.contentType ?? "application/octet-stream" },
      customMetadata: { ...(object.customMetadata ?? {}), moderation: "safe", brief: encodeBrief(brief) },
    });
    return true;
  }

  async remove(imageId: string): Promise<void> {
    if (ID.test(imageId)) await this.bucket.delete(uploadKey(imageId));
  }
}

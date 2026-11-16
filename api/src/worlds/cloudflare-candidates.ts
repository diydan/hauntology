import { toBase64Url } from "@hauntology/shared/session-cookie";
import { candidateKey, uploadKey } from "./keys";
import type { CandidateMeta, CandidateStore } from "./ports";

const ID = /^[A-Za-z0-9_-]{1,128}$/;

/** The part of an R2 bucket candidates are kept in. The real `R2Bucket` fits it. */
export interface CandidateBucket {
  head(key: string): Promise<{ customMetadata?: Record<string, string> } | null>;
  get(key: string): Promise<{ body: ReadableStream<Uint8Array>; size: number; arrayBuffer(): Promise<ArrayBuffer>; customMetadata?: Record<string, string>; httpMetadata?: { contentType?: string } } | null>;
  put(key: string, value: Uint8Array, options: { httpMetadata: { contentType: string }; customMetadata: Record<string, string> }): Promise<unknown>;
}

/** The id of the Place Image a candidate becomes: a hash of the candidate's id, so choosing the same candidate twice gives the same picture. */
export async function promotedImageId(candidateId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`hauntology/promote/v1\n${candidateId}`));
  return toBase64Url(new Uint8Array(digest).slice(0, 16));
}

/**
 * Candidates in R2 at `candidates/<id>` (kept 24 hours by retention), with their owner, hash and type. Choosing one copies it to
 * `uploads/<id>` as a Place Image from a sketch, not yet checked: the candidate itself stays until it expires, and the Place
 * Image is the one that the Place Brief check (5.4) and the Quote look at.
 */
export class CloudflareCandidateStore implements CandidateStore {
  constructor(private readonly bucket: CandidateBucket) {}

  async put(candidateId: string, bytes: Uint8Array, meta: CandidateMeta): Promise<void> {
    await this.bucket.put(candidateKey(candidateId), bytes, { httpMetadata: { contentType: meta.contentType }, customMetadata: { ownerSid: meta.ownerSid, sha256: meta.sha256, source: "sketch" } });
  }

  async read(candidateId: string) {
    if (!ID.test(candidateId)) return null;
    const object = await this.bucket.get(candidateKey(candidateId));
    const owner = object?.customMetadata?.ownerSid;
    if (object === null || typeof owner !== "string" || owner === "") return null;
    const type = object.httpMetadata?.contentType;
    return { body: object.body, size: object.size, contentType: type === "image/jpeg" || type === "image/png" || type === "image/webp" ? type : "application/octet-stream", ownerSid: owner };
  }

  async promote(candidateId: string, ownerSid: string): Promise<string | null> {
    if (!ID.test(candidateId)) return null;
    const id = await promotedImageId(candidateId);
    const already = await this.bucket.head(uploadKey(id));
    if (already !== null) return already.customMetadata?.ownerSid === ownerSid ? id : null;
    const object = await this.bucket.get(candidateKey(candidateId));
    const meta = object?.customMetadata;
    if (object === null || meta?.ownerSid !== ownerSid || typeof meta.sha256 !== "string") return null;
    await this.bucket.put(uploadKey(id), new Uint8Array(await object.arrayBuffer()), {
      httpMetadata: { contentType: object.httpMetadata?.contentType ?? "application/octet-stream" },
      customMetadata: { ownerSid, sha256: meta.sha256, source: "sketch" },
    });
    return id;
  }
}

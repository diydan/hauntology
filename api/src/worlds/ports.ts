import type { ErrorCode } from "@hauntology/shared/errors";
import type { SpendTicket } from "@hauntology/shared/world/spend";

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

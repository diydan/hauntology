import type { ErrorCode } from "@hauntology/shared/errors";
import type { JobState } from "@hauntology/shared/app/types";
import type { StoredObject } from "@hauntology/shared/world/retention";
import type { WorldManifest } from "@hauntology/shared/world/manifest";

/**
 * What the world routes know about one world. Behind it sit the `WorldJob` Durable Object (state, owner,
 * manifest) and R2 (the bytes); neither exists yet (world-pipeline 7.1 to 7.3), so the routes talk to
 * this port and a fake stands in for tests.
 */
export type WorldRecord = {
  id: string;
  /** `gallery` is public to read and play and cannot be deleted by a visitor. `user` belongs to one Session. */
  kind: "user" | "gallery";
  /** The id of the Session that made a user world. A user world without one belongs to nobody. */
  ownerSid?: string;
  status: JobState;
  title?: string;
  failure?: { code: ErrorCode; quotaReturned: boolean; retryAllowed: boolean };
  /** Present once the world is ready. Not trusted as it is: the routes parse it before they send it. */
  manifest?: WorldManifest;
  /** The Place Image and the sketch candidates, so that deleting the world can delete them too. */
  imageId?: string;
  candidateIds?: string[];
};

/** An inclusive byte range, as in an HTTP `Range` header. */
export type ByteRange = { start: number; end: number };

export interface WorldStore {
  /** The record of a world, or `null` when there is none. */
  find(id: string): Promise<WorldRecord | null>;
  /**
   * The size of one file of a world's bundle, or `null` when it is not there. It takes the record, not
   * the id, because a Gallery bundle and a user's bundle are kept in different places.
   */
  stat(world: WorldRecord, name: string): Promise<{ size: number } | null>;
  /** The bytes of a file, or of a range of it. `null` when it is not there. */
  read(world: WorldRecord, name: string, range?: ByteRange): Promise<Uint8Array | ReadableStream<Uint8Array> | null>;
  /**
   * Deletes everything tied to a world: its record, the upload and candidates, the bundle, the ghost
   * sprite and its play sessions. Safe to call for a world that is already gone.
   */
  purge(id: string): Promise<void>;
  /** Every stored object with its kind and age, for retention. */
  inventory(): Promise<StoredObject[]>;
  /** Deletes objects by key. A key that is already gone is not an error. */
  removeObjects(keys: readonly string[]): Promise<void>;
}

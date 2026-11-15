import type { ObjectKind } from "@hauntology/shared/world/retention";

/**
 * Where each kind of object lives in the one R2 bucket. Whoever stores an object (uploads 5.1, sketches
 * 5.3, ingest 7.3, the Gallery script 9.1) must use these, because retention and delete find objects by
 * their key alone.
 *
 *   uploads/<imageId>            a photo the visitor uploaded, or the sketch they chose
 *   candidates/<imageId>         a picture drawn from a sketch
 *   worlds/<worldId>/<name>      a user's World Bundle: world.json, splat, collider, panorama, thumbnail
 *   sprites/<worldId>            the ghost's cut-out sprite for that world
 *   gallery/<worldId>/<name>     a Gallery World Bundle; never deleted by anything here
 */
export const uploadKey = (imageId: string): string => `uploads/${imageId}`;
export const candidateKey = (imageId: string): string => `candidates/${imageId}`;
export const bundleKey = (worldId: string, name: string): string => `worlds/${worldId}/${name}`;
export const bundlePrefix = (worldId: string): string => `worlds/${worldId}/`;
export const spriteKey = (worldId: string): string => `sprites/${worldId}`;
export const galleryKey = (worldId: string, name: string): string => `gallery/${worldId}/${name}`;

/** The prefixes retention and delete may touch. `gallery/` is not one of them. */
export const USER_PREFIXES = ["uploads/", "candidates/", "worlds/", "sprites/"] as const;

/** What a key is, and the world it belongs to when it belongs to one. `null` for a key that is none of the kinds. */
export function describeKey(key: string): { kind: ObjectKind; worldId?: string } | null {
  if (key.startsWith("uploads/") && key.length > "uploads/".length) return { kind: "upload" };
  if (key.startsWith("candidates/") && key.length > "candidates/".length) return { kind: "candidate" };
  if (key.startsWith("sprites/") && key.length > "sprites/".length) return { kind: "sprite", worldId: key.slice("sprites/".length) };
  if (key.startsWith("worlds/")) {
    const rest = key.slice("worlds/".length);
    const slash = rest.indexOf("/");
    if (slash > 0 && slash < rest.length - 1) return { kind: "world", worldId: rest.slice(0, slash) };
    return null;
  }
  if (key.startsWith("gallery/") && key.length > "gallery/".length) return { kind: "gallery" };
  return null;
}

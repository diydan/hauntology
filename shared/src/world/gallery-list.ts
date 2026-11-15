import type { GalleryItem } from "../app/api";
import { BRIEF_MAX_CHARS, cleanBrief } from "./brief";
import type { WorldManifest } from "./manifest";

/**
 * The Gallery list (world-pipeline 9.2, Requirements 9.2 and 9.3): what `GET /api/gallery` sends for each Gallery World, in the shape the
 * shell already reads (`GalleryItem`: id, title, description, thumbUrl, attribution). Pure. A Gallery World that cannot be shown with its
 * thumbnail and its credit is left out of the list (it is still served at its own address): Requirement 9.1 gives every Gallery World an
 * attribution and 9.2 a thumbnail, so a world without one is a mistake in the plan, not something to show without a credit.
 */

/** The shell reads at most 100; this is the most one list holds. */
export const GALLERY_LIST_MAX = 50;
/** The shell's limits for the two strings. */
export const DESCRIPTION_MAX = BRIEF_MAX_CHARS;
export const ATTRIBUTION_MAX = 300;

/**
 * The Place Brief as a blurb: `cleanBrief` keeps at most 80 words and 600 characters (cut at a word end), which is what the shell reads, so no
 * further cut is needed.
 */
export const descriptionOf = (brief: string): string => cleanBrief(brief);

/** `credit · licence`, cut with an ellipsis in the credit when the two are longer than the shell takes. The licence is never cut. */
export function attributionOf(credit: string, licence: string): string {
  const tail = ` · ${licence}`;
  if (credit.length + tail.length <= ATTRIBUTION_MAX) return `${credit}${tail}`;
  const room = Math.max(1, ATTRIBUTION_MAX - tail.length - 1);
  return `${credit.slice(0, room).trimEnd()}…${tail}`.slice(0, ATTRIBUTION_MAX);
}

/** One list entry, or `null` when the world has no thumbnail or no credit. */
export function galleryItemOf(m: WorldManifest): GalleryItem | null {
  if (m.assets.thumb === undefined || m.attribution === undefined) return null;
  return {
    id: m.id,
    title: m.title,
    description: descriptionOf(m.brief),
    thumbUrl: `/api/worlds/${m.id}/assets/${m.assets.thumb.path}`,
    attribution: attributionOf(m.attribution.credit, m.attribution.licence),
  };
}

/** The list: every world that can be shown, in the order of its id, at most `GALLERY_LIST_MAX`. */
export function galleryList(manifests: readonly WorldManifest[]): GalleryItem[] {
  return manifests
    .map(galleryItemOf)
    .filter((i): i is GalleryItem => i !== null)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, GALLERY_LIST_MAX);
}

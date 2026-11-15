import { z } from "zod";

/** The bodies of `POST /api/worlds/quote` and `POST /api/worlds`. Objects are not strict: a field that is not listed is dropped. */
const ImageId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

export const QuoteRequestSchema = z.object({ imageId: ImageId });
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

/** The body of `POST /api/places/brief`. */
export const PlaceBriefRequestSchema = z.object({ imageId: ImageId });
export type PlaceBriefRequest = z.infer<typeof PlaceBriefRequestSchema>;

/** The body of `POST /api/sketch/render`: the sketch as a base64 PNG, and the caption (which may be empty or left out). */
export const SKETCH_BODY_MAX = 1_500_000;
export const SketchRenderRequestSchema = z.object({
  sketchPng: z.string().min(1).max(SKETCH_BODY_MAX),
  caption: z.string().max(2000).optional(),
});
export type SketchRenderRequest = z.infer<typeof SketchRenderRequestSchema>;

/** The body of `POST /api/sketch/select`. */
export const SketchSelectRequestSchema = z.object({ imageId: ImageId });
export type SketchSelectRequest = z.infer<typeof SketchSelectRequestSchema>;

export const CreateWorldRequestSchema = z.object({
  imageId: ImageId,
  confirmToken: z.string().min(1).max(512),
  /** The Turnstile result, when the Quote said one is needed. Cloudflare tokens are up to 2048 characters. */
  turnstile: z.string().min(1).max(2048).optional(),
});
export type CreateWorldRequest = z.infer<typeof CreateWorldRequestSchema>;

/** A request body is read as text with this cap before it is parsed. */
export const MAX_BODY_BYTES = 8 * 1024;

import { ErrorCode } from "../errors";

/**
 * What the photo picker checks in the browser before it uploads anything (shell Requirements 2.6 and
 * 12.2; the limits are those of `world-pipeline` Requirement 1.1). The server decides in the end: these
 * checks only save the visitor an upload that would be refused. Pure: the file's own numbers come in.
 */

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
/** The shorter side must be at least this many pixels. */
export const PHOTO_MIN_SIDE = 512;
/** The longer side must be at most this many pixels. */
export const PHOTO_MAX_SIDE = 8192;
/** An EXIF block is one JPEG segment of at most 65 535 bytes, so this much of a file is enough to read the capture date. */
export const EXIF_HEAD_BYTES = 65_536;
/** The JPEG qualities the re-encode tries, best first, until the result is within `PHOTO_MAX_BYTES`. */
export const JPEG_QUALITIES = [0.92, 0.8, 0.65] as const;

const ALLOWED: readonly string[] = PHOTO_TYPES;

/** `null` when the file may go on to be looked at; else the code whose copy says why not. */
export function photoFileError(file: { type: string; size: number }): ErrorCode | null {
  if (!ALLOWED.includes(file.type)) return ErrorCode.upload_bad_type;
  if (!Number.isFinite(file.size) || file.size <= 0) return ErrorCode.upload_rejected;
  if (file.size > PHOTO_MAX_BYTES) return ErrorCode.upload_too_large;
  return null;
}

/** The picture's size once it is decoded. A side that is not a positive number means it could not be read. */
export function photoSizeError(width: number, height: number): ErrorCode | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return ErrorCode.upload_rejected;
  if (Math.min(width, height) < PHOTO_MIN_SIDE) return ErrorCode.upload_too_small;
  if (Math.max(width, height) > PHOTO_MAX_SIDE) return ErrorCode.upload_rejected;
  return null;
}

/** Said before a file is chosen (Requirement 2.6, `world-pipeline` Requirement 1.3). */
export const PHOTO_NOTICE =
  "Your photo is cleaned in your browser before it is sent: its location and camera details are dropped. It is kept for 24 hours at most, and you can delete it any time.";

export const photoDateLine = (date: string): string => `Taken on ${date}. You can use that day for the sky later.`;

export const PHOTO_UNREADABLE_LINE = "We could not read that file as a picture. Try another photo.";

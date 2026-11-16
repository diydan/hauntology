import { describe, expect, it } from "vitest";
import { ErrorCode } from "../errors";
import { errorCopy } from "./errors-copy";
import { JPEG_QUALITIES, PHOTO_MAX_BYTES, PHOTO_MAX_SIDE, PHOTO_MIN_SIDE, PHOTO_NOTICE, PHOTO_TYPES, photoDateLine, photoFileError, photoSizeError } from "./photo";

describe("photoFileError", () => {
  it("accepts JPEG, PNG and WebP up to 10 MB", () => {
    for (const type of PHOTO_TYPES) {
      expect(photoFileError({ type, size: 1 })).toBeNull();
      expect(photoFileError({ type, size: PHOTO_MAX_BYTES })).toBeNull();
    }
    expect([...PHOTO_TYPES]).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(PHOTO_MAX_BYTES).toBe(10 * 1024 * 1024);
  });

  it("names the reason for anything else", () => {
    expect(photoFileError({ type: "image/gif", size: 100 })).toBe(ErrorCode.upload_bad_type);
    expect(photoFileError({ type: "", size: 100 })).toBe(ErrorCode.upload_bad_type);
    expect(photoFileError({ type: "image/svg+xml", size: 100 })).toBe(ErrorCode.upload_bad_type);
    expect(photoFileError({ type: "IMAGE/JPEG", size: 100 })).toBe(ErrorCode.upload_bad_type);
    expect(photoFileError({ type: "image/jpeg", size: PHOTO_MAX_BYTES + 1 })).toBe(ErrorCode.upload_too_large);
    expect(photoFileError({ type: "image/jpeg", size: 0 })).toBe(ErrorCode.upload_rejected);
    expect(photoFileError({ type: "image/jpeg", size: NaN })).toBe(ErrorCode.upload_rejected);
    expect(photoFileError({ type: "image/jpeg", size: -5 })).toBe(ErrorCode.upload_rejected);
  });

  it("checks the type before the size, so a huge wrong file says it is the wrong kind", () => {
    expect(photoFileError({ type: "image/gif", size: PHOTO_MAX_BYTES * 3 })).toBe(ErrorCode.upload_bad_type);
  });
});

describe("photoSizeError", () => {
  it("wants a shorter side of at least 512 and a longer side of at most 8192", () => {
    expect([PHOTO_MIN_SIDE, PHOTO_MAX_SIDE]).toEqual([512, 8192]);
    expect(photoSizeError(512, 512)).toBeNull();
    expect(photoSizeError(8192, 512)).toBeNull();
    expect(photoSizeError(512, 8192)).toBeNull();
    expect(photoSizeError(4000, 3000)).toBeNull();
    expect(photoSizeError(511, 4000)).toBe(ErrorCode.upload_too_small);
    expect(photoSizeError(4000, 100)).toBe(ErrorCode.upload_too_small);
    expect(photoSizeError(8193, 4000)).toBe(ErrorCode.upload_rejected);
  });

  it("says it could not be read when a side is not a positive number", () => {
    for (const [w, h] of [[0, 600], [600, 0], [-1, 600], [NaN, 600], [600, Infinity]] as const) expect(photoSizeError(w, h), `${w}x${h}`).toBe(ErrorCode.upload_rejected);
  });
});

describe("the words and the qualities", () => {
  it("tells the visitor, before a file is chosen, that metadata is dropped and that it is kept 24 hours at most", () => {
    expect(PHOTO_NOTICE).toMatch(/location and camera details are dropped/);
    expect(PHOTO_NOTICE).toMatch(/24 hours at most/);
  });

  it("has a copy for every code the checks can give", () => {
    for (const code of [ErrorCode.upload_bad_type, ErrorCode.upload_too_large, ErrorCode.upload_too_small, ErrorCode.upload_rejected]) {
      expect(errorCopy(code).title.length).toBeGreaterThan(5);
    }
  });

  it("says only the date it was taken, and tries three JPEG qualities, best first", () => {
    expect(photoDateLine("1987-06-21")).toBe("Taken on 1987-06-21. You can use that day for the sky later.");
    expect([...JPEG_QUALITIES]).toEqual([0.92, 0.8, 0.65]);
  });
});

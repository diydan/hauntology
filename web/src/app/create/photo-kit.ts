/**
 * The browser's part of the photo picker, as one seam so tests and the demo can swap it: reading the
 * first bytes (for the capture date), finding the picture's size, and re-encoding it through a canvas.
 * A canvas re-encode is what drops EXIF, GPS and XMP: the new JPEG is made from pixels alone.
 */
export type PhotoKit = {
  /** The first `bytes` bytes of the file, for `readCaptureDate`. */
  head(file: Blob, bytes: number): Promise<Uint8Array>;
  /** The picture's size as the browser draws it (turned upright), or `null` when it cannot be read as a picture. */
  inspect(file: Blob): Promise<{ width: number; height: number } | null>;
  /** The same picture as a JPEG of `quality` (0 to 1), made from pixels only, or `null` on failure. */
  reencode(file: Blob, quality: number): Promise<Blob | null>;
  /** An address to show the file in an `<img>` (a `blob:` address), and the way to let it go. */
  previewUrl(file: Blob): string;
  revokePreview(url: string): void;
};

function readBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export const browserPhotoKit: PhotoKit = {
  head: (file, bytes) => readBytes(file.slice(0, bytes)),

  async inspect(file) {
    try {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    } catch {
      return null;
    }
  },

  async reencode(file, quality) {
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (ctx === null) {
        bitmap.close();
        return null;
      }
      // JPEG has no transparency: a see-through photo is laid on white.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
    } catch {
      return null;
    }
  },

  previewUrl: (file) => URL.createObjectURL(file),
  revokePreview: (url) => URL.revokeObjectURL(url),
};

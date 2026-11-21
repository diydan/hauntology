import type { ReactNode } from "react";
import { encodeQr, qrPath } from "@hauntology/shared/qr/qr";

const QUIET = 4;

/**
 * A code to scan for `text` (party-mode 8.1), drawn as one SVG path from `shared/src/qr`: no library, no image file, nothing sent anywhere.
 * Returns null when the text is too long for the encoder, so the page falls back to words.
 */
export function qrImage(text: string, label: string): ReactNode {
  let matrix;
  try { matrix = encodeQr(text, "M"); } catch { return null; }
  const n = matrix.length + QUIET * 2;
  return (
    <svg className="ui-qr" viewBox={`0 0 ${n} ${n}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <path className="ui-qr-modules" d={qrPath(matrix, QUIET)} />
    </svg>
  );
}

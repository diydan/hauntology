import type { ReactNode } from "react";
import { qrImage } from "./QrImage";

/**
 * The Room Code and the way in (party-mode 8.1): the four-letter code large, the join address as text, and the QR for it where there is one. The
 * address carries only the code (never a token). The code to scan is made in the page by `shared/src/qr` (decision: no QR dependency); a ready-made
 * `qr` still wins, and an address too long for the encoder falls back to the code and the address in words.
 */
export function RoomCodeCard({ code, origin, qr }: { code: string; origin: string; qr?: ReactNode }): ReactNode {
  const url = `${origin}/play?code=${encodeURIComponent(code)}`;
  return (
    <section className="ph-code ui-stack" aria-label="Join this game">
      <p className="ui-eyebrow">Join on your phone</p>
      <p className="ph-code-letters" aria-label={`Room Code ${code.split("").join(" ")}`}>{code}</p>
      <p className="ui-lead">Open <strong>{url.replace(/^https?:\/\//, "")}</strong> and type the code, or scan the picture.</p>
      {(qr ?? qrImage(url, "Scan to join this game")) ?? <p className="ui-hint">The picture to scan is not available on this screen. Type the code.</p>}
    </section>
  );
}

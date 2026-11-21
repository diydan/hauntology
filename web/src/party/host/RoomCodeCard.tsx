import type { ReactNode } from "react";

/**
 * The Room Code and the way in (party-mode 8.1): the four-letter code large, the join address as text, and the QR for it where there is one. The
 * address carries only the code (never a token). Until a QR encoder is chosen (Spike 1.2) the page offers the code and the address in words.
 */
export function RoomCodeCard({ code, origin, qr }: { code: string; origin: string; qr?: ReactNode }): ReactNode {
  const url = `${origin}/play?code=${encodeURIComponent(code)}`;
  return (
    <section className="ph-code ui-stack" aria-label="Join this game">
      <p className="ui-eyebrow">Join on your phone</p>
      <p className="ph-code-letters" aria-label={`Room Code ${code.split("").join(" ")}`}>{code}</p>
      <p className="ui-lead">Open <strong>{url.replace(/^https?:\/\//, "")}</strong> and type the code, or scan the picture.</p>
      {qr ?? <p className="ui-hint">The picture to scan is not available on this screen yet. Type the code.</p>}
    </section>
  );
}

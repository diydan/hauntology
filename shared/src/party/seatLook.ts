import type { PublicView } from "./views";

/**
 * Colour while at the table, black and white once in the haunting (party-mode 3.14 / the Seat Portrait). `seatLook` reads
 * only the public Poltergeist flag of a seat, so it reveals nothing hidden and needs no new message or field; the set of
 * Poltergeist seats only grows, so a seat never goes back to colour.
 */
export type SeatLook = "colour" | "mono";
export const seatLook = (view: Pick<PublicView, "players">, seat: number): SeatLook => (view.players.some((p) => p.seat === seat && p.poltergeist) ? "mono" : "colour");

export type SeatProfile = Readonly<{ portraitUrl: string; monoUrl?: string; preset?: boolean }>;
export type SeatPlayer = Readonly<{ seat: number; nickname: string; profile?: SeatProfile | null }>;
export type SeatPortrait =
  | Readonly<{ kind: "image"; url: string; filter: "none" | "grayscale(1)" }>
  | Readonly<{ kind: "chip"; label: string; seat: number; filter: "none" | "grayscale(1)" }>;

/**
 * What to draw: the contributed ghost's portrait in colour, or a nickname chip in the seat colour when there is none (and
 * for every Bot). In black and white a Preset Ghost uses its pre-made picture, any other ghost the same picture under a
 * greyscale filter (so no second image call), and a chip loses its colour the same way. Never a Suspect card.
 */
export function seatPortrait(player: SeatPlayer, look: SeatLook): SeatPortrait {
  const filter = look === "mono" ? "grayscale(1)" : "none";
  const p = player.profile;
  if (p === null || p === undefined) return { kind: "chip", label: player.nickname, seat: player.seat, filter };
  if (look === "mono" && p.preset === true && p.monoUrl !== undefined) return { kind: "image", url: p.monoUrl, filter: "none" };
  return { kind: "image", url: p.portraitUrl, filter };
}

/** The cross-fade on the first draw after the Becoming: at most 0.6 s, and a cut under reduced motion. */
export const SEAT_FADE_MS = 600;
export const seatFadeMs = (reducedMotion: boolean): number => (reducedMotion ? 0 : SEAT_FADE_MS);

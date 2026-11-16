/**
 * Pawns on the Spirit table (spirit-table 2.2): one Pawn per seated Player. Each Pawn stands in the room of that
 * Player's latest public `suggest` or `inspect` event (or beside the front door when there is none), wears monochrome
 * permanently as a Poltergeist, and shows a ring when it is that Player's Turn.
 */
export type TablePawn = Readonly<{
  seat: number;
  nickname: string;
  zone: string | "door";
  active: boolean;
  mono: boolean;
}>;

export type PawnPublicInput = Readonly<{
  phase?: string;
  active: number | null;
  seats: readonly Readonly<{ seat: number; nickname: string; poltergeist: boolean }>[];
  zones: readonly Readonly<{ id: string }>[];
  events: readonly Readonly<{ kind: string; seat?: number; zone?: string }>[];
}>;

export function pawnsOf(pub: PawnPublicInput): TablePawn[] {
  const validZones = new Set(pub.zones.map((z) => z.id));
  const lastZone = new Map<number, string>();
  for (const e of pub.events) {
    if ((e.kind === "suggest" || e.kind === "inspect") && typeof e.seat === "number" && typeof e.zone === "string") {
      if (validZones.size === 0 || validZones.has(e.zone)) lastZone.set(e.seat, e.zone);
    }
  }
  return pub.seats.map((s) => ({
    seat: s.seat,
    nickname: s.nickname,
    zone: lastZone.get(s.seat) ?? "door",
    active: pub.phase !== "ended" && pub.active === s.seat,
    mono: s.poltergeist,
  }));
}

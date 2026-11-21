import type { PublicSnapshot } from "../party/engine";
import { mulberry32 } from "../puzzles/rng";
import type { ClueHint } from "./clues";
import { HOUSE_STYLES, HUSHED_VOICE, NARRATOR_VOICE } from "./stock";

/**
 * Lyric Facts and scripted gothic templates (game-songs 2.1, Requirements 1.1, 2.2, 3.1, 6.3).
 *
 * Reads ONLY `PublicSnapshot` (never Hands, Residue placements, or unrevealed Deal) plus explicit
 * per-seat consent (`"Sing my name"`). Unconsented Players always appear under their role name.
 * Only the ending Ballad may name the Solution.
 */
export type SongsSetting = "off" | "stock" | "on";
export type MomentKind = "joined" | "wrong_accuse" | "becoming" | "detectives_win" | "house_wins";
export type SongKind = "opening" | MomentKind | "clue" | "ballad";

/** Per-seat explicit consent to include the player's own nickname (`true` => sing nickname). */
export type NameConsent = Readonly<Record<number, boolean>>;

export type SeatFact = Readonly<{
  seat: number;
  displayName: string;
  roleName: string;
  bot: boolean;
  poltergeist: boolean;
}>;

export type SolutionFact = Readonly<{
  suspect: string;
  zone: string;
  relic: string;
}>;

export type LyricFacts = Readonly<{
  round: number;
  hauntLevel: number;
  hauntMax: number;
  players: readonly SeatFact[];
  zones: readonly string[];
  relics: readonly string[];
  suspects: readonly string[];
  moments: readonly MomentKind[];
  solution: SolutionFact | null;
}>;

export type WrittenSong = Readonly<{
  kind: SongKind;
  title: string;
  style: string;
  voice: string;
  lyrics: string;
}>;

const cleanLabel = (raw: string): string => raw.replace(/[\r\n\t]+/gu, " ").replace(/ {2,}/gu, " ").trim();

export function roleNameForSeat(seat: number, poltergeist: boolean): string {
  return poltergeist ? `the Lodger in seat ${seat}` : `Detective in seat ${seat}`;
}

export function lyricFacts(
  view: PublicSnapshot,
  consent: NameConsent = {},
  options: { includeSolution?: boolean } = {},
): LyricFacts {
  const players: SeatFact[] = view.seats.map((s) => {
    const roleName = roleNameForSeat(s.seat, s.poltergeist);
    const allowed = consent[s.seat] === true;
    const nick = cleanLabel(s.nickname);
    return {
      seat: s.seat,
      displayName: allowed && nick !== "" ? nick : roleName,
      roleName,
      bot: s.bot,
      poltergeist: s.poltergeist,
    };
  });

  const nameOf = (id: string, pool: readonly { id: string; name: string }[]): string =>
    cleanLabel(pool.find((c) => c.id === id)?.name ?? id);

  const moments: MomentKind[] = [];
  if (players.some((p) => p.poltergeist)) moments.push("becoming");
  if (view.events.some((e) => e.kind === "accuse" && !e.right)) moments.push("wrong_accuse");
  if (view.phase === "ended" && view.ending !== null) {
    moments.push(view.ending.houseWins ? "house_wins" : "detectives_win");
  }

  let solution: SolutionFact | null = null;
  if (options.includeSolution === true && view.phase === "ended" && view.ending !== null) {
    solution = {
      suspect: nameOf(view.ending.solution.suspect, view.suspects),
      zone: nameOf(view.ending.solution.zone, view.zones),
      relic: nameOf(view.ending.solution.relic, view.relics),
    };
  }

  return {
    round: view.round,
    hauntLevel: view.haunt.level,
    hauntMax: view.haunt.max,
    players,
    zones: view.zones.map((z) => cleanLabel(z.name)),
    relics: view.relics.map((r) => cleanLabel(r.name)),
    suspects: view.suspects.map((s) => cleanLabel(s.name)),
    moments,
    solution,
  };
}

function pick<T>(items: readonly T[], rng: () => number, fallback: T): T {
  if (items.length === 0) return fallback;
  return items[Math.floor(rng() * items.length) % items.length]!;
}

export function writeLyrics(
  kind: SongKind,
  facts: LyricFacts,
  seed: number,
  options: { hint?: ClueHint | null } = {},
): WrittenSong {
  const rng = mulberry32(seed);
  const firstSeat = facts.players[0]?.displayName ?? "Detective in seat 1";
  const allGuests = facts.players.map((p) => p.displayName).slice(0, 3).join(", ") || firstSeat;
  const ghostSeat = facts.players.find((p) => p.poltergeist)?.displayName ?? firstSeat;
  const zoneName = pick(facts.zones, rng, "the darkened hall");
  const hauntWord = `the haunt stands at ${facts.hauntLevel}`;

  switch (kind) {
    case "opening": {
      const voice = NARRATOR_VOICE;
      return {
        kind,
        title: "Lanterns at the Door",
        style: `${HOUSE_STYLES.waltz}, ${voice}`,
        voice,
        lyrics: `[Verse]\nThe table waits for ${allGuests}\nBeside the stair of ${zoneName}\nRound ${facts.round} begins and ${hauntWord}\nAnd every clock is slow tonight\n[Chorus]\nOoh, keep your candle near the wall`,
      };
    }
    case "joined": {
      const voice = HUSHED_VOICE;
      return {
        kind,
        title: "Another Chair Pulled Back",
        style: `${HOUSE_STYLES.lullaby}, ${voice}`,
        voice,
        lyrics: `[Verse]\nSteps cross the boards near ${zoneName}\n${firstSeat} hears the lantern sigh\nNow ${hauntWord} of ${facts.hauntMax}\nAnd something watches from behind\n[Chorus]\nOoh, one more shadow in the room`,
      };
    }
    case "wrong_accuse": {
      const voice = NARRATOR_VOICE;
      return {
        kind,
        title: "The House Refuses",
        style: `${HOUSE_STYLES.march}, ${voice}`,
        voice,
        lyrics: `[Verse]\nA solemn seal was broken near ${zoneName}\nThe cold air bit ${firstSeat}'s hand\nWrongly named while ${hauntWord}\nThe true shade did not stir at all\n[Chorus]\nWait and listen, try again`,
      };
    }
    case "becoming": {
      const voice = HUSHED_VOICE;
      return {
        kind,
        title: "Behind the Wallpaper",
        style: `${HOUSE_STYLES.ballad}, ${voice}`,
        voice,
        lyrics: `[Verse]\nA breath went cold inside ${zoneName}\nNow ${ghostSeat} walks the other side\nRound ${facts.round} turns and ${hauntWord}\nNo harm was meant, a shade awoke\n[Chorus]\nOoh, tread lightly near the door`,
      };
    }
    case "detectives_win": {
      const voice = NARRATOR_VOICE;
      return {
        kind,
        title: "The Lamps Are Lit",
        style: `${HOUSE_STYLES.waltz}, ${voice}`,
        voice,
        lyrics: `[Verse]\nThrough quiet halls of ${zoneName}\n${allGuests} held the line till dawn\nThough ${hauntWord}, the case is closed\nThe heavy doors swing wide again\n[Chorus]\nThe lamps stay lit tonight`,
      };
    }
    case "house_wins": {
      const voice = HUSHED_VOICE;
      return {
        kind,
        title: "The House Keeps Its Own",
        style: `${HOUSE_STYLES.ballad}, ${voice}`,
        voice,
        lyrics: `[Verse]\nNo key was turned in ${zoneName}\nThe shadows closed round ${allGuests}\nMidnight fell as ${hauntWord}\nThe staircase keeps its secret still\n[Chorus]\nOoh, the house sleeps on alone`,
      };
    }
    case "clue": {
      const voice = HUSHED_VOICE;
      const clueLine = options.hint?.lyricLine ?? `The corners of ${zoneName} stay still tonight`;
      return {
        kind,
        title: "A Quiet Drift",
        style: `${HOUSE_STYLES.lullaby}, ${voice}`,
        voice,
        lyrics: `[Verse]\nListen where the candle leans\n${clueLine}\nLook closely where ${hauntWord}\nBefore the twelfth bell rings again\n[Chorus]\nOoh, mind what lies in plain sight`,
      };
    }
    case "ballad": {
      const voice = NARRATOR_VOICE;
      const solLine = facts.solution
        ? `It was ${facts.solution.suspect} in ${facts.solution.zone} with the ${facts.solution.relic}`
        : `The house held silence near ${zoneName}`;
      return {
        kind,
        title: "Ballad of the Case",
        style: `${HOUSE_STYLES.ballad}, ${voice}`,
        voice,
        lyrics: `[Verse]\nGather round for ${allGuests}'s tale\nRound ${facts.round} ended where ${hauntWord}\n${solLine}\nNow every whisper leaves the stair\n[Chorus]\nSo fades the haunting of this house`,
      };
    }
  }
}

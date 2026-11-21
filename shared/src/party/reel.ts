import { EVENT_LEVELS, SHOT_SOUND, SHOT_TEXT, SOUND_TEXT, reelShot, shotLine, type Shot, type ShotLine } from "./scenes";

/**
 * The Reel on the Host (puzzles Requirement 20) as a plain reducer: it reads only the public Haunt level and whether a Suggestion window or an
 * answer choice is open, and it says what to play and what to write in the log. No clock and no page: the Host's component owns those.
 *
 * - The shot follows the level; when the level rises the shot of the new level plays once (20.3), unless a window is open, in which case it
 *   waits for the window to close and is dropped when the level moves on (20.4).
 * - When the level falls (a Lull) the shot of the lower level is held on its last frame and nothing is said (20.9).
 * - A first sight of the Room (a Host that joins late) shows the shot of the level still, with no words and no play.
 * - Skip stops the shot at once (20.4).
 */
export type ReelState = Readonly<{
  /** The Haunt level this state has seen, or null before the first one. */
  level: number | null;
  max: number;
  /** The shot being played now, or null. */
  playing: Shot | null;
  /** The shot shown still (the last frame) when nothing plays; null before the first level. */
  held: Shot | null;
  /** A shot that rose while a window was open and still waits for it to close. */
  pending: Shot | null;
  blocked: boolean;
  /** How many times the Reel was skipped, so a screen drops the line it was waiting to show. */
  skips: number;
  /** How many plays have started, so a screen can tell a new play of the same shot from the old one. */
  plays: number;
  /** The words for the log and the live region, newest last; a rise adds one (and one more when it was a Haunt Event). */
  said: readonly string[];
  /** Why the level moved, for the screen: the last move was a rise, a fall or neither. */
  last: "rise" | "fall" | "none";
}>;

export const REEL_START: ReelState = { level: null, max: 10, playing: null, held: null, pending: null, blocked: false, skips: 0, plays: 0, said: [], last: "none" };

export type ReelInput =
  | Readonly<{ t: "level"; level: number; max: number }>
  | Readonly<{ t: "blocked"; blocked: boolean }>
  | Readonly<{ t: "skip" }>
  | Readonly<{ t: "done" }>;

/** The words for a rise: what the shot shows, and that a Haunt Event fired when the rise crossed an Event level (20.3). */
export function riseWords(from: number, to: number, max: number): string[] {
  const shot = reelShot(to, max);
  const crossed = EVENT_LEVELS.some((e) => e > from && e <= to && e < max);
  return [`The film moves on. ${SHOT_TEXT[shot]}`, ...(crossed ? ["A Haunt Event fired."] : [])];
}

export function stepReel(s: ReelState, i: ReelInput): ReelState {
  switch (i.t) {
    case "level": {
      const level = Math.max(0, Math.trunc(i.level));
      const max = Math.max(1, Math.trunc(i.max));
      const shot = reelShot(level, max);
      if (s.level === null) return { ...s, level, max, held: shot };
      if (level === s.level && max === s.max) return s;
      if (level > s.level) {
        const said = [...s.said, ...riseWords(s.level, level, max)];
        // a new rise replaces a play or a wait of the level before
        return s.blocked
          ? { ...s, level, max, said, playing: null, held: s.playing ?? s.held, pending: shot, last: "rise" }
          : { ...s, level, max, said, playing: shot, held: shot, pending: null, plays: s.plays + 1, last: "rise" };
      }
      if (level < s.level) return { ...s, level, max, playing: null, pending: null, held: shot, last: "fall" };
      return { ...s, max, held: shot };
    }
    case "blocked": {
      if (i.blocked === s.blocked) return s;
      if (i.blocked) return { ...s, blocked: true, playing: null, held: s.playing ?? s.held };
      return s.pending === null ? { ...s, blocked: false } : { ...s, blocked: false, playing: s.pending, held: s.pending, pending: null, plays: s.plays + 1 };
    }
    case "skip":
      return s.playing === null && s.pending === null ? s : { ...s, playing: null, pending: null, held: s.held ?? s.playing, skips: s.skips + 1 };
    case "done":
      return s.playing === null ? s : { ...s, playing: null, held: s.playing };
  }
}

export type LineMode = Readonly<{
  /** The line, always shown in words (20.8). */
  line: ShotLine;
  /** Whether the Host also asks for its recorded voice: narration on, no Event or ending line of the Room speaking or due, and not a Lull (20.9). */
  speak: boolean;
  /** Seconds from the start of the shot (0 for a still picture, which says it at once). */
  atS: number;
}>;

/** What to do with the line of the shot that plays now, or null when it has none or is a step back. */
export function lineFor(shot: Shot, o: Readonly<{ narrationOn: boolean; roomLineBusy: boolean; stillPicture: boolean; lull: boolean }>, lineAt: number): LineMode | null {
  const line = shotLine(shot);
  if (line === null || o.lull) return null;
  return { line, speak: o.narrationOn && !o.roomLineBusy, atS: o.stillPicture ? 0 : lineAt };
}

/** The sound of our own for the shot that plays now (20.6), only where the Master has sound on; at once when the picture is still. */
export function soundFor(shot: Shot, o: Readonly<{ soundOn: boolean }>): { sound: "scrape" | "knock"; words: string } | null {
  const sound = SHOT_SOUND[shot];
  return sound === undefined || !o.soundOn ? null : { sound, words: SOUND_TEXT[sound] };
}

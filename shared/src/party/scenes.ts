/**
 * Scenes made from footage on the Host (puzzles Requirements 19 to 21): where the clock shadow stands, which shot the Reel plays for a Haunt level,
 * the line written for each picture, and the title cards of the two endings. Pure functions: no page, no clock, nothing private. Every input is
 * public state (the Turn Clock, the Haunt level, who joined the haunting), never a hidden card or a private result.
 *
 * This is the TypeScript twin of the lab's `tools/playtest/js/scenes.js`; `scenes.test.ts` keeps the two the same with a parity test over every
 * level and maximum, so the lab page and the Host can never disagree about a shot.
 */

export const SHOT_NAMES = ["ship", "coffin", "streets", "mirror", "hand", "bed", "dawn", "house"] as const;
export type Shot = (typeof SHOT_NAMES)[number];

/** The clip file of each shot (without the extension: `.webm`, `.mp4` and a `.jpg` still sit beside it). */
export const SHOTS: Readonly<Record<Shot, string>> = {
  ship: "reel-ship", coffin: "reel-coffin", streets: "reel-streets", mirror: "reel-mirror",
  hand: "ai-hand-door-take2", bed: "ai-empty-bed-take1", dawn: "ai-dawn-door-take3", house: "ai-lights-out-take1",
};

/** What each shot shows, in words: the twin of the picture for the live region and the log. */
export const SHOT_TEXT: Readonly<Record<Shot, string>> = {
  ship: "A tall ship at the quay, its sails loose.",
  coffin: "Something rises in the ship's hold.",
  streets: "An empty street, and no one at the windows.",
  mirror: "A man rests in his chair. In the mirror behind him, a figure stands that is not in the room.",
  hand: "A shadow hand creeps along the wall to the door, and knocks.",
  bed: "A shadow leans over an empty bed.",
  dawn: "Morning comes to the quiet house. The door opens on the light.",
  house: "The windows go dark, one by one, and the front door swings open on the dark.",
};

export type ShotLine = Readonly<{ id: string; speaker: "whisper" | "keeper"; text: string }>;
/** The narration line written for each shot's own picture (Requirement 20.7): a row of `docs/story/party-lines.md`, word for word. */
export const SHOT_LINE: Readonly<Record<Shot, ShotLine>> = {
  ship: { id: "scene.ship.soft.1", speaker: "whisper", text: "A ship comes in, and I know that ship." },
  coffin: { id: "scene.crate.soft.1", speaker: "whisper", text: "Something below is waking. It is not me." },
  streets: { id: "scene.street.soft.1", speaker: "whisper", text: "The street is empty. I emptied it myself." },
  mirror: { id: "scene.mirror.soft.1", speaker: "whisper", text: "Look in the glass. There is someone in it who is not in the room. Do not be cross. It is only me." },
  hand: { id: "scene.hand-door.soft.1", speaker: "whisper", text: "That is me, at the door. I knock three times. Two seems timid, and four seems desperate. I shall wait." },
  bed: { id: "scene.bed.soft.1", speaker: "whisper", text: "I sit on the edge of the bed, very lightly, so as not to wake anyone. Nobody is in it. I look anyway." },
  house: { id: "scene.lights-out.soft.1", speaker: "whisper", text: "One window, then the next, then the last. Three floors, and I put out each one myself. Do not mind the dark. I will keep you company." },
  dawn: { id: "scene.dawn-door.dry.1", speaker: "keeper", text: "Well done. The case is closed, and the night has gone quietly home. I shall open the door now. Mind the step, and come again." },
};

/** When each line starts, in seconds from the start of its shot, so that it falls on the picture it is about (Requirement 20.8). */
export const LINE_AT: Readonly<Record<Shot, number>> = { ship: 0.1, coffin: 0.3, streets: 0.4, mirror: 1.2, hand: 0.8, bed: 0.3, house: 1.2, dawn: 4.3 };

const has = (o: object, k: string): boolean => Object.hasOwn(o, k);

/** The line written for a shot, or null when it has none. Total: an unknown shot gives null. */
export function shotLine(shot: string): ShotLine | null {
  return has(SHOT_LINE, shot) ? SHOT_LINE[shot as Shot] : null;
}

/** The Haunt levels at which a Haunt Event fires (party-mode 11.2), when the level is below the maximum. */
export const EVENT_LEVELS: readonly number[] = [3, 6, 9];

const whole = (n: number, fallback: number): number => (Number.isFinite(n) ? Math.trunc(n) : fallback);

/**
 * The Reel: the shot for a Haunt level. The film plays forward as the Haunt rises: the ship, the crate, the street, the mirror, the hand at the
 * door, the bed. The Events (3, 6 and 9) each get a shot of their own, and the maximum is the ending, not a shot. Total: a level past either end
 * is held at that end.
 */
export function reelShot(level: number, max: number): Shot {
  const m = Math.max(1, whole(max, 10));
  const l = Math.max(0, Math.min(whole(level, 0), m));
  if (l >= m) return "house";
  if (l >= 9) return "bed";
  if (l >= 7) return "hand";
  if (l === 6) return "mirror";
  if (l >= 4) return "streets";
  if (l === 3) return "coffin";
  return "ship";
}

/** The line for a Haunt level of the Reel, or null. */
export function reelLine(level: number, max: number): ShotLine | null {
  return shotLine(reelShot(level, max));
}

/** True when `level` is a Haunt Event level that is below the maximum, so the Reel marks it. */
export function isEventLevel(level: number, max: number): boolean {
  return EVENT_LEVELS.includes(level) && level < max;
}

/** The two sounds of our own that go with a Reel shot (Requirement 20.6) and their twins in words. */
export const SHOT_SOUND: Readonly<Partial<Record<Shot, "scrape" | "knock">>> = { coffin: "scrape", hand: "knock" };
export const SOUND_TEXT: Readonly<Record<"scrape" | "knock", string>> = { scrape: "A claw scrapes the wooden rim.", knock: "Someone knocks, slowly, at a door." };
/** When each sound starts, in seconds from the start of its shot (found on the frames and the sound of the clips). */
export const SOUND_AT: Readonly<Record<"scrape" | "knock", number>> = { scrape: 3.1, knock: 9.0 };

export function reelSound(level: number, max: number): "scrape" | "knock" | null {
  return SHOT_SOUND[reelShot(level, max)] ?? null;
}

/**
 * The clock shadow: where the shadow stands on the stairs, from 0 (the foot) to 1 (the top), for a Turn of `baseMs` with `remainingMs` left on
 * the clock. It follows the clock only, so Help (more time left) steps it back and Spook (less) steps it forward.
 */
export function shadowPosition(baseMs: number, remainingMs: number): number {
  if (!(baseMs > 0) || !Number.isFinite(remainingMs)) return 0;
  return Math.min(1, Math.max(0, 1 - remainingMs / baseMs));
}

/** The time inside a clip of `durationS` seconds for a position from 0 to 1, kept just inside the clip so the last frame can show. */
export function frameTime(position: number, durationS: number): number {
  if (!(durationS > 0)) return 0;
  return Math.min(1, Math.max(0, position)) * Math.max(0, durationS - 0.06);
}

/** The same position, moved on only once a second (for a Player who prefers reduced motion, saves data or has footage off). */
export function stepPosition(baseMs: number, remainingMs: number): number {
  if (!(baseMs > 0) || !Number.isFinite(remainingMs)) return 0;
  const wholeSecondsLeft = Math.ceil(Math.max(0, remainingMs) / 1000);
  return shadowPosition(baseMs, wholeSecondsLeft * 1000);
}

const nameList = (names: readonly string[]): string => {
  const n = names.filter((x) => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
  if (n.length <= 1) return n.join("");
  return `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
};

export type EndingCard = Readonly<{ shot: Shot; title: string; lines: readonly string[] }>;
/**
 * The title card of an ending: our own words on a card of our own (never the film's). WHEN the house wins the card says that the haunting
 * continues, that no one won and who joined the haunting (party-mode 14.2), and never uses the word Poltergeist.
 */
export function endingCard(outcome: "detectives" | "house", joined: readonly string[] = []): EndingCard {
  if (outcome === "detectives") return { shot: "dawn", title: "The night is over.", lines: ["The house lets go."] };
  const who = nameList(joined);
  return { shot: "house", title: "The haunting continues.", lines: ["No one won.", ...(who !== "" ? [`${who} joined the haunting.`] : [])] };
}

/** What the Host says for a clock that has run out (Requirement 19.5). */
export const CLOCK_RAN_OUT = "The clock ran out.";

/** Whether the shadow may be drawn at all, and how finely it moves, from the three things that change it (Requirement 19.3, 19.4). */
export type ShadowMode = "scrub" | "step" | "none";
export function shadowMode(o: Readonly<{ hasClock: boolean; footage: boolean; reducedMotion: boolean; saveData: boolean }>): ShadowMode {
  if (!o.hasClock) return "none";
  return o.footage && !o.reducedMotion && !o.saveData ? "scrub" : "step";
}

/** The clip the clock shadow scrubs (a stair, a shadow climbing it); 4.2 seconds, `media/stair-shadow.*` of the playtest site. */
export const CLOCK_SHADOW_CLIP = "stair-shadow";
export const CLOCK_SHADOW_SECONDS = 4.2;

/** The most often the Host sets the clip's time (Requirement 19.5). */
export const SHADOW_MIN_STEP_MS = 100;

/**
 * The reading the Host acts on for the clock shadow: the position to show, held while paused. `lastPosition` is what was shown before.
 * Nothing but the public Turn Clock goes in (Requirement 19.3).
 */
export function shadowReading(o: Readonly<{ baseMs: number | null; remainingMs: number | null; paused: boolean; mode: ShadowMode; lastPosition: number }>): number {
  if (o.mode === "none" || o.baseMs === null || o.remainingMs === null) return 0;
  if (o.paused) return o.lastPosition;
  return o.mode === "step" ? stepPosition(o.baseMs, o.remainingMs) : shadowPosition(o.baseMs, o.remainingMs);
}

import { CURATED_ZONE_NAMES, RELICS } from "../party/pool";
import { PRESET_GHOSTS } from "../party/preset-ghosts";

/**
 * The Stock Songs (game-songs Requirement 6, task 5.1): made once, played in every game. Each has a style (instruments,
 * voices, rhythm, mood: `house-style.md`), and lyrics or none for an instrumental. No song names a Player or a fact of one
 * game; no prompt or lyric names a real person or another work. Short songs: about 30 to 60 seconds of words.
 */
export type StockKind = "title" | "lobby" | "haunt" | "sting" | "fallback" | "relic" | "zone" | "ghost";
export type StockSong = Readonly<{ id: string; kind: StockKind; title: string; style: string; lyrics: string | null; voice?: string }>;

const SHORT = "short song, about 45 seconds";
/** Every song: horror first: creeping dread, dissonant, slow and sparse; never bright, bouncy or upbeat (owner, 2026-11-16). */
const MOOD = "horror, creeping dread, minor key, dissonant, very slow around 55 bpm, low drone, creaking wood, distant whispers, sparse, unsettling, not upbeat, not bouncy, no drums";
const S = {
  waltz: `slow mournful gothic waltz in three, ${MOOD}, celesta, detuned music box, bowed cello, ${SHORT}`,
  lullaby: `haunted lullaby, ${MOOD}, music box slowing down, child choir humming ooh far away, ${SHORT}`,
  march: `slow funeral march, ${MOOD}, low tuba, muted toy piano, cracked baritone narrator, deadpan and sorrowful, ${SHORT}`,
  ballad: `sad gothic ballad, ${MOOD}, lonely soprano, cello, celesta, ${SHORT}`,
};

const TITLE: StockSong = {
  id: "title", kind: "title", title: "Welcome to the House", style: `${S.waltz}, distant child choir ooh`,
  lyrics: "[Verse]\nCome in, come in, and wipe your feet\nThe stairs are eleven, the dust is sweet\nThe lamps are low and the clocks are wrong\nAnd the house has waited very long\n[Chorus]\nOoh, the house is awake tonight\nMind the ghosts, and hold the light",
};
const LOBBY: StockSong = {
  id: "lobby", kind: "lobby", title: "Waiting in the Hall", style: `gentle instrumental waltz loop, music box, plucked strings, quiet organ, seamless loop, ${SHORT}`, lyrics: null,
};
const HAUNT: StockSong[] = [
  { id: "haunt-low", kind: "haunt", title: "The House Breathes", style: `quiet instrumental ambience, distant music box, soft wind, slow, seamless loop, ${SHORT}`, lyrics: null },
  { id: "haunt-mid", kind: "haunt", title: "The House Stirs", style: `uneasy instrumental waltz, celesta out of tune, low strings, ticking clock, seamless loop, ${SHORT}`, lyrics: null },
  { id: "haunt-high", kind: "haunt", title: "The House Will Not Sleep", style: `tense instrumental, child choir ooh, organ, tuba pulse, lurching rhythm, seamless loop, ${SHORT}`, lyrics: null },
];
const STINGS: StockSong[] = [1, 2, 3].map((n) => ({
  id: `sting-${n}`, kind: "sting" as const, title: `Chapter End ${n}`,
  style: `very short instrumental sting, about 5 seconds, ${["a bell and a music box falling", "tuba and toy piano, a sorry shrug", "celesta run and a soft gong"][n - 1]}`,
  lyrics: null,
}));
const FALLBACKS: StockSong[] = [
  { id: "fb-joined", kind: "fallback", title: "One More for the Walls", style: S.lullaby,
    lyrics: "[Verse]\nA guest went quiet in the hall\nAnd stepped behind the papered wall\nThey did not scream, they did not run\nThey simply joined the haunting, one\n[Chorus]\nOoh, one more for the walls tonight" },
  { id: "fb-wrong", kind: "fallback", title: "A Regrettable Guess", style: S.march,
    lyrics: "[Verse]\nA name was said with all good will\nThe house went still, and stiller still\nIt was, I fear, the wrong one, quite\nWe will not speak of it tonight\n[Chorus]\nA guess, a guess, a sorry guess" },
  { id: "fb-becoming", kind: "fallback", title: "The Becoming", style: S.ballad,
    lyrics: "[Verse]\nThe candle bent, the curtain sighed\nA living guest went pale inside\nNo harm was meant, no harm was done\nA ghost was made, and that was one\n[Chorus]\nSo soft, so grey, so newly gone" },
  { id: "fb-detectives", kind: "fallback", title: "The Case Is Closed", style: `${S.waltz}, a quiet bittersweet relief`,
    lyrics: "[Verse]\nThe clues were few, the night was long\nThe answer hid but not for long\nThe guests have named the guilty shade\nAnd every lamp is newly made\n[Chorus]\nThe case is closed, the case is closed\nGo home, go home, the house has dozed" },
  { id: "fb-house", kind: "fallback", title: "The Haunting Continues", style: `${S.ballad}, a dark wink at the end`,
    lyrics: "[Verse]\nThe guests went home, or so they thought\nThe answer stayed, it was not caught\nThe house will keep it, as it should\nFor houses keep things, as houses would\n[Chorus]\nThe haunting continues, ooh" },
];
const RELIC_LINES: Record<string, string> = {
  r1: "The music box has lost its tune",
  r2: "The wax hand waves at no one now",
  r3: "The locket holds an empty face",
  r4: "The planchette has nothing to say",
  r5: "The silver key fits no door here",
  r6: "The bell is silent in its frame",
};
const RELIC_SONGS: StockSong[] = RELICS.map((r) => ({
  id: `relic-${r.id}`, kind: "relic" as const, title: `The ${r.name[0]!.toUpperCase()}${r.name.slice(1)}`, style: S.lullaby,
  lyrics: `[Verse]\n${RELIC_LINES[r.id]}\nIt sleeps where nobody looks\nNo guilt is on it, none at all\nCross it from your little books\n[Chorus]\nOoh, not this one, not this one`,
}));
const ZONE_SONGS: StockSong[] = CURATED_ZONE_NAMES.map((name) => ({
  id: `zone-${name.toLowerCase().replace(/^the /, "").replace(/[^a-z]+/g, "-")}`, kind: "zone" as const, title: name, style: S.lullaby,
  lyrics: `[Verse]\nNothing stirs in ${name}\nThe dust lies flat, the air is plain\nWhatever happened, happened elsewhere\nAnd will not happen here again\n[Chorus]\nOoh, not here, not here`,
}));
const GHOST_LINES: Record<string, string> = {
  "preset-1": "He lights the lamps that no one needs\nAnd counts them, one to ninety-three",
  "preset-2": "She pours the tea for two, then sighs\nThe second cup is always cold",
  "preset-3": "He sings one note, and sings it flat\nThe choir left, he did not mind",
  "preset-4": "He counts the stairs and gets eleven\nThe stairs insist that they are twelve",
  "preset-5": "She waits beside the bricked-up door\nIn grey, as she has done before",
  "preset-6": "She checks the beds, she smooths the sheets\nFor patients gone a hundred years",
  "preset-7": "He feeds a fire that went out long ago\nHis hands are black, his heart is warm",
  "preset-8": "She hides behind the nursery chair\nAnd hopes that you will find her there",
};
const GHOST_SONGS: StockSong[] = PRESET_GHOSTS.map((g) => ({
  id: `ghost-${g.id}`, kind: "ghost" as const, title: g.name, style: S.ballad,
  lyrics: `[Verse]\n${GHOST_LINES[g.id]}\n[Chorus]\nOoh, ${g.name}, ${g.name}`,
}));

/** Who sings each sung song (owner, 2026-11-16): set when a song is made, so it is part of the prompt. */
const NARRATOR = "lead vocal: a low deadpan male baritone narrator, dry and sorrowful, half spoken";
const HUSHED = "lead vocal: a hushed narrator voice, close and almost whispered";
const VOICES: Record<string, string> = {
  title: NARRATOR,
  "fb-joined": "lead vocal: a thin sad female voice, far away, with a child choir humming",
  "fb-wrong": NARRATOR,
  "fb-becoming": "lead vocal: a lonely soprano, fragile and breathy",
  "fb-detectives": NARRATOR,
  "fb-house": "lead vocal: a lonely soprano, then a low male whisper at the end",
  "ghost-preset-1": "lead vocal: an old cracked male voice, weary and slow",
  "ghost-preset-2": "lead vocal: a thin trembling female voice, an old widow",
  "ghost-preset-3": "lead vocal: a child choirboy voice, slightly flat, echoing as if underwater",
  "ghost-preset-4": "lead vocal: an old cracked male voice, muttering, counting",
  "ghost-preset-5": "lead vocal: a thin sad young female voice, distant",
  "ghost-preset-6": "lead vocal: a soft calm female voice, a gentle nurse, slightly hollow",
  "ghost-preset-7": "lead vocal: a deep rough male voice, smoky and tired",
  "ghost-preset-8": "lead vocal: a small child voice, whispered, playful and sad",
};
const voiceOf = (s: StockSong): string | null => (s.lyrics === null ? null : VOICES[s.id] ?? HUSHED);

export const STOCK_SONGS: readonly StockSong[] = [TITLE, LOBBY, ...HAUNT, ...STINGS, ...FALLBACKS, ...RELIC_SONGS, ...ZONE_SONGS, ...GHOST_SONGS].map((s) => {
  const v = voiceOf(s);
  return v === null ? s : { ...s, voice: v, style: `${s.style}, ${v}` };
});

/** When each Stock Song plays (game-songs 6.4, 6.5). The catalogue in `docs/songs.md` follows this. */
export const WHEN: Record<string, string> = {
  title: "Home and the Gallery, looping quietly; stops when a case or Wander starts",
  lobby: "The lobby while players join; replaced by the opening song once it is ready",
  "haunt-low": "During play while the Haunt is 0 to 3",
  "haunt-mid": "During play while the Haunt is 4 to 6",
  "haunt-high": "During play while the Haunt is 7 or more",
  "sting-1": "End of a Round (chapter), in turn with the other two stings",
  "sting-2": "End of a Round (chapter), in turn with the other two stings",
  "sting-3": "End of a Round (chapter), in turn with the other two stings",
  "fb-joined": "A Player joins the haunting, when no Moment Song for it is ready",
  "fb-wrong": "A wrong Accusation, when no Moment Song for it is ready",
  "fb-becoming": "The Becoming, when no Moment Song for it is ready",
  "fb-detectives": "The ending, Detectives win, when the Ballad is not ready",
  "fb-house": "The ending, the house wins, when the Ballad is not ready",
};

export function whenOf(song: StockSong): string {
  const fixed = WHEN[song.id];
  if (fixed !== undefined) return fixed;
  if (song.kind === "relic") return `A quiet scene, only once the public log shows the ${song.title.replace(/^The /, "").toLowerCase()} is not the answer; otherwise as ambience`;
  if (song.kind === "zone") return `A quiet scene, only once the public log shows ${song.title} is not the answer (searched and empty); otherwise as ambience`;
  if (song.kind === "ghost") return `Softly under ${song.title}'s appearances (its card shown, its portrait on screen); never tied to a hidden fact`;
  return "Not used";
}

/** Words no prompt or lyric may contain: real makers and other works (house-style.md). Checked by the test. */
export const FORBIDDEN_WORDS = ["burton", "elfman", "anderson", "snicket", "baudelaire", "beetlejuice", "skellington", "coraline", "addams", "wednesday", "corpse bride", "edward", "sweeney", "grand budapest", "style of"];

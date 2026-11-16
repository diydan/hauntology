/**
 * The Library (ghost-voice Requirements 1.8 and 1.9, task 2.18): the list of every spoken, scripted line and the voices
 * that speak it, so each can be rendered once, ahead of time. Pure. The only input is the banks (public story text):
 * no state, no Hand, no Solution, so nothing is ever prepared because of a secret.
 *
 * Text-only lines (the Lodger `aside`) are never spoken, so they are never listed. The shared Lodger bank is listed
 * once per Lodger Voice. A line is listed by its spoken part: the leading whole sentences, up to 240 characters,
 * stopping before the first sentence that holds player text.
 */
import { THRESHOLDS, HAUNT_OPTIONS } from "../party/haunt";
import { canonicalSpeechKey, normalise } from "./key";
import { MAX_SPOKEN_CHARS, FINITE_PLACEHOLDER_NAMES, spokenPart } from "./speakable";
import { LODGER_VOICE_ORDER, SPEAKER_ORDER, steeringTag, voiceFor } from "./voices";
import type { Speaker, VoiceId } from "./voices";

/** One authored line. `spoken: false` means text only: shown, never spoken, never rendered. */
export interface BankLine {
  readonly id: string;
  readonly kind: string;
  readonly text: string;
  readonly spoken: boolean;
}

export interface ScriptedBanks {
  readonly whisper?: readonly BankLine[];
  readonly keeper?: readonly BankLine[];
  readonly lodger?: readonly BankLine[];
}

/** Values for the finite placeholders, e.g. `{ weather: ["clear", "rain", ...] }`. Required only for a placeholder a line uses. */
export type FinitePlaceholders = Readonly<Record<string, readonly string[]>>;

export interface LibraryEntry {
  readonly speaker: Speaker;
  readonly voice: VoiceId;
  /** The plain spoken text: no Steering Tag, no markup, no placeholder, at most 240 characters. */
  readonly spoken: string;
  /** The ids of the bank lines that give this text (several lines may share one spoken text). */
  readonly sources: readonly string[];
}

/** What Inworld charges, in US dollars per million characters (an assumption until Spike ghost-voice 1.1 checks the bill). */
export const PRICE_USD_PER_MILLION_CHARS = 25;

function expandFinite(text: string, finite: FinitePlaceholders, lineId: string): string[] {
  const names: string[] = [];
  for (const m of text.matchAll(/\{([a-z]+)\}/g)) {
    const name = m[1];
    if (name !== undefined && FINITE_PLACEHOLDER_NAMES.includes(name) && !names.includes(name)) names.push(name);
  }
  let results = [text];
  for (const name of names) {
    const values = finite[name];
    if (values === undefined || values.length === 0) throw new Error(`library: no values for {${name}} (line ${lineId})`);
    results = results.flatMap((t) => values.map((v) => t.split(`{${name}}`).join(v)));
  }
  return results;
}

/** The voices a Speaker is rendered in: one for the Whisper and the Keeper, all six Lodger Voices for the Lodger. */
function voicesOf(speaker: Speaker): VoiceId[] {
  return speaker === "lodger"
    ? LODGER_VOICE_ORDER.map((v) => voiceFor("lodger", "inworld", v))
    : [voiceFor(speaker, "inworld")];
}

/**
 * Every (voice, spoken text) pair of the scripted banks, in a fixed order, with no duplicate. Throws if a spoken part
 * holds markup, a bracketed cue or an unresolved placeholder: those are bugs in the story text, found at build time.
 */
export function buildLibrary(banks: ScriptedBanks, finite: FinitePlaceholders = {}): LibraryEntry[] {
  const entries = new Map<string, { speaker: Speaker; voice: VoiceId; spoken: string; sources: string[] }>();
  for (const speaker of SPEAKER_ORDER) {
    const voices = voicesOf(speaker);
    for (const line of banks[speaker] ?? []) {
      if (!line.spoken) continue;
      for (const text of expandFinite(line.text, finite, line.id)) {
        const spoken = normalise(spokenPart(text, MAX_SPOKEN_CHARS));
        if (spoken === "") continue; // subtitle only
        if (/[[\]<>`*#{}]/.test(spoken)) {
          throw new Error(`library: the spoken part of ${line.id} holds markup, a bracketed cue or a placeholder`);
        }
        for (const voice of voices) {
          const mapKey = `${voice}\u0000${spoken}`;
          const existing = entries.get(mapKey);
          if (existing === undefined) entries.set(mapKey, { speaker, voice, spoken, sources: [line.id] });
          else if (!existing.sources.includes(line.id)) existing.sources.push(line.id);
        }
      }
    }
  }
  return [...entries.values()];
}

/** The characters sent to Inworld for one file: the Steering Tag and the spoken text. */
export function requestChars(entry: LibraryEntry): number {
  return steeringTag(entry.speaker).length + entry.spoken.length;
}

/** Files, characters and an estimated price for a list of entries (all of them, or only the missing ones). */
export function estimateLibrary(entries: readonly LibraryEntry[]): { files: number; chars: number; usd: number } {
  const chars = entries.reduce((sum, e) => sum + requestChars(e), 0);
  return { files: entries.length, chars, usd: Math.round((chars / 1_000_000) * PRICE_USD_PER_MILLION_CHARS * 10_000) / 10_000 };
}

/**
 * The public facts `prefetchPlan` may read: the phase and Haunt of the party
 * engine's `PublicSnapshot`, and how long until the host's midnight (party-mode
 * Requirement 15.2). Nothing else exists on this type, so no Solution, Hand or
 * Accusation verdict can be read by mistake.
 */
export type PrefetchView = Readonly<{
  phase: string;
  haunt: Readonly<{ level: number; max: number }>;
  /** Minutes until the host's midnight, or null when the strike is off or unknown. */
  minutesToMidnight: number | null;
}>;

/** Warm the midnight lines from this long before the hour. */
export const PREFETCH_MIDNIGHT_WITHIN_MINUTES = 60;

/** The line kind a source id names: `haunt.cold-spot.dry.1` is the cold-spot Haunt Event line. */
function sourceKind(id: string): string {
  const [head, next] = id.split(".");
  return head === "haunt" && next !== undefined ? `haunt.${next}` : (head ?? "");
}

/**
 * The canonical speech keys worth warming because they play whatever happens
 * (ghost-voice design, "Prefetch without secrets"; Requirement 1.9): during play,
 * every `turn-start` line; when the Haunt sits one level below a threshold that can
 * still fire, every Haunt Event line of all four options (all of them, so the seeded
 * choice stays hidden); and within an hour of the host's midnight, every midnight
 * line. Fixed order (turn-start, Haunt, midnight), no duplicates; the caller hashes
 * a key with `libraryKey` when it needs the R2 address. Nothing here is a confession,
 * a reveal or an ending: those depend on secrets and are never warmed.
 */
export function prefetchPlan(view: PrefetchView, entries: readonly LibraryEntry[]): string[] {
  if (view.phase !== "playing") return [];
  const groups: string[][] = [["turn-start"]];
  const oneBelow = THRESHOLDS.some((t) => view.haunt.level === t - 1 && t < view.haunt.max);
  if (oneBelow) groups.push(HAUNT_OPTIONS.map((option) => `haunt.${option}`));
  const toMidnight = view.minutesToMidnight;
  if (toMidnight !== null && Number.isFinite(toMidnight) && toMidnight >= 0 && toMidnight <= PREFETCH_MIDNIGHT_WITHIN_MINUTES) groups.push(["midnight"]);

  const keys: string[] = [];
  const seen = new Set<string>();
  for (const kinds of groups) {
    for (const entry of entries) {
      if (!entry.sources.some((id) => kinds.includes(sourceKind(id)))) continue;
      const key = canonicalSpeechKey(entry.voice, entry.spoken);
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  return keys;
}

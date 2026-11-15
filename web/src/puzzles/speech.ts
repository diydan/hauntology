/**
 * Say a word aloud for the Spirit board, for local demos and tests of a phone's own voice. In the real game the word is
 * never on the phone: the Room plays the Whisper's prerendered line (the word, a short clue, the word again). This file
 * picks the clearest English voice a phone has (voices vary a lot: some are muffled, some are novelty voices) and speaks
 * the same three parts. Pure except `speakWord` and `createBrowserHear`, which take the speech host as an argument.
 */
export type VoiceLike = Readonly<{ name?: string; lang?: string; voiceURI?: string; localService?: boolean; default?: boolean }>;
export type UtteranceLike = { voice: VoiceLike | null; lang: string; rate: number; pitch: number; volume: number };
export type SynthLike = Readonly<{ getVoices?: () => readonly VoiceLike[]; cancel: () => void; speak: (u: UtteranceLike) => void }>;
export type UtteranceCtor = new (text: string) => UtteranceLike;
export type SpeechHost = Readonly<{ synth: SynthLike | undefined; Utterance: UtteranceCtor | undefined }>;

const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Kathy|Ralph)\b/i;
const GOOD = /(enhanced|premium|siri|neural|natural|google|samantha|daniel|karen|moira|serena|ava|allison|susan|tessa|fiona|alex)/i;

/** How clear a voice is likely to be: higher is better, minus infinity means never use it (not English, or a novelty voice). */
export function scoreVoice(v: VoiceLike | null | undefined): number {
  if (!v || typeof v.lang !== "string") return Number.NEGATIVE_INFINITY;
  const lang = v.lang.replace("_", "-").toLowerCase();
  let s = 0;
  if (lang.startsWith("en-us") || lang.startsWith("en-gb")) s += 30;
  else if (lang.startsWith("en")) s += 20;
  else return Number.NEGATIVE_INFINITY; // the words are English
  const name = v.name ?? "";
  const uri = v.voiceURI ?? "";
  if (NOVELTY.test(name)) return Number.NEGATIVE_INFINITY;
  if (/compact/i.test(name) || /compact/i.test(uri)) s -= 15;
  if (GOOD.test(name) || GOOD.test(uri)) s += 25;
  if (v.localService === false) s += 5; // network voices are often the clearest
  if (v.default === true) s += 3;
  return s;
}

/** The best English voice from a list, or null when there is none. */
export function pickVoice<T extends VoiceLike>(voices: readonly T[] | null | undefined): T | null {
  let best: T | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const v of voices ?? []) {
    const s = scoreVoice(v);
    if (s > bestScore) { best = v; bestScore = s; }
  }
  return best;
}

/** What to say for a word: the word, the clue, the word again (clear on a poor voice, and the clue tells similar words apart). */
export function sayings(word: string, clue?: string): string[] {
  const w = word.toLowerCase();
  return clue ? [w, clue, w] : [w, w];
}

/** The speech of this browser, or nothing where there is none. */
export function browserSpeechHost(): SpeechHost {
  const g = globalThis as unknown as { speechSynthesis?: SynthLike; SpeechSynthesisUtterance?: UtteranceCtor };
  return { synth: g.speechSynthesis, Utterance: g.SpeechSynthesisUtterance };
}

/** Speak the sayings one after another. Returns false when the phone has no speech voice (the clue on screen is the fallback). */
export function speakWord(word: string, clue: string | undefined, host: SpeechHost = browserSpeechHost()): boolean {
  const { synth, Utterance } = host;
  if (!synth || !Utterance) return false;
  const voice = pickVoice(synth.getVoices?.());
  synth.cancel();
  for (const text of sayings(word, clue)) {
    const u = new Utterance(text);
    if (voice) { u.voice = voice; u.lang = voice.lang ?? "en-US"; } else u.lang = "en-US";
    u.rate = 0.85;
    u.pitch = 1;
    u.volume = 1;
    synth.speak(u);
  }
  return true;
}

/** A `hear` for the Spirit board in a local demo: speaks the word with its clue. */
export function createBrowserHear(word: string, clue: string | undefined, host: SpeechHost = browserSpeechHost()): () => boolean {
  return () => speakWord(word, clue, host);
}

/** Stop any speech in progress (a Lock closing). */
export function cancelSpeech(host: SpeechHost = browserSpeechHost()): void {
  try { host.synth?.cancel(); } catch { /* a phone with no speech has nothing to stop */ }
}

// Picking a clear voice for a spoken word. Phone voices vary a lot: some are muffled, some are novelty voices
// (macOS has "Whisper", "Bad News" and friends). Pure: takes the voice list, returns the best one.
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Kathy|Ralph)\b/i;
const GOOD = /(enhanced|premium|siri|neural|natural|google|samantha|daniel|karen|moira|serena|ava|allison|susan|tessa|fiona|alex)/i;

export function scoreVoice(v) {
  if (!v || typeof v.lang !== 'string') return -Infinity;
  const lang = v.lang.replace('_', '-').toLowerCase();
  let s = 0;
  if (lang.startsWith('en-us') || lang.startsWith('en-gb')) s += 30;
  else if (lang.startsWith('en')) s += 20;
  else return -Infinity; // the words are English
  if (NOVELTY.test(v.name || '')) return -Infinity;
  if (/compact/i.test(v.name || '') || /compact/i.test(v.voiceURI || '')) s -= 15;
  if (GOOD.test(v.name || '') || GOOD.test(v.voiceURI || '')) s += 25;
  if (v.localService === false) s += 5; // network voices are often the clearest
  if (v.default) s += 3;
  return s;
}
/** The best English voice from a list, or null when there is none. */
export function pickVoice(voices) {
  let best = null, bestScore = -Infinity;
  for (const v of voices || []) { const s = scoreVoice(v); if (s > bestScore) { best = v; bestScore = s; } }
  return best;
}
/** What to say for a word: the word, the clue, the word again (clear on a poor voice, and the clue disambiguates). */
export function sayings(word, clue) {
  const w = String(word).toLowerCase();
  return clue ? [w, clue, w] : [w, w];
}
/** Speak the sayings one after another with short pauses. Returns false when the phone has no speech voice. */
export function speakWord(word, clue, synth = globalThis.speechSynthesis, Utter = globalThis.SpeechSynthesisUtterance) {
  if (!synth || !Utter) return false;
  const voice = pickVoice(synth.getVoices?.());
  synth.cancel();
  for (const text of sayings(word, clue)) {
    const u = new Utter(text);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-US';
    u.rate = 0.85; u.pitch = 1; u.volume = 1;
    synth.speak(u);
  }
  return true;
}

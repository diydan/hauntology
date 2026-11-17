/**
 * Making a `VoiceLine` from a reply the engine approved (ghost-voice 2.2 and 3.5). Pure: the id and the clock are parameters.
 *
 * - A reply the engine's own validator refuses is not a line (`null`): the same `validateGhostReply` the narrator uses, and no second list of banned words.
 *   One exception, found by playing 1,440 scripted turns: the last memory and its farewell make a scripted ending of more than four sentences, which the
 *   validator refuses for length alone. A reply refused only for length or sentence count is kept as a line, and its spoken part (at most 240 characters,
 *   all that is ever sent) must pass the validator on its own, or the line has nothing to say. Any other refusal is still no line.
 * - `spoken` is the leading whole sentences, at most 240 characters, and stops before the first sentence that holds any `playerText`, ignoring case. That
 *   sentence stays in the Subtitle. So no word a visitor typed is sent to a speech model, and every spoken text stays one a Library line could be.
 * - A line never carries a Steering Tag: the tag is added in one place, the Inworld wrapper.
 */
import { validateGhostReply } from "../ghost/narration";
import type { LineKind, VoiceLine } from "./line";
import { MAX_SPOKEN_CHARS, splitSentences, spokenPart } from "./speakable";
import { voiceFor, type LodgerVoice, type Speaker } from "./voices";

export type ToVoiceLineInput = {
  id: string;
  text: string;
  kind: LineKind;
  speaker: Speaker;
  lodgerVoice?: LodgerVoice | undefined;
  /** Texts a visitor supplied that may have reached `text` (what they typed, a nickname, a place name). */
  playerText: readonly string[];
  now: number;
};

const squeeze = (t: string): string => t.replace(/[\n\r\t]+/gu, " ").replace(/ {2,}/gu, " ").trim();

/**
 * What the Inworld wrapper refuses to send: a bracket (a Steering Tag is one), markup, a code fence, a heading mark, a placeholder's braces. The engine's validator
 * lets some of these through in a reply, so a line cuts its spoken part before the first sentence that has one: that sentence stays in the Subtitle.
 */
const UNSAFE_TO_SPEAK = /[[\]<>`*#{}]/;
function beforeUnsafe(spoken: string): string {
  const parts: string[] = [];
  for (const sentence of splitSentences(spoken)) {
    if (UNSAFE_TO_SPEAK.test(sentence)) break;
    parts.push(sentence);
  }
  return parts.join(" ");
}

export function toVoiceLine(i: ToVoiceLineInput): VoiceLine | null {
  const whole = validateGhostReply(i.text);
  let text: string;
  if (whole.ok) text = whole.text;
  else if (whole.reason === "too_long" || whole.reason === "too_many_sentences") text = squeeze(i.text); // only the spoken part is checked, below
  else return null; // a link, markup, out-of-fiction, real-world or non-English text, a control character or nothing: no audio at all
  if (text === "" || text.length > 2000) return null;

  let spoken = beforeUnsafe(spokenPart(text, MAX_SPOKEN_CHARS, i.playerText));
  // A reply that was only too long or had too many sentences (the scripted ending: a memory, then its farewell) is still a line, but what would be SENT to
  // the speech model must pass the engine's validator on its own: trailing sentences are dropped until it does (the validator allows four), and if none
  // does the line is Subtitle only.
  if (!whole.ok && spoken !== "") {
    const parts = splitSentences(spoken);
    while (parts.length > 0 && !validateGhostReply(parts.join(" ")).ok) parts.pop();
    spoken = parts.join(" ");
  }
  return { id: i.id, kind: i.kind, speaker: i.speaker, text, spoken, voice: voiceFor(i.speaker, "inworld", i.lodgerVoice), createdAt: i.now };
}

/** The shortest word of a typed text that counts as a detail worth keeping out of speech, in letters. Shorter words are the ordinary words of any reply. */
export const PLAYER_WORD_MIN_LETTERS = 6;

/**
 * What a visitor's typed words contribute to `playerText`: the whole phrase, and each word of six letters or more (a name, a place, a thing they noticed).
 * Short words ("who", "you", "there") are the ordinary words of any reply and are not kept out, so a ghost that says "there" is still heard; longer ones
 * ("kitchen", a name) are. Nothing typed gives nothing.
 */
export function playerTextOf(typed: string | undefined): string[] {
  const phrase = (typed ?? "").trim();
  if (phrase === "") return [];
  const words = phrase.split(/[^\p{L}\p{N}']+/u).filter((w) => [...w].length >= PLAYER_WORD_MIN_LETTERS);
  return [...new Set([phrase, ...words])];
}

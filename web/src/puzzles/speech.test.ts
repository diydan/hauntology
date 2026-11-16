import { describe, expect, it } from "vitest";
import { cancelSpeech, createBrowserHear, pickVoice, sayings, scoreVoice, speakWord, type SpeechHost, type SynthLike, type UtteranceLike, type VoiceLike } from "./speech";

const v = (over: VoiceLike): VoiceLike => ({ name: "Voice", lang: "en-US", localService: true, ...over });

class FakeUtterance implements UtteranceLike {
  voice: VoiceLike | null = null;
  lang = "";
  rate = 0;
  pitch = 0;
  volume = 0;
  constructor(readonly text: string) {}
}
function fakeHost(voices: VoiceLike[]): { host: SpeechHost; spoken: FakeUtterance[]; log: string[] } {
  const spoken: FakeUtterance[] = [];
  const log: string[] = [];
  const synth: SynthLike = { getVoices: () => voices, cancel: () => { log.push("cancel"); }, speak: (u) => { log.push("speak"); spoken.push(u as FakeUtterance); } };
  return { host: { synth, Utterance: FakeUtterance }, spoken, log };
}

describe("scoreVoice and pickVoice", () => {
  it("never picks a voice that is not English, a novelty voice, or one with no language", () => {
    expect(scoreVoice(v({ lang: "fr-FR" }))).toBe(Number.NEGATIVE_INFINITY);
    expect(scoreVoice(v({ name: "Whisper" }))).toBe(Number.NEGATIVE_INFINITY);
    expect(scoreVoice(v({ name: "Bad News" }))).toBe(Number.NEGATIVE_INFINITY);
    expect(scoreVoice({ name: "x" })).toBe(Number.NEGATIVE_INFINITY);
    expect(scoreVoice(null)).toBe(Number.NEGATIVE_INFINITY);
    expect(scoreVoice(undefined)).toBe(Number.NEGATIVE_INFINITY);
  });

  it("ranks US and UK English over other English, good names over plain ones, and compact voices lower", () => {
    const us = scoreVoice(v({ lang: "en-US" }));
    expect(scoreVoice(v({ lang: "en_GB" }))).toBe(us); // an underscore is fine
    expect(scoreVoice(v({ lang: "en-AU" }))).toBeLessThan(us);
    expect(scoreVoice(v({ name: "Samantha" }))).toBeGreaterThan(us);
    expect(scoreVoice(v({ name: "Voice (Enhanced)" }))).toBeGreaterThan(us);
    expect(scoreVoice(v({ voiceURI: "com.apple.voice.compact.en-US.Zed" }))).toBeLessThan(us);
    expect(scoreVoice(v({ name: "Zed Compact" }))).toBeLessThan(us);
    expect(scoreVoice(v({ localService: false }))).toBeGreaterThan(us);
    expect(scoreVoice(v({ default: true }))).toBeGreaterThan(us);
  });

  it("picks the best voice, and null when there is none", () => {
    const best = v({ name: "Google US English", localService: false });
    expect(pickVoice([v({ lang: "de-DE" }), v({ name: "Whisper" }), v({}), best, v({ lang: "en-AU" })])).toBe(best);
    expect(pickVoice([v({ lang: "de-DE" }), v({ name: "Zarvox" })])).toBeNull();
    expect(pickVoice([])).toBeNull();
    expect(pickVoice(undefined)).toBeNull();
  });
});

describe("sayings and speakWord", () => {
  it("says the word, the clue, then the word again, in lower case; with no clue the word twice", () => {
    expect(sayings("DOOR", "you open it to come in")).toEqual(["door", "you open it to come in", "door"]);
    expect(sayings("ELM")).toEqual(["elm", "elm"]);
    expect(sayings("ELM", "")).toEqual(["elm", "elm"]);
  });

  it("clears what was being said, then queues every part slowly with the chosen voice", () => {
    const good = v({ name: "Samantha" });
    const { host, spoken, log } = fakeHost([v({ lang: "de-DE" }), good]);
    expect(speakWord("STAR", "it shines at night", host)).toBe(true);
    expect(log).toEqual(["cancel", "speak", "speak", "speak"]);
    expect(spoken.map((u) => u.text)).toEqual(["star", "it shines at night", "star"]);
    for (const u of spoken) {
      expect(u.voice).toBe(good);
      expect(u.lang).toBe("en-US");
      expect(u.rate).toBe(0.85);
      expect(u.pitch).toBe(1);
      expect(u.volume).toBe(1);
    }
  });

  it("still speaks with the phone's own default voice when no good English voice exists", () => {
    const { host, spoken } = fakeHost([v({ lang: "de-DE" })]);
    expect(speakWord("OAK", "a strong tree", host)).toBe(true);
    expect(spoken.length).toBe(3);
    expect(spoken[0]?.voice).toBeNull();
    expect(spoken[0]?.lang).toBe("en-US");
  });

  it("returns false, and says nothing, where the phone has no speech", () => {
    expect(speakWord("OAK", "a tree", { synth: undefined, Utterance: undefined })).toBe(false);
    const { host } = fakeHost([]);
    expect(speakWord("OAK", "a tree", { synth: host.synth, Utterance: undefined })).toBe(false);
    expect(speakWord("OAK", "a tree", { synth: undefined, Utterance: FakeUtterance })).toBe(false);
  });

  it("builds a hear for a demo that speaks the same line each time, and cancel stops speech without throwing", () => {
    const { host, spoken, log } = fakeHost([v({})]);
    const hear = createBrowserHear("BIRD", "it can fly", host);
    expect(hear()).toBe(true);
    expect(hear()).toBe(true);
    expect(spoken.length).toBe(6);
    cancelSpeech(host);
    expect(log.at(-1)).toBe("cancel");
    expect(() => cancelSpeech({ synth: undefined, Utterance: undefined })).not.toThrow();
    const throwing: SpeechHost = { synth: { cancel: () => { throw new Error("no"); }, speak: () => {} }, Utterance: FakeUtterance };
    expect(() => cancelSpeech(throwing)).not.toThrow();
  });
});

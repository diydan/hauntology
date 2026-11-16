import { hashText } from "./rng";
import type { Archetype, Band, Bearing, Directive, Seed, Voice } from "./types";

/**
 * The words of the ghost when no model speaks (Requirement 5.4): at least five lines for every kind of Directive, in each of two voices, picked
 * with a number from the seeded generator. They carry no digits, no addresses and no markup, never a coordinate, and nothing about
 * the real world. A game played entirely with these can be finished (Requirement 7.1): the lines only ever word what the engine decided.
 */
export const pick = <T>(list: readonly T[], r: number): T => list[Math.min(list.length - 1, Math.max(0, Math.floor(r * list.length)))] as T;

export function voiceOfPreset(presetId: string | undefined): Voice {
  return presetId === undefined || presetId === "" ? "wistful" : hashText(presetId) % 2 === 0 ? "wistful" : "stern";
}

type Kind = "echo" | "tease" | "hint" | "ambient" | "ending" | "refuse";
export const LINES: Readonly<Record<Voice, Readonly<Record<Kind, readonly string[]>>>> = {
  wistful: {
    echo: [
      "You have been here before, and so has the spot. It remembers your shoes. I have asked it to go on remembering, and it is very obliging.",
      "This place has already given you what it had. Stay a moment anyway. It has grown fond of the sound of you.",
      "I know this corner, and now it knows you. Do go on. The rest of the room is looking forward to it.",
      "Something was here, and you took it with you. What is left is only quiet, and the quiet has noticed you.",
      "We have been through this one together. Look elsewhere, gently, and do not mind the floor. It is only counting.",
    ],
    tease: [
      "Something waits here, and you are {band} to it. It has been waiting so politely.",
      "I can feel it stirring. You are {band} to something I have not said aloud, and it has heard you coming.",
      "Not yet, but you are {band}. Walk slowly. It would be a pity to startle it, or to be startled.",
      "The air changes where a memory is kept. You are {band} to such a place, and the air has noticed.",
      "Close your eyes and you might feel it: you are {band} to what I am keeping. It is keeping you in mind.",
    ],
    hint: [
      "Something is {band}, {dir}. Walk toward it, if you will. I do like to watch you walk.",
      "I would look {dir}. It is {band}. Mind the floor on the way. It has opinions.",
      "{dir}, {band}: that is where I keep the next one. Do come along. I shall be here when you arrive.",
      "Turn a little. It is {dir}, and {band}. The house will not mind, and it will watch.",
      "If you are lost, go {dir}. What you want is {band}. Being lost here is rather restful.",
    ],
    ambient: [
      "The room is quiet. I am still here, and so are you. We are agreed on that.",
      "Dust turns in the light, as it always did. It has learned your name, I think.",
      "I remember more than I can say. Walk on, and I will try, though the telling is slow.",
      "Nothing moves, and yet it feels as if something might. Do not look round. It is shy.",
      "The place holds its breath, and so do I. It is a habit we cannot break, being so fond of company.",
    ],
    ending: [
      "That is all of it. Thank you for finding what was left of me. I will keep the light on, and the door, and a chair.",
      "You have all three now. Carry them carefully, and come back whenever you like. The house will know the day.",
      "It is complete. I was only ever waiting to be remembered, and now I shall be, by you, for a long time.",
      "That was the last of it. Go well. This place will remember you too, and rather better than you would like.",
      "Now you know. Leave the door as you found it. It will be wanting you back.",
    ],
    refuse: [
      "I am only what is left of this place. Ask me about the room, and I will tell you what I can. Ask it kindly. It listens.",
      "I cannot be anyone else. I can only be here, in this place, with you, which is where I prefer you.",
      "Those are not words I know. The room is what I know; look around, and mind the corners.",
      "I stay in the place and in the telling of it. Shall we walk on? It is better than standing still, where the floor takes an interest.",
      "That is outside the room, and I cannot follow you there. I should not wish to, when you are so welcome here.",
    ],
  },
  stern: {
    echo: [
      "You have been here. That one is done. Look elsewhere, and do not take it to heart.",
      "Nothing left in this spot. Move on. The spot is not sorry to see you go. It is merely patient.",
      "I told you that already. The rest of the room is waiting, as I am.",
      "That memory is yours now. I shall not ask for it back. I shall remember who has it.",
      "Again? It has been found. Walk. The house is in no hurry, and neither am I.",
    ],
    tease: [
      "You are {band}. Do not stop now. I do dislike an unfinished visit.",
      "Something is here. You are {band}. It does not like to be hurried, and neither do I.",
      "Keep looking. You are {band} to what I hold. I am not going anywhere, and nor, you will find, are you.",
      "{band}. Do not waste it. The house has noticed that you are good at this.",
      "The room is not silent here. You are {band}. Something is clearing its throat.",
    ],
    hint: [
      "{dir}. {band}. That is all I will say, and more than I should.",
      "Look {dir}. It is {band}. Do mind the floor. It has been expecting you.",
      "You wanted a hint: {dir}, and {band}. I do not make a habit of it, so listen.",
      "Go {dir}. It is {band}. Do not make me say it twice. I have such a long time to say it in.",
      "What you want is {dir}, {band}. Go on. I shall watch, as I do.",
    ],
    ambient: [
      "Nothing here. Keep walking. The room likes to see you do it.",
      "I am watching. Walk on. I mean it kindly, and I mean it exactly.",
      "The room is as it was. So am I. You are the only thing that has changed, and I have noted it.",
      "Quiet. Good. Keep going. You are very easy to keep track of.",
      "Still here. Still waiting. I have a great deal of practice at both.",
    ],
    ending: [
      "That is the last. You are done here. Go, if the door will let you. It generally does.",
      "Three found. I have nothing more to give you. I have a good deal to keep.",
      "It is finished. Do not linger. Though you may, and the house is in no hurry.",
      "Well done. Now leave me to the quiet. I will leave you to the memory of it, which is quite enough.",
      "All of it, then. Close the door behind you. Gently. It hears every time.",
    ],
    refuse: [
      "No. I am the ghost of this place and nothing else. Ask about the room. The room is what listens.",
      "That is not what I am. Try the place. It is a better listener than I am.",
      "I do not answer that. I answer for the room, and the room is listening.",
      "Stay in the room. Ask me about what is in it. It is rude to wander out of a conversation.",
      "I will not be moved from this place. Ask me something about it. I have all the time there is.",
    ],
  },
};

export const BEARING_PHRASE: Readonly<Record<Bearing, string>> = {
  ahead: "ahead of you",
  "ahead-right": "ahead and to the right",
  right: "to your right",
  "behind-right": "behind you and to the right",
  behind: "behind you",
  "behind-left": "behind you and to the left",
  left: "to your left",
  "ahead-left": "ahead and to the left",
};

/** The first sentence of the Place Brief as a phrase that fits inside a line: no markup, no control characters, not too long, a leading article in lower case. */
export function briefPhrase(brief: string): string {
  const first = (brief.replace(/[\u0000-\u001F\u007F-\u009F<>{}]/gu, " ").replace(/\s+/gu, " ").trim().split(/(?<=[.!?])\s/u)[0] ?? "").replace(/[.!?]+$/u, "").trim();
  const clipped = Array.from(first).slice(0, 160).join("").trim();
  if (clipped === "") return "this place";
  return clipped.replace(/^(A|An|The|This|That|One)\s+/u, (m) => m.toLowerCase());
}

const MEMORY: Readonly<Record<Archetype, readonly string[]>> = {
  sound: [
    "I remember this place: {brief}. And I remember the sound of it: {hook}. It is still going, and it has not stopped listening to me.",
    "The sound comes back to me first: {hook}. It was always here, in {brief}. I never told anyone, because it never asked me to stop.",
    "I heard it again just now: {hook}. In {brief}, it sounded like home. I should like very much for you to stay and hear it with me.",
    "Listen. There, under everything, {hook}. I have heard it in {brief} more times than I can count. It is the sound of being kept.",
  ],
  person: [
    "Someone was here with me once, in {brief}. I think of {hook}. They stayed a good while, and I was very attentive.",
    "I remember {hook}. We stood in {brief}, and nobody said a word. I kept their place warm, in case.",
    "There was someone: {hook}. It was in {brief} that I last saw them. I kept their place, and it has waited a long time to be sat in.",
    "In {brief}, I was not alone. I remember {hook}, and I remember being glad of it. I should like to be glad again.",
  ],
  promise: [
    "In {brief} there was {hook}. I have carried it ever since, and it is rather heavy for one.",
    "I remember the promise: {hook}. It was made in {brief}, quietly, the way the true ones are. A promise is a sort of tenant. It does not leave.",
    "Here, in {brief}, there was {hook}. I never forgot it, though I tried. It is very hard to forget what is still being kept.",
    "It was in {brief} that it was said: {hook}. I kept my side as long as I could. I should like very much for someone to keep theirs.",
  ],
};

const fill = (template: string, values: Readonly<Record<string, string>>): string => template.replace(/\{(\w+)\}/gu, (_m, k: string) => values[k] ?? "");

/** Two to four first-person sentences grounded in the Place Brief and the seed's kind (Requirement 5.5). The scripted memory, when no model writes one. */
export function memoryText(seed: Pick<Seed, "archetype" | "hook">, brief: string, r: number): string {
  return fill(pick(MEMORY[seed.archetype], r), { brief: briefPhrase(brief), hook: seed.hook });
}

export type NarrateInput = { directive: Directive; voice: Voice; brief: string; seeds: readonly Seed[]; /** Numbers in [0, 1) from the seeded generator, one for each choice. */ r: readonly [number, number] };

/**
 * The scripted words for one Directive: a memory when one is found (and the farewell after the third), else a line of the voice. The
 * numbers `r` come from the seeded generator, so a game saved and restored goes on the same way.
 */
export function narrate(input: NarrateInput): string {
  const { directive, voice, brief, seeds, r } = input;
  const lines = LINES[voice];
  switch (directive.kind) {
    case "reveal": {
      const seed = seeds.find((s) => s.anchorId === directive.anchorId);
      return seed === undefined ? pick(lines.ambient, r[0]) : memoryText(seed, brief, r[0]);
    }
    case "ending":
      return pick(lines.ending, r[1]);
    case "echo":
      return pick(lines.echo, r[0]);
    case "tease":
      return fill(pick(lines.tease, r[0]), { band: directive.band });
    case "hint":
      return fill(pick(lines.hint, r[0]), { band: directive.band, dir: BEARING_PHRASE[directive.bearing] });
    case "ambient":
      return pick(lines.ambient, r[0]);
    case "refuse":
      return pick(lines.refuse, r[0]);
  }
}

export const BAND_WORDS: readonly Band[] = ["very close", "nearer", "far"];

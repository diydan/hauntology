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
      "You have been here before, and so have I. There is nothing left to find in this spot, only the warmth of having found it.",
      "This place has already given you what it had. Stay a moment anyway; it likes the company.",
      "I know this corner now, and so do you. Go on, there is more of the room to see.",
      "Something was here, and you took it with you. What is left is only quiet.",
      "We have been through this one together. Look elsewhere, gently.",
    ],
    tease: [
      "Something waits here, and you are {band} to it.",
      "I can feel it stirring. You are {band} to something I have not said aloud.",
      "Not yet, but you are {band}. Walk slowly.",
      "The air changes where a memory is kept. You are {band} to such a place.",
      "Close your eyes and you might feel it: you are {band} to what I am keeping.",
    ],
    hint: [
      "Something is {band}, {dir}. Walk toward it, if you will.",
      "I would look {dir}. It is {band}.",
      "{dir}, {band}: that is where I keep the next one.",
      "Turn a little. It is {dir}, and {band}.",
      "If you are lost, go {dir}. What you want is {band}.",
    ],
    ambient: [
      "The room is quiet. I am still here.",
      "Dust turns in the light, as it always did.",
      "I remember more than I can say. Walk on, and I will try.",
      "Nothing moves, and yet it feels as if something might.",
      "The place holds its breath, and so do I.",
    ],
    ending: [
      "That is all of it. Thank you for finding what was left of me. I will keep the light on a little longer.",
      "You have all three now. Carry them gently, and come back whenever you like.",
      "It is complete. I was only ever waiting to be remembered.",
      "That was the last of it. Go well. This place will remember you too.",
      "Now you know. Leave the door as you found it.",
    ],
    refuse: [
      "I am only what is left of this place. Ask me about the room, and I will tell you what I can.",
      "I cannot be anyone else. I can only be here, in this place, with you.",
      "Those are not words I know. The room is what I know; look around.",
      "I stay in the place and in the telling of it. Shall we walk on?",
      "That is outside the room, and I cannot follow you there. Ask me about what is here.",
    ],
  },
  stern: {
    echo: [
      "You have been here. That one is done. Look elsewhere.",
      "Nothing left in this spot. Move on.",
      "I told you that already. The rest of the room is waiting.",
      "That memory is yours now. Go on.",
      "Again? It has been found. Walk.",
    ],
    tease: [
      "You are {band}. Do not stop now.",
      "Something is here. You are {band}.",
      "Keep looking. You are {band} to what I hold.",
      "{band}. Do not waste it.",
      "The room is not silent here. You are {band}.",
    ],
    hint: [
      "{dir}. {band}. That is all I will say.",
      "Look {dir}. It is {band}.",
      "You wanted a hint: {dir}, and {band}.",
      "Go {dir}. It is {band}. Do not make me say it twice.",
      "What you want is {dir}, {band}.",
    ],
    ambient: [
      "Nothing here. Keep walking.",
      "I am watching. Walk on.",
      "The room is as it was. So am I.",
      "Quiet. Good. Keep going.",
      "Still here. Still waiting.",
    ],
    ending: [
      "That is the last. You are done here. Go.",
      "Three found. I have nothing more to give you.",
      "It is finished. Do not linger.",
      "Well done. Now leave me to the quiet.",
      "All of it, then. Close the door behind you.",
    ],
    refuse: [
      "No. I am the ghost of this place and nothing else. Ask about the room.",
      "That is not what I am. Try the place.",
      "I do not answer that. I answer for the room.",
      "Stay in the room. Ask me about what is in it.",
      "I will not be moved from this place. Ask me something about it.",
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
    "I remember this place: {brief}. And I remember the sound of it: {hook}.",
    "The sound comes back to me first: {hook}. It was always here, in {brief}. I never told anyone.",
    "I heard it again just now: {hook}. In {brief}, it sounded like home. I wish I could stay.",
    "Listen. There, under everything, {hook}. I have heard it in {brief} more times than I can count.",
  ],
  person: [
    "Someone was here with me once, in {brief}. I think of {hook}.",
    "I remember {hook}. We stood in {brief}, and nobody said a word. I still wonder where they went.",
    "There was someone: {hook}. It was in {brief} that I last saw them. I kept their place.",
    "In {brief}, I was not alone. I remember {hook}, and I remember being glad of it.",
  ],
  promise: [
    "In {brief} there was {hook}. I have carried it ever since.",
    "I remember the promise: {hook}. It was made in {brief}, quietly, the way the true ones are.",
    "Here, in {brief}, there was {hook}. I never forgot it, though I tried.",
    "It was in {brief} that it was said: {hook}. I kept my side as long as I could.",
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

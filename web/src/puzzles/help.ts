import type { Kind } from "@hauntology/shared/puzzles/types";

/**
 * What the "?" button says about each puzzle: how it works (the goal, the controls, the limits) and what the phone's
 * extras do. It never says how to solve a puzzle, and it never gives a hint about an answer. Short sentences, simple words.
 * Every puzzle can be finished with touch alone, so every extra is marked as optional on the card.
 */
export type KindHelp = Readonly<{
  title: string;
  /** How the puzzle works, in order. */
  steps: readonly string[];
  /** What tilt, buzz, sound and the microphone do here. Empty when the puzzle uses none of them. */
  extras: readonly string[];
}>;

export const KIND_HELP: Readonly<Record<Kind, KindHelp>> = {
  lockpick: {
    title: "Lock pick",
    steps: [
      "Hidden pins sit inside the lock. You set them one at a time, from left to right.",
      "Slide the pick left or right. The screen says cold, cool, warm or hot as you feel around.",
      "Hold the pick still in the right spot for a moment. Then the pin sets.",
      "Touching the slider holds the tension for you. Or hold the Tension button.",
    ],
    extras: [
      "Tilt: hold Tension and lean the phone to move the pick.",
      "Buzz: ticks come faster the nearer you are. A click means you are in the spot.",
    ],
  },
  wires: {
    title: "Cut wires",
    steps: [
      "Each cut wire has its own colour, pattern and end shape. The terminals on the right have numbers.",
      "Drag a wire end to a terminal. Or tap a wire, then tap a terminal.",
      "Drag a wire away from the terminals to unplug it. A terminal holds one wire.",
      "When every wire is joined, press Check the wires.",
    ],
    extras: ["Buzz and sound: a snap when a wire connects."],
  },
  clock: {
    title: "Clock time",
    steps: [
      "Set the hands to the time you were shown.",
      "Drag a hand round the dial. Or pick a hand and use the step buttons.",
      "The minute hand moves in steps. Easy uses quarter hours.",
      "Medium uses five minutes. Hard uses single minutes.",
      "Press Set this time when you are ready.",
    ],
    extras: [
      "Twist: turn the phone like a wheel to turn the chosen hand. If it turns the wrong way, press Flip it.",
      "Buzz and sound: a tick at each step.",
    ],
  },
  safe: {
    title: "Safe code",
    steps: [
      "The code is a few digits. You put them in one at a time.",
      "Turn the dial until the digit you want is under the marker.",
      "Press Set to lock in that digit. Undo takes back the last one.",
    ],
    extras: [
      "Twist: turn the phone like a wheel to turn the dial. If it turns the wrong way, press Flip it.",
      "Buzz and sound: a click at each digit.",
    ],
  },
  musicbox: {
    title: "Music box",
    steps: [
      "Press Wind to hear a short tune. The button says how many plays are left.",
      "Play the tune back on the five keys, in the same order.",
      "Each key has a number and a shape, and each note lights its key.",
      "The notes are checked by themselves after the last one. Clear starts the notes again.",
    ],
    extras: ["Sound: you hear each note. With sound off, watch the keys light up."],
  },
  candles: {
    title: "Candle order",
    steps: [
      "The candles go out one at a time. Press Watch to see the order. The button says how many shows are left.",
      "Then put the candles out in that same order by tapping them.",
      "A wrong order lights them all again. Relight does that for you.",
    ],
    extras: ["Blow to snuff: tap a candle, then blow on the phone. This uses the microphone. It only measures loudness. Nothing is recorded."],
  },
  moved: {
    title: "What moved",
    steps: [
      "The lights go out for a moment. Then the shelf comes back.",
      "Some things are different. They may be swapped, new or missing.",
      "Tap everything that changed. Then press These changed.",
    ],
    extras: ["Buzz and sound: a low rumble and a creak while it is dark."],
  },
  photo: {
    title: "Torn photo",
    steps: [
      "A photo is torn into pieces. On medium and hard, the pieces are turned too.",
      "Tap a piece to pick it. Tap it again, or press Turn, to turn it.",
      "Drag a piece onto the frame. Or tap an empty spot to put it there.",
      "When the frame is full, press Check.",
    ],
    extras: ["Buzz and sound: a click when a piece fits."],
  },
  words: {
    title: "Hidden words",
    steps: [
      "Letters are written on a dark wall. You only see them in your torch beam.",
      "Aim the torch with a finger. Pick the lit letters from left to right.",
      "Tap a lit letter. Or press Pick for the letter that is lit.",
    ],
    extras: [
      "Tilt: lean the phone to sweep the torch.",
      "Buzz: a tick when a letter comes into the beam.",
    ],
  },
  board: {
    title: "Spirit board",
    steps: [
      "A word is whispered, with a short clue. The button says how many hearings are left.",
      "Move the planchette onto each letter of the word, one by one.",
      "Press Pick to choose the letter under it. Or tap a letter.",
    ],
    extras: [
      "Tilt: lean the phone to roll the planchette. Letters pull it in gently. Tap anywhere, or rest on a letter, to pick it.",
      "Buzz: a tick at each letter.",
    ],
  },
  maze: {
    title: "Marble maze",
    steps: [
      "Roll the orb to the green ring.",
      "Hold a finger where you want the orb to go. It is pulled towards your finger.",
      "Walls bump the orb. The bumps are counted.",
    ],
    extras: [
      "Tilt: lean the phone to roll the orb.",
      "Buzz and sound: a bump when the orb hits a wall.",
    ],
  },
};

/** The lines every puzzle shares. */
export const COMMON_HELP: readonly string[] = [
  "You have three tries. A wrong answer only tells you it was wrong.",
  "Every puzzle can be finished with touch alone. Every buzz and sound is also shown on screen.",
];

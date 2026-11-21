import type { Rng } from "../puzzles/rng";

/**
 * Party narration directives, Speakers and the scripted line library (party-mode 7.8, 7.9, 10.2). The three Speakers are
 * the characters of the `ghost-voice` spec. `partyScripted` takes a kind, a Speaker and a random number source and
 * nothing else: no Solution, no Hand and no guilt flag can reach a Lodger line, so the same `(kind, rng)` gives the
 * same line for a guilty and an innocent Suspect. The ghost's manner is horror told calmly.
 */
export type Speaker = "whisper" | "keeper" | "lodger";

export const DIRECTIVE_KINDS = [
  "turn-start", "suggest", "shown", "none-shown", "inspect", "seal", "reveal", "accuse-wrong", "accuse-right", "achievement",
  "time-warning", "haunt-event", "poltergeist", "ended-solved", "ended-haunted", "cue", "nudge", "phone-cue",
] as const;
export type PartyDirective = (typeof DIRECTIVE_KINDS)[number];
export const isDirective = (s: string): s is PartyDirective => (DIRECTIVE_KINDS as readonly string[]).includes(s);

/** The Speakers of a kind, in the order they speak. The first is the primary one. */
export const SPEAKERS: Readonly<Record<PartyDirective, readonly Speaker[]>> = {
  "turn-start": ["keeper"], "time-warning": ["keeper"], achievement: ["keeper"], suggest: ["keeper", "lodger"], shown: ["keeper"],
  "none-shown": ["keeper"], inspect: ["keeper"], seal: ["keeper"], cue: ["keeper"], nudge: ["keeper"], "phone-cue": ["keeper"],
  "haunt-event": ["whisper"], poltergeist: ["whisper"], "ended-haunted": ["whisper"],
  reveal: ["keeper", "lodger"], "accuse-wrong": ["keeper", "lodger"], "accuse-right": ["lodger", "keeper"], "ended-solved": ["lodger", "keeper"],
};
export const speakerFor = (kind: PartyDirective): Speaker => SPEAKERS[kind][0] as Speaker;

/** The kinds that never call a model. */
export const SCRIPTED_ONLY_KINDS: readonly PartyDirective[] = ["cue", "nudge", "phone-cue"];

/** Kinds where a Lodger line is spoken aloud: an Accusation and the reveal only (7.8). Elsewhere it is a text aside. */
export const LODGER_SPOKEN: readonly PartyDirective[] = ["accuse-wrong", "accuse-right", "reveal", "ended-solved"];
/** The only kinds that may carry a confession, and only once the Solution is public. */
export const CONFESSION_KINDS: readonly PartyDirective[] = ["accuse-right", "ended-solved"];

type Bank = Readonly<Partial<Record<PartyDirective, Readonly<Partial<Record<Speaker, readonly string[]>>>>>>;

export const PARTY_LINES: Bank = {
  "turn-start": { keeper: [
    "Your turn. The house is listening, as ever.",
    "The floor is yours. Walk slowly.",
    "Next to walk. Mind the corners.",
    "It is your turn. The clock has begun.",
    "Step forward. The rooms are waiting for you.",
  ] },
  suggest: {
    keeper: [
      "A question is put to the table. Someone must answer it.",
      "A guess has been laid down. Listen for who replies.",
      "The question is asked. The silence that follows is also an answer.",
      "A name, an object and a room, set side by side.",
      "The guess is made. Each seat is asked in turn.",
    ],
    lodger: [
      "Oh. Was that about me? I only live here.",
      "I would rather not be named. It is a draughty house.",
      "Do say it quietly. The walls do repeat things.",
      "I was only passing through. Truly.",
      "My name in that sentence. How strange it sounds.",
    ],
  },
  shown: { keeper: [
    "A card was shown, to one pair of eyes only.",
    "Someone answered, and only one person saw how.",
    "The answer has been given in private.",
    "One card changed hands, and left no mark.",
    "A reply, shown quietly. The rest may only wonder.",
  ] },
  "none-shown": { keeper: [
    "No one could answer. Make of that what you will.",
    "The table passed, every seat of it.",
    "Nothing was shown. That is its own kind of answer.",
    "Every hand stayed closed. Think on it.",
    "Silence all round the table. Note who was asked.",
  ] },
  inspect: { keeper: [
    "A search is under way. The room does not like it.",
    "Someone is looking closely. Dust is being disturbed.",
    "The search goes on, and the room holds still.",
    "A careful look, and a long one. What was found stays with the finder.",
    "The floor is being searched. The finding is private.",
  ] },
  seal: { keeper: [
    "An accusation is sealed. Nothing more will be said until the round ends.",
    "A paper is folded and set aside. Its contents wait.",
    "Someone has made up their mind. We shall see at the end of the round.",
    "A sealed answer. It cannot be taken back.",
    "The envelope is closed. Patience, all of you.",
  ] },
  reveal: {
    keeper: [
      "The sealed answers are opened together. Be still.",
      "Now the envelopes are opened, every one at once.",
      "The round is over. Let us read what was written.",
      "All at once, then. The accusations are read.",
      "The seals are broken. Listen.",
    ],
    lodger: [
      "Must we do this now? The lamps are low.",
      "I was only about to make some tea.",
      "It is late. Surely this can wait until morning.",
      "I do not see why anyone needs to read aloud.",
      "Please. I would rather not hear it.",
    ],
  },
  "accuse-wrong": {
    keeper: [
      "That was not the answer. The house is pleased.",
      "A wrong accusation. The accuser steps into the dark.",
      "Not so. The accuser has joined the haunting.",
      "The guess fails, and the accuser is claimed.",
      "No. That one is wrong, and the house takes its due.",
    ],
    lodger: [
      "Well. There. That is settled, then.",
      "I did say it was a draughty house.",
      "How dreadful for you. Do mind the stairs.",
      "I had nothing to do with it, you know.",
      "Another candle out. I do wish people would not.",
    ],
  },
  "accuse-right": {
    lodger: [
      "Yes. It was me. I have been waiting for someone to ask the right way.",
      "You found me. It was always going to be me.",
      "I am the one. I left it all here, and I stayed.",
      "It was I. I am so tired of the hiding.",
      "Yes. That is the truth, and I am glad it is out.",
    ],
    keeper: [
      "That is correct. The house goes quiet.",
      "Right at last. The matter is closed.",
      "The answer stands. Well reasoned.",
      "That one is true. Set down your pencils.",
      "Correct. The lamps may be lit again.",
    ],
  },
  achievement: { keeper: [
    "A small mark of merit for that. The clock gives a little back.",
    "Well walked. A few seconds are returned to you.",
    "Noted in the ledger, to your credit.",
    "A fine piece of work. Time is added to your next turn.",
    "The house takes note and rewards it, a little.",
  ] },
  "time-warning": { keeper: [
    "The clock is nearly spent.",
    "Ten seconds remain. Decide.",
    "Hurry now. The sand runs low.",
    "A few moments left. Choose.",
    "Time is almost gone.",
  ] },
  "haunt-event": { whisper: [
    "Something in the house has shifted. It is closer now.",
    "The air has changed. It is watching.",
    "A cold passes through the rooms, slowly.",
    "The house has noticed you, and it is patient.",
    "Something has stirred. It will not settle soon.",
  ] },
  poltergeist: { whisper: [
    "Another has crossed over. Welcome to the dark.",
    "One more joins the haunting. They cannot win now.",
    "The house has a new voice among its own.",
    "Out of the light, and into the walls.",
    "They are ours now. Still welcome at the table.",
  ] },
  "ended-solved": {
    lodger: [
      "That is all of it. I am sorry to have kept you from your beds.",
      "It is done, then. I am almost relieved.",
      "Thank you for finding it. Truly.",
      "Now you know. Go home safely.",
      "I did hope it would end like this.",
    ],
    keeper: [
      "The case is closed. Good night to you all.",
      "That concludes the matter. Mind the stairs on your way out.",
      "Solved. The house is quiet for now.",
      "The ledger is shut. Sleep well, if you can.",
      "It is over. The lamps may be put out.",
    ],
  },
  "ended-haunted": { whisper: [
    "The house wins. It always does, in the end.",
    "No one found it in time. The haunting goes on.",
    "The dark has the last word, and it keeps it.",
    "Stay a little longer. The rooms are not finished with you.",
    "The haunting continues. It has all the time in the world.",
  ] },
  cue: { keeper: [
    "A sound came from the table, and nobody owned it.",
    "Someone has stirred the air.",
    "A noise, played from a seat. The seat is not telling.",
    "The room answers a sound with a sound.",
    "A small noise, quite deliberate.",
  ] },
  nudge: { keeper: [
    "The clock was nudged, and the turn moved with it.",
    "Someone tugged at the time.",
    "A hand at the clock. The turn is changed.",
    "Time bent a little, at someone's request.",
    "The sand was shaken, for better or worse.",
  ] },
  "phone-cue": { keeper: [
    "A sound came from a phone. Whose idea it was, no one says.",
    "One phone spoke up. It will not explain itself.",
    "A noise from a pocket. Look around the table.",
    "A phone made a sound all of its own.",
    "Something sounded from one of the phones.",
  ] },
};

export const LINE_VARIANTS_MIN = 5;
const pickAt = <T>(list: readonly T[], r: number): T => list[Math.min(list.length - 1, Math.max(0, Math.floor(r * list.length)))] as T;

/**
 * One line for a kind in a Speaker's voice, from the seeded generator. A Speaker the kind does not use falls back to the
 * kind's primary Speaker, so a call is always answered. The Lodger's bank is the same for every Suspect.
 */
export function partyScripted(kind: PartyDirective, speaker: Speaker, rng: Rng): string {
  const use = SPEAKERS[kind].includes(speaker) ? speaker : speakerFor(kind);
  const list = PARTY_LINES[kind]?.[use] ?? [];
  return pickAt(list, rng());
}

import { hash, mulberry32, shuffle } from "../puzzles/rng";

/**
 * Photo Prompts (party-mode 3.6 to 3.8): twelve fixed ideas, three offered at a time, up to three skips. Not secret, not
 * a Contribution, never required. Every tip says no people or faces.
 */
export type PromptSource = "camera_roll" | "take_now";
export type PhotoPrompt = Readonly<{ id: string; text: string; tip: string; source: PromptSource }>;
const NO_FACES = "No people or faces.";

export const PHOTO_PROMPTS: readonly PhotoPrompt[] = [
  { id: "meal", text: "A meal you ate recently", tip: `Plate and table only. ${NO_FACES}`, source: "camera_roll" },
  { id: "pet", text: "A pet or any animal", tip: `Fur, feathers or fins are welcome. ${NO_FACES}`, source: "camera_roll" },
  { id: "window", text: "The view from a window", tip: `Any window will do. ${NO_FACES}`, source: "take_now" },
  { id: "street", text: "A street or building near home", tip: `Step back so it fills the picture. ${NO_FACES}`, source: "camera_roll" },
  { id: "outdoors", text: "A place outdoors you like", tip: `A bench, a path, a tree. ${NO_FACES}`, source: "camera_roll" },
  { id: "mug", text: "A mug or cup you use", tip: `Plain light works best. ${NO_FACES}`, source: "take_now" },
  { id: "shoes", text: "Your shoes", tip: `Set them on the floor by themselves. ${NO_FACES}`, source: "take_now" },
  { id: "sky", text: "The sky right now", tip: `Point the phone up. ${NO_FACES}`, source: "take_now" },
  { id: "table", text: "Something on the nearest table", tip: `Pick one thing and keep the rest out of it. ${NO_FACES}`, source: "take_now" },
  { id: "plant", text: "A plant", tip: `Leaves close up are fine. ${NO_FACES}`, source: "camera_roll" },
  { id: "door", text: "A door you use every day", tip: `Closed or open, your choice. ${NO_FACES}`, source: "take_now" },
  { id: "corner", text: "A favourite chair or corner", tip: `Tidy or not. ${NO_FACES}`, source: "take_now" },
];
export const PROMPT_ROUNDS = 4;
export const PROMPT_SKIPS = 3;
export type PromptId = string;

/**
 * Three distinct prompts for a seat in round 0 to 3, from the stream `photo:<seat>`. The four rounds of three use all
 * twelve entries once each, so three skips never show a repeat. `null` past the last round.
 */
export function offerPrompts(seed: number, seat: number, round: number): [PromptId, PromptId, PromptId] | null {
  if (!Number.isInteger(round) || round < 0 || round >= PROMPT_ROUNDS) return null;
  const order = shuffle(mulberry32(hash(`photo:${seat}`, seed)), PHOTO_PROMPTS);
  const at = (k: number): PromptId => (order[3 * round + k] as PhotoPrompt).id;
  return [at(0), at(1), at(2)];
}

/** The next round after a skip, or `null` once all three skips are used. */
export const skipOffer = (round: number): number | null => (Number.isInteger(round) && round >= 0 && round < PROMPT_SKIPS ? round + 1 : null);

export type PromptOffer = Readonly<{ round: number; prompts: readonly PhotoPrompt[] }>;
/** The three prompts (with their tips and sources) a seat is offered at its round, or `null` past the last. */
export function offerFor(seed: number, seat: number, round: number): PromptOffer | null {
  const ids = offerPrompts(seed, seat, round);
  if (ids === null) return null;
  return { round, prompts: ids.map((id) => PHOTO_PROMPTS.find((p) => p.id === id) as PhotoPrompt) };
}
/** One skip: the next offer, or `null` after the third skip. */
export function skipFor(seed: number, seat: number, round: number): PromptOffer | null {
  const next = skipOffer(round);
  return next === null ? null : offerFor(seed, seat, next);
}

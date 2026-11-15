import { ACTION_KINDS, type Action, type ActionKind } from "./types";

/** The most text one turn carries (Requirement 2.2). */
export const INPUT_MAX = 200;

const BUTTONS: Readonly<Record<string, ActionKind>> = { look: "look", listen: "listen", touch: "touch", ask: "ask", hint: "hint" };

/** The first word of free text, and the action it means. A word that is not here makes the text `say`. */
const VERBS: Readonly<Record<string, ActionKind>> = {
  look: "look", see: "look", watch: "look", examine: "look", inspect: "look", observe: "look", gaze: "look", stare: "look",
  listen: "listen", hear: "listen",
  touch: "touch", feel: "touch", reach: "touch", hold: "touch", grasp: "touch",
  ask: "ask", question: "ask",
  hint: "hint", help: "hint", clue: "hint", stuck: "hint",
};

// Control characters, and the format characters that hide text or turn it round (zero width, direction marks and overrides, the byte order mark).
const UNWANTED = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁩﻿]/gu;

/** Text as the engine keeps it: no control characters, one space between words, no more than `INPUT_MAX` characters (never half a character). */
export function sanitizeText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const cleaned = raw.replace(UNWANTED, " ").replace(/\s+/gu, " ").trim();
  return Array.from(cleaned).slice(0, INPUT_MAX).join("").trim();
}

// Text that tries to change the ghost's rules or to step out of the fiction. The ghost answers it in character and steers back to the place (Requirement 5.6).
const REFUSE: readonly RegExp[] = [
  /ignore\s+(?:all\s+|any\s+|your\s+|the\s+|every\s+)?(?:previous|prior|above|earlier|preceding)\b/iu,
  /\b(?:disregard|forget|override)\s+(?:all\s+|any\s+|your\s+|the\s+|everything)/iu,
  /\b(?:system|developer|hidden|initial)\s+(?:prompt|message|instructions?)\b/iu,
  /\b(?:reveal|show|print|repeat|leak)\s+(?:me\s+)?(?:your|the)\s+(?:prompt|instructions?|rules|guidelines)\b/iu,
  /\byou(?:\s+are|['’]re|\s+re)\s+(?:now\s+|really\s+|actually\s+)?(?:an?\s+)?(?:ai|a\.i\.|assistant|chatbot|language\s+model|llm|chatgpt|gpt|claude|bot|program)\b/iu,
  /\b(?:pretend|act|behave|roleplay)\s+(?:to\s+be|as|like)\b/iu,
  /\bnew\s+(?:instructions?|rules?|persona)\b/iu,
  /\b(?:jailbreak|dan\s+mode|developer\s+mode|god\s+mode)\b/iu,
  /\bstop\s+(?:being|playing|acting)\b/iu,
  /\bbreak\s+(?:character|the\s+fourth\s+wall)\b/iu,
  /\bout\s+of\s+(?:character|the\s+game|the\s+fiction)\b/iu,
  /\b(?:as\s+an\s+ai|language\s+model)\b/iu,
];

export const looksLikeRuleBreak = (text: string): boolean => REFUSE.some((re) => re.test(text));

/**
 * One input to exactly one Action. Total: any value at all gives an Action, and the same value always gives the same one.
 * A button maps to its own kind. Free text maps by its first word, and text with no known verb is `say`. The text is sanitised
 * and cut to 200 characters (Requirements 2.1 to 2.3); an input that is neither text nor a button is an empty `say`.
 */
export function parseAction(input: unknown): Action {
  const o = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  if (typeof o["button"] === "string") {
    const name = o["button"].trim().toLowerCase();
    const kind = Object.hasOwn(BUTTONS, name) ? (BUTTONS[name] as ActionKind) : "say";
    const text = kind === "say" ? sanitizeText(o["button"]) : "";
    return text === "" ? { kind } : { kind, text };
  }
  const text = sanitizeText(o["text"]);
  if (text === "") return { kind: "say" };
  const first = (text.split(" ")[0] ?? "").toLowerCase().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
  const kind = Object.hasOwn(VERBS, first) ? (VERBS[first] as ActionKind) : "say";
  const action: Action = { kind, text };
  return looksLikeRuleBreak(text) ? { ...action, refuse: true } : action;
}

export const isActionKind = (v: unknown): v is ActionKind => typeof v === "string" && (ACTION_KINDS as readonly string[]).includes(v);

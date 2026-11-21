import { markCard, type Column, type Mark, type PlayerMarks } from "@hauntology/shared/party/notebook";
import type { Theory } from "@hauntology/shared/party/theory";

/**
 * The notebook's own marks and the Theory marks, kept on this device only (party-mode 9.6, 9.26): in this tab's storage under the Room Code
 * and seat, never sent anywhere. A saved value that does not read is dropped; nothing here can fail a page.
 */
type Saved = Readonly<{ marks: readonly (readonly [string, Exclude<Mark, "blank">])[]; theory: Theory }>;
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const notebookKey = (code: string, seat: number): string => `hauntology.party.notebook.${code}.${seat}`;
const MARKS: readonly string[] = ["has", "lacks", "maybe"];

export function loadNotebook(storage: StorageLike, code: string, seat: number): { marks: PlayerMarks; theory: Theory } {
  try {
    const raw = JSON.parse(storage.getItem(notebookKey(code, seat)) ?? "null") as Partial<Saved> | null;
    const marks = new Map<string, Exclude<Mark, "blank">>();
    for (const e of Array.isArray(raw?.marks) ? raw.marks : []) if (Array.isArray(e) && typeof e[0] === "string" && e[0].length < 80 && MARKS.includes(e[1] as string)) marks.set(e[0], e[1] as Exclude<Mark, "blank">);
    const theory: Record<string, string> = {};
    if (raw?.theory !== null && typeof raw?.theory === "object") for (const [k, v] of Object.entries(raw.theory)) if (typeof v === "string" && k.length < 40 && v.length < 40) theory[k] = v;
    return { marks, theory };
  } catch { return { marks: new Map(), theory: {} }; }
}
export function saveNotebook(storage: StorageLike, code: string, seat: number, marks: PlayerMarks, theory: Theory): void {
  try { storage.setItem(notebookKey(code, seat), JSON.stringify({ marks: [...marks.entries()], theory } satisfies Saved)); } catch { /* storage off: the notebook lasts this page */ }
}
export const forgetNotebook = (storage: StorageLike, code: string, seat: number): void => { try { storage.removeItem(notebookKey(code, seat)); } catch { /* nothing to forget */ } };

/** The tap order of one cell: blank, has, lacks, maybe, and back to blank. */
export const NEXT_MARK: Readonly<Record<Mark, Mark>> = { blank: "has", has: "lacks", lacks: "maybe", maybe: "blank" };
export const nextCell = (marks: PlayerMarks, card: string, col: Column, current: Mark): PlayerMarks => markCard(marks, card, col, NEXT_MARK[current]);

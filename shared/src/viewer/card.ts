import { cardExcerpt } from "../app/memory-card";

/**
 * The memory card's layout (Requirement 7.1; world-viewer task 2.14): exactly the
 * found memories, each excerpt cut by the shell card's rule (`cardExcerpt`, at most
 * 120 characters), and nothing else — no ids, times or places travel into the
 * keepsake. Rendering this to a canvas PNG is task 9.
 */
export type CardMemoryInput = { title?: string; text: string; found: boolean };

export type CardLayout = {
  /** The world thumbnail's asset path, or null when the world has none. */
  thumb: string | null;
  entries: readonly { title: string; excerpt: string }[];
};

export function layoutMemoryCard(memories: readonly CardMemoryInput[], thumb: string | null): CardLayout {
  const entries = memories
    .filter((m) => m.found)
    .map((m, i) => ({
      title: m.title && m.title.trim() !== "" ? cardExcerpt(m.title) : `Memory ${i + 1}`,
      excerpt: cardExcerpt(m.text),
    }));
  return { thumb: thumb && thumb.trim() !== "" ? thumb : null, entries };
}

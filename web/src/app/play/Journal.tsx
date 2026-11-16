import type { JournalEntry } from "@hauntology/shared/app/api";
import { Dialog } from "../Dialog";

/**
 * The memories found so far, in the order they were found (ghost-engine 6.2, built from the
 * design elements, Requirement 10.3): a panel holding a log, each memory a row with its number.
 */
export const JOURNAL_EMPTY = "Nothing found yet. Walk closer to the places that feel strange.";

export function Journal({ entries, onClose }: { entries: JournalEntry[]; onClose: () => void }) {
  return (
    <Dialog title="Journal" onClose={onClose}>
      {entries.length === 0 ? (
        <p>{JOURNAL_EMPTY}</p>
      ) : (
        <div className="ui-panel">
          <ol className="journal ui-log" aria-label="The memories you found">
            {entries.map((e, i) => (
              <li key={e.anchorId} className="ui-log-row">
                <span className="ui-log-who">Memory {i + 1}: </span>
                {e.text}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Dialog>
  );
}

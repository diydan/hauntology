import type { JournalEntry } from "@hauntology/shared/app/api";
import { Dialog } from "../Dialog";

/** The memories found so far, in the order they were found. */
export function Journal({ entries, onClose }: { entries: JournalEntry[]; onClose: () => void }) {
  return (
    <Dialog title="Journal" onClose={onClose}>
      {entries.length === 0 ? (
        <p>Nothing found yet. Walk closer to the places that feel strange.</p>
      ) : (
        <ol className="journal ui-log">
          {entries.map((e) => (
            <li key={e.anchorId} className="ui-log-row">{e.text}</li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}

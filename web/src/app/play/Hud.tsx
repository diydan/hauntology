/**
 * The HUD (Requirement 6.4): how many of the three memories are found, the journal, the Talk
 * button (also the "accept" for the interaction prompt) and an Exit that is always on screen.
 */
export const TOTAL_MEMORIES = 3;

export function promptText(target: "anchor" | "ghost"): string {
  return target === "ghost" ? "The ghost is close. Talk to it?" : "Something here remembers. Look closer?";
}

export function Hud({
  found, prompt, chatOpen, onTalk, onJournal, onExit,
}: {
  found: number;
  prompt: "anchor" | "ghost" | null;
  chatOpen: boolean;
  onTalk: () => void;
  onJournal: () => void;
  onExit: () => void;
}) {
  return (
    <div className="ui-stack ui-stack--tight" role="group" aria-label="Game controls">
      <p className="ui-hint" data-found>
        Memories found: {found} of {TOTAL_MEMORIES}
      </p>
      <div className="ui-row">
        <button className="ui-button" type="button" onClick={onJournal}>
          Journal
        </button>
        {chatOpen ? null : (
          <button className="ui-button" type="button" onClick={onTalk}>
            Talk
          </button>
        )}
        <button className="ui-button" type="button" onClick={onExit}>
          Exit
        </button>
      </div>
      {prompt !== null && !chatOpen ? (
        <p className="ui-notice ui-row" data-prompt>
          {promptText(prompt)}{" "}
          <button className="ui-button" type="button" onClick={onTalk}>
            Yes
          </button>
        </p>
      ) : null}
    </div>
  );
}

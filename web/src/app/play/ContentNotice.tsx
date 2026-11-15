/**
 * The content notice before the Viewer starts (Requirement 6.1): the place is dim, light may
 * flicker, the ghost may say unsettling things, and the visitor can leave at any time. The Viewer
 * does not start until the visitor goes in.
 */
export const NOTICE_TEXT = "This place is dim and quiet. Light may flicker, and the ghost may say unsettling things. You can leave at any time with Exit.";

export function ContentNotice({ onGoIn }: { onGoIn: () => void }) {
  return (
    <section className="ui-notice ui-stack" aria-labelledby="notice-title" data-content-notice>
      <h2 className="ui-heading" id="notice-title">Before you go in</h2>
      <p>{NOTICE_TEXT}</p>
      <p>
        <button className="ui-button ui-button--primary" type="button" onClick={onGoIn}>
          Go in
        </button>
      </p>
    </section>
  );
}

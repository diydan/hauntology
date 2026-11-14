import type { ScreenId } from "@hauntology/shared/app/types";
import { errorCopy } from "@hauntology/shared/app/errors-copy";
import { Component, type ReactNode } from "react";
import { logger } from "./logger";

/**
 * A Screen that throws shows a calm message, the error code and a way home, and logs only the code
 * and the Screen id (Requirement 7.1). The Home link is a plain link, so following it reloads the
 * page and clears whatever broke. The App keys the boundary by route, so leaving the Screen resets it.
 */

type ScreenProps = { screenId: ScreenId; children: ReactNode };
type State = { failed: boolean };

export class ScreenBoundary extends Component<ScreenProps, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  // The error itself is dropped on purpose: its message could hold a caption, a URL or chat text.
  override componentDidCatch(): void {
    logger.log("shell_crash", this.props.screenId);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const copy = errorCopy("shell_crash");
    return (
      <main className="screen" data-screen-error>
        <h1 tabIndex={-1}>{copy.title}</h1>
        <p>{copy.body}</p>
        <p>
          Code: <code>shell_crash</code>
        </p>
        <p>
          <a className="button" href="/">
            Go home
          </a>
        </p>
      </main>
    );
  }
}

type ViewerProps = {
  /** The place's thumbnail, a path on this origin. */
  thumbUrl?: string;
  alt: string;
  children: ReactNode;
};

/**
 * Around the Viewer only. If the Viewer crashes, the canvas is replaced by the thumbnail and the
 * Chat and Exit, which sit outside this boundary, keep working (Requirement 7.2).
 */
export class ViewerBoundary extends Component<ViewerProps, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(): void {
    logger.log("shell_crash", "play");
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="viewer-fallback">
        {this.props.thumbUrl ? <img src={this.props.thumbUrl} alt={this.props.alt} /> : null}
        <p>The view stopped. You can still talk to the ghost or leave.</p>
      </div>
    );
  }
}

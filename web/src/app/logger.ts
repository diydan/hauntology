import { SCREEN_IDS, type ScreenId } from "@hauntology/shared/app/types";
import { ErrorCode } from "@hauntology/shared/errors";

/**
 * The only place in `web/` that writes to the console, and it writes only an error code and a
 * Screen id: never a message, a stack, a URL, a world id, a photo, a caption or chat text. A value
 * that is not on the two lists is not logged at all, so free text cannot get in even through a cast.
 * The lint rule in `eslint.config.js` bans `console.*` everywhere else.
 */

const CODES: ReadonlySet<string> = new Set(Object.values(ErrorCode));
const SCREENS: ReadonlySet<string> = new Set(SCREEN_IDS);

export type LogSink = (line: string) => void;
export type Logger = {
  /** Returns whether a line was written. */
  log(code: ErrorCode, screenId: ScreenId): boolean;
};

export function createLogger(sink: LogSink): Logger {
  return {
    log(code, screenId) {
      if (typeof code !== "string" || typeof screenId !== "string" || !CODES.has(code) || !SCREENS.has(screenId)) return false;
      sink(`[hauntology] ${code} ${screenId}`);
      return true;
    },
  };
}

export const logger: Logger = createLogger((line) => console.error(line));

import { formatLog, type LogEvent, type LogFields, type LogLevel } from "@hauntology/shared/log";

/**
 * The one place the API writes a log line (world-pipeline 8.2, Requirement 10.3). A call names an event from the closed list in
 * `shared/src/log.ts` and gives its fields; `formatLog` keeps only ids, codes, counters and yes/no, so no caption, prompt, chat line,
 * image, request body or error message can reach a line. This is the only file under `api/src` that may name `console`: the
 * `no-direct-logging` test fails any other. A sink that throws never breaks a request.
 */
export type LogSink = (line: string) => void;

export interface Logger {
  info<E extends LogEvent>(event: E, fields?: LogFields<E>): void;
  warn<E extends LogEvent>(event: E, fields?: LogFields<E>): void;
  error<E extends LogEvent>(event: E, fields?: LogFields<E>): void;
}

/** The Worker's log: a line of JSON on the console, which Workers Logs and `wrangler tail` read. */
const consoleSink: LogSink = (line) => {
  console.log(line);
};

export function createLogger(sink: LogSink = consoleSink, now: () => number = Date.now): Logger {
  const write = (level: LogLevel, event: string, fields: unknown): void => {
    try {
      sink(formatLog(level, event, fields, now()));
    } catch {
      /* a log that cannot be written is not a reason to fail the request */
    }
  };
  return {
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
  };
}

/** A logger that writes nothing: the default where none is given, so a test or a module without one stays silent. */
export const SILENT: Logger = createLogger(() => {});

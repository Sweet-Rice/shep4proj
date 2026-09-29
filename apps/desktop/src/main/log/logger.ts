import { inspect } from "node:util";
import { redactLogText } from "./redact.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Where formatted log lines go. `console` satisfies it. */
export type LogSink = Record<LogLevel, (line: string) => void>;

/** Main-process logger. Every line is redacted before it reaches the sink. */
export type Logger = Record<LogLevel, (...args: unknown[]) => void>;

/**
 * Formats one argument for a log line. Objects and errors are inspected on a single line, with
 * their stacks and causes, so the redactor sees exactly what would be written.
 */
function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  return inspect(arg, { depth: 6, breakLength: Infinity });
}

/**
 * Creates the main-process logger (T-318). Use it instead of `console` in main-process code,
 * so nothing reaches the terminal or a log file without passing through `redactLogText`.
 */
export function createLogger(sink: LogSink = console): Logger {
  const write =
    (level: LogLevel) =>
    (...args: unknown[]): void => {
      sink[level](redactLogText(args.map(formatArg).join(" ")));
    };
  return { debug: write("debug"), info: write("info"), warn: write("warn"), error: write("error") };
}

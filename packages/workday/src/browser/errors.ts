import type { WorkdayBrowserChannel } from "./types.js";

/**
 * Thrown when none of the requested browser channels are installed on the
 * user's machine (see T-313).
 */
export class NoSupportedBrowserError extends Error {
  readonly channelsTried: readonly WorkdayBrowserChannel[];

  constructor(channelsTried: readonly WorkdayBrowserChannel[], cause?: unknown) {
    super(
      "No supported browser was found for the Workday import. " +
        "Please install Microsoft Edge or Google Chrome and try again.",
    );
    this.name = "NoSupportedBrowserError";
    this.channelsTried = channelsTried;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/**
 * Playwright reports a missing browser channel/executable with one of a
 * few known message shapes rather than a distinct error type. Anything
 * else (bad profile permissions, navigation failure, etc.) should not be
 * treated as "not installed" and must propagate.
 */
export function isBrowserNotInstalledError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /is not found|is not supported on|executable doesn't exist/i.test(error.message);
}

/**
 * Playwright's BrowserContext.close() error shape when the context (or its
 * underlying browser process) is already closed. Teardown tolerates this
 * so it stays idempotent.
 */
export function isContextAlreadyClosedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /closed/i.test(error.message);
}

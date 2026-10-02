import { promises as fs } from "node:fs";

import { isContextAlreadyClosedError } from "./errors.js";
import type { WorkdayBrowserSession } from "./types.js";

/**
 * The browser can still be exiting, with profile files open, when its context reports closed
 * (e.g. right after the student closes the window). On Windows that surfaces as a transient
 * EBUSY/EPERM from the removal, so it is retried briefly before giving up.
 */
const REMOVE_ATTEMPTS = 20;
const REMOVE_RETRY_DELAY_MS = 250;
const TRANSIENT_REMOVE_CODES: Record<string, true> = { EBUSY: true, EPERM: true, ENOTEMPTY: true };

/**
 * Tears down a session from `launchWorkdayBrowser`: closes the browser
 * context, deletes the temp profile dir, and verifies on disk that it's
 * actually gone. Idempotent — safe to call more than once, and tolerates a
 * context that was already closed.
 *
 * See SECURITY.md: this must leave no Workday session data on disk.
 */
export async function teardownWorkdayBrowser(
  session: Pick<WorkdayBrowserSession, "context" | "profileDir">,
): Promise<void> {
  try {
    await session.context.close();
  } catch (error) {
    if (!isContextAlreadyClosedError(error)) {
      throw error;
    }
  }

  await removeProfileDir(session.profileDir);

  const stillExists = await pathExists(session.profileDir);
  if (stillExists) {
    throw new Error(`Failed to remove Workday browser profile directory: ${session.profileDir}`);
  }
}

async function removeProfileDir(profileDir: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await fs.rm(profileDir, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      if (attempt >= REMOVE_ATTEMPTS || typeof code !== "string" || !TRANSIENT_REMOVE_CODES[code]) {
        throw error;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, REMOVE_RETRY_DELAY_MS));
    }
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch (error) {
    if (isEnoent(error)) {
      return false;
    }
    throw error;
  }
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

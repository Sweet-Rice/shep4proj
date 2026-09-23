import { promises as fs } from "node:fs";

import { isContextAlreadyClosedError } from "./errors.js";
import type { WorkdayBrowserSession } from "./types.js";

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

  await fs.rm(session.profileDir, { recursive: true, force: true });

  const stillExists = await pathExists(session.profileDir);
  if (stillExists) {
    throw new Error(`Failed to remove Workday browser profile directory: ${session.profileDir}`);
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

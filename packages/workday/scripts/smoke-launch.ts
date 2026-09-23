/**
 * Opt-in manual smoke test for the Workday browser launcher. Not run in CI
 * (see AGENTS.md/CI section) — it launches a real, visible browser on
 * whatever machine runs it.
 *
 * Usage: pnpm --filter @jevschedule/workday smoke:launch
 * (runs against the build output, so it builds first)
 */
import { promises as fs } from "node:fs";

import { launchWorkdayBrowser, teardownWorkdayBrowser } from "../dist/browser/index.js";

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const session = await launchWorkdayBrowser({ startUrl: "about:blank" });
  console.log(`launched channel: ${session.channel}`);

  await new Promise((resolve) => setTimeout(resolve, 3000));

  await teardownWorkdayBrowser(session);
  const removed = !(await pathExists(session.profileDir));
  console.log(`profile dir removed: ${removed}`);

  if (!removed) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

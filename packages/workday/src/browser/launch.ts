import { chromium as defaultChromium } from "playwright-core";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { NoSupportedBrowserError, isBrowserNotInstalledError } from "./errors.js";
import type { BrowserTypeLike, WorkdayBrowserChannel, WorkdayBrowserSession } from "./types.js";

const DEFAULT_CHANNELS: readonly WorkdayBrowserChannel[] = ["msedge", "chrome"];

export interface LaunchWorkdayBrowserOptions {
  /** Page to navigate the first tab to once the browser is up. */
  startUrl: string;
  /** Browser channels to try, in order. Defaults to msedge, then chrome. */
  channels?: readonly WorkdayBrowserChannel[];
  /** Injectable for tests; defaults to playwright-core's real chromium. */
  chromium?: BrowserTypeLike;
  /** Parent directory for the temp profile dir; defaults to the OS temp dir. */
  profileRoot?: string;
  /**
   * Extra `launchPersistentContext` options passed through verbatim (e.g.
   * `recordHar`). `headless` and `channel` are applied after these and
   * always win, so this can't be used to change either. Used by T-311's
   * capture script; not otherwise consumed here.
   */
  extraLaunchOptions?: Record<string, unknown>;
}

/**
 * Launches the user's installed Edge or Chrome (never a bundled/downloaded
 * browser — playwright-core ships no browser binaries) in a fresh, throwaway
 * profile directory, and navigates the first page to `startUrl`.
 *
 * Tries `channels` in order, falling through to the next one only when a
 * channel isn't installed. If none are available, throws
 * `NoSupportedBrowserError` and cleans up the temp profile dir.
 *
 * See SECURITY.md: never log `startUrl`, cookies, or page content — the
 * Workday session must never leave this machine.
 */
export async function launchWorkdayBrowser(
  opts: LaunchWorkdayBrowserOptions,
): Promise<WorkdayBrowserSession> {
  const channels = opts.channels ?? DEFAULT_CHANNELS;
  const chromium = opts.chromium ?? defaultChromium;
  const profileRoot = opts.profileRoot ?? os.tmpdir();
  const profileDir = await fs.mkdtemp(path.join(profileRoot, "jevschedule-wd-"));

  let lastNotInstalledError: unknown;

  for (const channel of channels) {
    try {
      const context = await chromium.launchPersistentContext(profileDir, {
        ...opts.extraLaunchOptions,
        headless: false,
        channel,
      });
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(opts.startUrl);
      return { context, page, profileDir, channel };
    } catch (error) {
      if (isBrowserNotInstalledError(error)) {
        lastNotInstalledError = error;
        continue;
      }
      await removeProfileDir(profileDir);
      throw error;
    }
  }

  await removeProfileDir(profileDir);
  throw new NoSupportedBrowserError(channels, lastNotInstalledError);
}

async function removeProfileDir(profileDir: string): Promise<void> {
  await fs.rm(profileDir, { recursive: true, force: true });
}

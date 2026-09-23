import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NoSupportedBrowserError } from "./errors.js";
import { launchWorkdayBrowser } from "./launch.js";
import type { BrowserContextLike, BrowserTypeLike, PageLike } from "./types.js";

function notInstalledError(channel: string): Error {
  return new Error(`Chromium distribution '${channel}' is not found at /opt/${channel}`);
}

class FakePage implements PageLike {
  readonly urls: string[] = [];

  async goto(url: string): Promise<void> {
    this.urls.push(url);
  }
}

class FakeContext implements BrowserContextLike {
  closed = false;
  private readonly page = new FakePage();

  pages(): PageLike[] {
    return [this.page];
  }

  async newPage(): Promise<PageLike> {
    return this.page;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

/** Fake chromium that succeeds only for channels in `installed`. */
function makeFakeChromium(installed: readonly string[]): {
  chromium: BrowserTypeLike;
  contexts: FakeContext[];
} {
  const contexts: FakeContext[] = [];
  const chromium: BrowserTypeLike = {
    async launchPersistentContext(_userDataDir, options) {
      if (!installed.includes(options.channel)) {
        throw notInstalledError(options.channel);
      }
      const context = new FakeContext();
      contexts.push(context);
      return context;
    },
  };
  return { chromium, contexts };
}

let profileRoot: string;

beforeEach(async () => {
  profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "jevschedule-wd-test-"));
});

afterEach(async () => {
  await fs.rm(profileRoot, { recursive: true, force: true });
});

describe("launchWorkdayBrowser", () => {
  it("launches with msedge when it is installed", async () => {
    const { chromium } = makeFakeChromium(["msedge", "chrome"]);

    const session = await launchWorkdayBrowser({
      startUrl: "https://example.com/workday",
      chromium,
      profileRoot,
    });

    expect(session.channel).toBe("msedge");
    expect((session.page as FakePage).urls).toEqual(["https://example.com/workday"]);
    expect(await pathExists(session.profileDir)).toBe(true);
  });

  it("falls back to chrome when msedge is not installed", async () => {
    const { chromium } = makeFakeChromium(["chrome"]);

    const session = await launchWorkdayBrowser({
      startUrl: "https://example.com/workday",
      chromium,
      profileRoot,
    });

    expect(session.channel).toBe("chrome");
  });

  it("throws NoSupportedBrowserError and leaves no temp dir when neither is installed", async () => {
    const { chromium } = makeFakeChromium([]);

    let thrown: unknown;
    try {
      await launchWorkdayBrowser({
        startUrl: "https://example.com/workday",
        chromium,
        profileRoot,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(NoSupportedBrowserError);
    expect((thrown as NoSupportedBrowserError).message).toMatch(/Edge|Chrome/);

    const entries = await fs.readdir(profileRoot);
    expect(entries).toEqual([]);
  });

  it("rethrows a non-install error and cleans up the temp dir", async () => {
    const chromium: BrowserTypeLike = {
      async launchPersistentContext() {
        throw new Error("boom: something else went wrong");
      },
    };

    await expect(
      launchWorkdayBrowser({ startUrl: "https://example.com/workday", chromium, profileRoot }),
    ).rejects.toThrow("boom: something else went wrong");

    const entries = await fs.readdir(profileRoot);
    expect(entries).toEqual([]);
  });
});

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

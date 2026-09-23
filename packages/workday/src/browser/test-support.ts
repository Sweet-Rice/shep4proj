import { promises as fs } from "node:fs";

import type { BrowserContextLike, BrowserTypeLike, PageLike } from "./types.js";

/** Shared test fakes for launch/teardown specs — never a real browser. */

export function notInstalledError(channel: string): Error {
  return new Error(`Chromium distribution '${channel}' is not found at /opt/${channel}`);
}

export class FakePage implements PageLike {
  readonly urls: string[] = [];

  async goto(url: string): Promise<void> {
    this.urls.push(url);
  }
}

export class FakeContext implements BrowserContextLike {
  closed = false;
  private readonly page = new FakePage();

  pages(): PageLike[] {
    return [this.page];
  }

  async newPage(): Promise<PageLike> {
    return this.page;
  }

  async close(): Promise<void> {
    if (this.closed) {
      throw new Error("Target page, context or browser has been closed");
    }
    this.closed = true;
  }
}

/** Fake chromium that succeeds only for channels in `installed`. */
export function makeFakeChromium(installed: readonly string[]): {
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

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

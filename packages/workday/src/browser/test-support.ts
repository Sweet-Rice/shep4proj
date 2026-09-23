import { promises as fs } from "node:fs";

import type {
  BrowserContextLike,
  BrowserContextLikeEvent,
  BrowserTypeLike,
  PageLike,
  PageLikeEvent,
} from "./types.js";

/** Shared test fakes for launch/teardown/login specs — never a real browser. */

export function notInstalledError(channel: string): Error {
  return new Error(`Chromium distribution '${channel}' is not found at /opt/${channel}`);
}

export class FakePage implements PageLike {
  readonly urls: string[] = [];
  private currentUrl = "about:blank";
  private readonly listeners = new Map<PageLikeEvent, Set<() => void>>();

  async goto(url: string): Promise<void> {
    this.urls.push(url);
    this.currentUrl = url;
  }

  url(): string {
    return this.currentUrl;
  }

  on(event: PageLikeEvent, listener: () => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(listener);
  }

  off(event: PageLikeEvent, listener: () => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  listenerCount(event: PageLikeEvent): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /** Test helper: simulate a main-frame navigation to `url`. */
  emitNavigation(url: string): void {
    this.currentUrl = url;
    for (const listener of [...(this.listeners.get("framenavigated") ?? [])]) {
      listener();
    }
  }

  /** Test helper: simulate the page/window being closed. */
  emitClose(): void {
    for (const listener of [...(this.listeners.get("close") ?? [])]) {
      listener();
    }
  }
}

export class FakeContext implements BrowserContextLike {
  closed = false;
  private readonly page = new FakePage();
  private readonly listeners = new Map<BrowserContextLikeEvent, Set<() => void>>();

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

  on(event: BrowserContextLikeEvent, listener: () => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(listener);
  }

  off(event: BrowserContextLikeEvent, listener: () => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  listenerCount(event: BrowserContextLikeEvent): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /** Test helper: simulate the browser window being closed. */
  emitClose(): void {
    for (const listener of [...(this.listeners.get("close") ?? [])]) {
      listener();
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

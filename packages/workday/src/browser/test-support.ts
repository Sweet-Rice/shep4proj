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
  private currentUrl: string;
  private readonly listeners = new Map<PageLikeEvent, Set<() => void>>();
  closed = false;

  constructor(initialUrl = "about:blank") {
    this.currentUrl = initialUrl;
  }

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
    this.closed = true;
    for (const listener of [...(this.listeners.get("close") ?? [])]) {
      listener();
    }
  }
}

export class FakeContext implements BrowserContextLike {
  closed = false;
  private readonly pageList: FakePage[] = [new FakePage()];
  private readonly listeners = new Map<
    BrowserContextLikeEvent,
    Set<(...args: PageLike[]) => void>
  >();

  pages(): PageLike[] {
    return this.pageList.filter((page) => !page.closed);
  }

  async newPage(): Promise<PageLike> {
    return this.addPage();
  }

  /**
   * Test helper: simulate the SSO/MFA flow opening a new tab or popup in
   * this context, firing the "page" event. `initialUrl` simulates a page
   * that already has its main-frame URL set the instant it appears (rather
   * than only after a later `emitNavigation`).
   */
  addPage(initialUrl?: string): FakePage {
    const page = new FakePage(initialUrl);
    this.pageList.push(page);
    for (const listener of [...(this.listeners.get("page") ?? [])]) {
      listener(page);
    }
    return page;
  }

  async close(): Promise<void> {
    if (this.closed) {
      throw new Error("Target page, context or browser has been closed");
    }
    this.closed = true;
  }

  on(event: BrowserContextLikeEvent, listener: (...args: PageLike[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(listener);
  }

  off(event: BrowserContextLikeEvent, listener: (...args: PageLike[]) => void): void {
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

/**
 * Minimal shapes of the playwright-core APIs this module depends on, so
 * tests can inject a fake `chromium` instead of launching a real browser.
 */

export type WorkdayBrowserChannel = "msedge" | "chrome";

/** Events this module listens for on a `PageLike` (T-314 login detection). */
export type PageLikeEvent = "framenavigated" | "close";

/** Events this module listens for on a `BrowserContextLike` (T-314 login detection). */
export type BrowserContextLikeEvent = "close";

export interface PageLike {
  goto(url: string): Promise<unknown>;
  /** Current main-frame URL, e.g. via Playwright's `page.url()`. */
  url(): string;
  on(event: PageLikeEvent, listener: () => void): unknown;
  off(event: PageLikeEvent, listener: () => void): unknown;
}

export interface BrowserContextLike {
  pages(): PageLike[];
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
  on(event: BrowserContextLikeEvent, listener: () => void): unknown;
  off(event: BrowserContextLikeEvent, listener: () => void): unknown;
}

export interface BrowserTypeLike {
  launchPersistentContext(
    userDataDir: string,
    options: { headless: boolean; channel: string } & Record<string, unknown>,
  ): Promise<BrowserContextLike>;
}

export interface WorkdayBrowserSession {
  context: BrowserContextLike;
  page: PageLike;
  profileDir: string;
  channel: WorkdayBrowserChannel;
}

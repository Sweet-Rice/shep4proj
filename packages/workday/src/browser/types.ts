/**
 * Minimal shapes of the playwright-core APIs this module depends on, so
 * tests can inject a fake `chromium` instead of launching a real browser.
 */

export type WorkdayBrowserChannel = "msedge" | "chrome";

export interface PageLike {
  goto(url: string): Promise<unknown>;
}

export interface BrowserContextLike {
  pages(): PageLike[];
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}

export interface BrowserTypeLike {
  launchPersistentContext(
    userDataDir: string,
    options: { headless: boolean; channel: string },
  ): Promise<BrowserContextLike>;
}

export interface WorkdayBrowserSession {
  context: BrowserContextLike;
  page: PageLike;
  profileDir: string;
  channel: WorkdayBrowserChannel;
}

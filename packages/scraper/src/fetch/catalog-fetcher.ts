import type { Browser, BrowserContext, Response as PageResponse } from "playwright-core";
import { createCrawlDelay } from "./crawl-delay.js";
import { CATALOG_CRAWL_DELAY_MS, DisallowedUrlError, assertAllowedCatalogUrl } from "./robots.js";

/**
 * The only way the scraper reaches `catalog.lsu.edu`. Every request is
 * checked against the `robots.txt` disallow list and spaced by the
 * `Crawl-delay`.
 */
export interface CatalogFetcher {
  /**
   * Returns the HTML body of a catalog page. Throws `DisallowedUrlError` for
   * a URL `robots.txt` forbids (before any network traffic), and `Error`
   * (`catalog fetch failed: <status> <url>`) when the page does not end in a
   * `200`.
   */
  fetchHtml(url: string): Promise<string>;
  /** Closes the browser if one was launched. Idempotent; the fetcher is unusable afterwards. */
  close(): Promise<void>;
}

export interface CatalogFetcherOptions {
  /**
   * Minimum spacing between requests. Defaults to, and may not go below,
   * `CATALOG_CRAWL_DELAY_MS`; a smaller value throws `RangeError`.
   */
  crawlDelayMs?: number;
  /** Installed browser to drive: `chrome`, `msedge`, ... Defaults to `$CATALOG_BROWSER_CHANNEL`, then `chrome`. */
  browserChannel?: string;
  /** Run the browser without a window. Defaults to true. */
  headless?: boolean;
  /** Receives `fetch <ISO time> <url>` once per request, right before it goes out. */
  log?: (message: string) => void;
}

/**
 * Course detail pages need no JavaScript, so they are fetched with plain
 * HTTP. Every other catalog page answers plain HTTP clients with an AWS WAF
 * JavaScript challenge (`202`, empty body) and is loaded in a real browser.
 */
const PLAIN_HTTP_PATH = "/preview_course_nopop.php";

const USER_AGENT = "JevSchedule catalog scraper (+https://github.com/Sweet-Rice/shep4proj)";

/** How long the browser waits for the challenge to pass and the `200` page to arrive. */
const BROWSER_RESPONSE_TIMEOUT_MS = 60_000;

interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
}

/**
 * Creates the catalog fetcher. The browser (`playwright-core` driving an
 * installed Chrome or Edge, never a downloaded one) is launched on the first
 * request that needs it, so fetching only course detail pages never starts one.
 */
export function createCatalogFetcher(opts: CatalogFetcherOptions = {}): CatalogFetcher {
  const crawlDelayMs = opts.crawlDelayMs ?? CATALOG_CRAWL_DELAY_MS;
  if (
    !Number.isFinite(crawlDelayMs) ||
    crawlDelayMs < CATALOG_CRAWL_DELAY_MS ||
    crawlDelayMs > 2_147_483_647
  ) {
    throw new RangeError(
      `crawlDelayMs must be between ${CATALOG_CRAWL_DELAY_MS} (robots.txt Crawl-delay) and 2147483647, got ${crawlDelayMs}`,
    );
  }
  const log = opts.log ?? (() => undefined);
  const delay = createCrawlDelay({ minIntervalMs: crawlDelayMs });

  let session: Promise<BrowserSession> | undefined;
  let closing: Promise<void> | undefined;

  function assertOpen(): void {
    if (closing !== undefined) {
      throw new Error("catalog fetcher is closed");
    }
  }

  function getSession(): Promise<BrowserSession> {
    session ??= launchSession(opts).catch((error: unknown) => {
      session = undefined;
      throw error;
    });
    return session;
  }

  /**
   * Loads `url` in a browser and returns the body of the `200` main-frame
   * document. The WAF challenge answers first with an empty `202` page whose
   * script sets a cookie and reloads, so the `200` arrives after `goto`
   * settles; the wait is registered before `goto` so it cannot be missed.
   */
  async function fetchWithBrowser(url: string): Promise<string> {
    const target = new URL(url);
    const { context } = await getSession();
    const page = await context.newPage();
    try {
      const isTargetDocument = (response: PageResponse): boolean => {
        const request = response.request();
        if (!request.isNavigationRequest() || request.frame() !== page.mainFrame()) {
          return false;
        }
        const responseUrl = new URL(response.url());
        return responseUrl.origin === target.origin && responseUrl.pathname === target.pathname;
      };

      let lastStatus: number | undefined;
      page.on("response", (response) => {
        if (isTargetDocument(response)) {
          lastStatus = response.status();
        }
      });
      const finalResponse = page.waitForResponse(
        (response) => isTargetDocument(response) && response.status() === 200,
        { timeout: BROWSER_RESPONSE_TIMEOUT_MS },
      );
      // The challenge can interrupt this first navigation with its own reload,
      // so a `goto` failure only matters if the `200` never arrives.
      let navigationError: unknown;
      page.goto(url, { waitUntil: "load" }).catch((error: unknown) => {
        navigationError = error;
      });

      let response: PageResponse;
      try {
        response = await finalResponse;
      } catch (error) {
        if (!(error instanceof Error) || error.name !== "TimeoutError") {
          throw error;
        }
        throw new Error(`catalog fetch failed: ${lastStatus ?? "timeout"} ${url}`, {
          cause: navigationError ?? error,
        });
      }
      return await response.text();
    } finally {
      await page.close();
    }
  }

  async function fetchWithHttp(url: string): Promise<string> {
    const response = await globalThis.fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "manual",
    });
    if (response.status !== 200) {
      throw new Error(`catalog fetch failed: ${response.status} ${url}`);
    }
    return response.text();
  }

  return {
    async fetchHtml(url: string): Promise<string> {
      assertOpen();
      assertAllowedCatalogUrl(url);
      await delay.wait();
      assertOpen();
      log(`fetch ${new Date().toISOString()} ${url}`);
      return new URL(url).pathname === PLAIN_HTTP_PATH ? fetchWithHttp(url) : fetchWithBrowser(url);
    },

    close(): Promise<void> {
      closing ??= (async () => {
        const launched = await session?.catch(() => undefined);
        await launched?.browser.close();
      })();
      return closing;
    },
  };
}

async function launchSession(opts: CatalogFetcherOptions): Promise<BrowserSession> {
  // Loaded on first use so importing the package (and every test) never pulls in playwright.
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    channel: opts.browserChannel ?? (process.env["CATALOG_BROWSER_CHANNEL"] || "chrome"),
    headless: opts.headless ?? true,
  });
  try {
    // One context for the whole crawl, so the WAF cookie earned by the first page is reused.
    const context = await browser.newContext();
    await context.route("**/*", async (route) => {
      const requestUrl = route.request().url();
      let isCatalogHost = false;
      try {
        const parsed = new URL(requestUrl);
        isCatalogHost = parsed.hostname.toLowerCase() === "catalog.lsu.edu";
      } catch {
        await route.continue();
        return;
      }
      if (isCatalogHost) {
        try {
          assertAllowedCatalogUrl(requestUrl);
        } catch (error) {
          if (error instanceof DisallowedUrlError) {
            await route.abort();
            return;
          }
          throw error;
        }
      }
      await route.continue();
    });
    return { browser, context };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

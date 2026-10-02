import { createCrawlDelay } from "./crawl-delay.js";

/**
 * Minimum spacing between Course Offerings requests. The portal publishes no `robots.txt`
 * (checked 2026-09-29: `/robots.txt` redirects to its 404 page), so there's no stated crawl
 * delay; this is a conservative floor. A full scrape is one landing page plus one page per
 * academic period, so it still finishes in about a minute.
 */
export const SECTION_CRAWL_DELAY_MS = 10_000;

const SECTION_HOST = "courseofferings.lsu.edu";

/** The listing page is the only path the scraper reads. */
const LISTING_PATH = "/LSU";

const USER_AGENT = "JevSchedule section scraper (+https://github.com/Sweet-Rice/shep4proj)";

/** Thrown for a URL the section fetcher must never request. */
export class DisallowedSectionUrlError extends Error {
  constructor(url: string, reason: string) {
    super(`section URL is not allowed (${reason}): ${url}`);
    this.name = "DisallowedSectionUrlError";
  }
}

/**
 * Throws {@link DisallowedSectionUrlError} unless `url` is a Course Offerings listing page:
 * `https://courseofferings.lsu.edu/LSU` on the default port with no credentials. The path is an
 * allowlist of one, so nothing else on the host is ever fetched.
 */
export function assertAllowedSectionUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DisallowedSectionUrlError(url, "not a valid URL");
  }
  if (parsed.protocol !== "https:") {
    throw new DisallowedSectionUrlError(url, "protocol must be https");
  }
  if (parsed.hostname !== SECTION_HOST) {
    throw new DisallowedSectionUrlError(url, `host must be ${SECTION_HOST}`);
  }
  if (parsed.port !== "") {
    throw new DisallowedSectionUrlError(url, "custom ports are not allowed");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new DisallowedSectionUrlError(url, "credentials in the URL are not allowed");
  }
  if (parsed.pathname !== LISTING_PATH) {
    throw new DisallowedSectionUrlError(url, `path must be ${LISTING_PATH}`);
  }
}

/** The only way the scraper reaches the Course Offerings portal (T-403). */
export interface SectionFetcher {
  /**
   * Returns the HTML of a listing page. Throws `DisallowedSectionUrlError` for any other URL
   * (before any network traffic), and `Error` (`section fetch failed: <status> <url>`) unless
   * the response is a `200`. Redirects are not followed.
   */
  fetchHtml(url: string): Promise<string>;
}

export interface SectionFetcherOptions {
  /**
   * Minimum spacing between requests. Defaults to, and may not go below,
   * `SECTION_CRAWL_DELAY_MS`; a smaller value throws `RangeError`.
   */
  crawlDelayMs?: number;
  /** Receives `fetch <ISO time> <url>` once per request, right before it goes out. */
  log?: (message: string) => void;
}

/**
 * Creates the section fetcher. Listing pages are server-rendered HTML, so plain `fetch` is
 * enough; no browser is needed.
 */
export function createSectionFetcher(opts: SectionFetcherOptions = {}): SectionFetcher {
  const crawlDelayMs = opts.crawlDelayMs ?? SECTION_CRAWL_DELAY_MS;
  if (
    !Number.isFinite(crawlDelayMs) ||
    crawlDelayMs < SECTION_CRAWL_DELAY_MS ||
    crawlDelayMs > 2_147_483_647
  ) {
    throw new RangeError(
      `crawlDelayMs must be between ${SECTION_CRAWL_DELAY_MS} and 2147483647, got ${crawlDelayMs}`,
    );
  }
  const log = opts.log ?? (() => undefined);
  const delay = createCrawlDelay({ minIntervalMs: crawlDelayMs });

  return {
    async fetchHtml(url: string): Promise<string> {
      assertAllowedSectionUrl(url);
      return delay.run(async () => {
        log(`fetch ${new Date().toISOString()} ${url}`);
        const response = await globalThis.fetch(url, {
          headers: { "User-Agent": USER_AGENT },
          redirect: "manual",
        });
        if (response.status !== 200) {
          throw new Error(`section fetch failed: ${response.status} ${url}`);
        }
        return response.text();
      });
    },
  };
}

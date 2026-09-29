/**
 * `catalog.lsu.edu/robots.txt` sets `Crawl-delay: 120`: at most one request
 * every 120 seconds. The fetcher spaces every request by at least this long.
 */
export const CATALOG_CRAWL_DELAY_MS = 120_000;

const CATALOG_HOST = "catalog.lsu.edu";

/** `robots.txt` disallows everything under this directory (`/ajax/`). */
const DISALLOWED_DIRECTORY = "/ajax";

/** Pages `robots.txt` disallows, matched exactly. */
const DISALLOWED_PAGES: Record<string, true> = {
  "/search_advanced.php": true,
  "/portfolio.php": true,
  "/portfolio_nopop.php": true,
};

/** Thrown for a URL the catalog fetcher must never request. */
export class DisallowedUrlError extends Error {
  constructor(url: string, reason: string) {
    super(`catalog URL is not allowed (${reason}): ${url}`);
    this.name = "DisallowedUrlError";
  }
}

/**
 * The path the way a server that ignores case, repeated slashes and
 * percent-encoded letters would resolve it, so `/AJAX/x`, `//ajax/x` and
 * `/%61jax/x` cannot slip past the `/ajax/` rule. Returns null when the
 * percent-encoding is malformed.
 */
function normalizedPath(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname)
      .toLowerCase()
      .replace(/\/{2,}/g, "/");
  } catch {
    return null;
  }
}

/**
 * Throws {@link DisallowedUrlError} unless `url` is one the fetcher may
 * request: `https://catalog.lsu.edu` (default port, no credentials), outside
 * the paths `robots.txt` disallows (`/ajax/`, `/search_advanced.php`,
 * `/portfolio.php`, `/portfolio_nopop.php`). An unparseable URL is rejected
 * too.
 */
export function assertAllowedCatalogUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DisallowedUrlError(url, "not a valid URL");
  }

  if (parsed.protocol !== "https:") {
    throw new DisallowedUrlError(url, "protocol must be https");
  }
  if (parsed.hostname !== CATALOG_HOST) {
    throw new DisallowedUrlError(url, `host must be ${CATALOG_HOST}`);
  }
  if (parsed.port !== "") {
    throw new DisallowedUrlError(url, "custom ports are not allowed");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new DisallowedUrlError(url, "credentials in the URL are not allowed");
  }

  const path = normalizedPath(parsed.pathname);
  if (path === null) {
    throw new DisallowedUrlError(url, "malformed percent-encoding in the path");
  }
  const underDisallowedDirectory =
    path === DISALLOWED_DIRECTORY || path.startsWith(`${DISALLOWED_DIRECTORY}/`);
  if (underDisallowedDirectory || Object.hasOwn(DISALLOWED_PAGES, path)) {
    throw new DisallowedUrlError(url, "path is disallowed by robots.txt");
  }
}

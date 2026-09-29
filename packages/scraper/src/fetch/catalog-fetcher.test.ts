import { afterEach, describe, expect, it, vi } from "vitest";
import { CATALOG_2026_2027, courseDetailUrl } from "../catalog/urls.js";
import { createCatalogFetcher } from "./catalog-fetcher.js";
import { DisallowedUrlError } from "./robots.js";

const DETAIL_URL = courseDetailUrl({ catoid: CATALOG_2026_2027.catoid, coid: "232623" });

// Every test makes at most one request per fetcher: the crawl delay only
// sleeps from the second request on, so nothing here ever waits or touches the
// network, and the browser (only used for non-detail pages) is never launched.
function stubFetch() {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createCatalogFetcher", () => {
  it.each([1000, 119_999, -1, Number.NaN])(
    "rejects crawlDelayMs %s below the robots.txt floor",
    (crawlDelayMs) => {
      expect(() => createCatalogFetcher({ crawlDelayMs })).toThrow(RangeError);
    },
  );

  it.each([undefined, 120_000, 300_000])("accepts crawlDelayMs %s", (crawlDelayMs) => {
    expect(() => createCatalogFetcher({ crawlDelayMs })).not.toThrow();
  });

  it("rejects a disallowed URL before any network request or log line", async () => {
    const fetchMock = stubFetch();
    const log = vi.fn();
    const fetcher = createCatalogFetcher({ log });

    await expect(
      fetcher.fetchHtml("https://catalog.lsu.edu/ajax/preview_course.php?catoid=35&coid=1"),
    ).rejects.toThrow(DisallowedUrlError);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("fetches a course detail page over plain HTTP with the project User-Agent", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(new Response("<html>detail</html>", { status: 200 }));
    const fetcher = createCatalogFetcher();

    await expect(fetcher.fetchHtml(DETAIL_URL)).resolves.toBe("<html>detail</html>");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(DETAIL_URL, {
      headers: {
        "User-Agent": "JevSchedule catalog scraper (+https://github.com/Sweet-Rice/shep4proj)",
      },
    });
  });

  it("logs `fetch <ISO time> <url>` once, right before the request goes out", async () => {
    const fetchMock = stubFetch();
    const events: string[] = [];
    fetchMock.mockImplementation(() => {
      events.push("request");
      return Promise.resolve(new Response("<html></html>", { status: 200 }));
    });
    const fetcher = createCatalogFetcher({ log: (message) => events.push(message) });

    await fetcher.fetchHtml(DETAIL_URL);

    expect(events).toHaveLength(2);
    const logged = /^fetch (\S+) (.*)$/.exec(events[0] ?? "");
    expect(logged?.[2]).toBe(DETAIL_URL);
    const isoTime = logged?.[1] ?? "";
    expect(new Date(isoTime).toISOString()).toBe(isoTime);
    expect(events[1]).toBe("request");
  });

  it("throws `catalog fetch failed: <status> <url>` for a non-200 response", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(new Response("denied", { status: 403 }));
    const fetcher = createCatalogFetcher();

    await expect(fetcher.fetchHtml(DETAIL_URL)).rejects.toThrow(
      `catalog fetch failed: 403 ${DETAIL_URL}`,
    );
  });

  it("rejects a response whose final URL, after redirects, is disallowed", async () => {
    const fetchMock = stubFetch();
    const redirected = new Response("<html></html>", { status: 200 });
    Object.defineProperty(redirected, "url", {
      value: "https://catalog.lsu.edu/ajax/preview_course.php?catoid=35&coid=1",
    });
    fetchMock.mockResolvedValue(redirected);
    const fetcher = createCatalogFetcher();

    await expect(fetcher.fetchHtml(DETAIL_URL)).rejects.toThrow(DisallowedUrlError);
  });

  it("refuses requests after close and lets close be called again", async () => {
    const fetchMock = stubFetch();
    const fetcher = createCatalogFetcher();

    await fetcher.close();
    await expect(fetcher.close()).resolves.toBeUndefined();
    await expect(fetcher.fetchHtml(DETAIL_URL)).rejects.toThrow("catalog fetcher is closed");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

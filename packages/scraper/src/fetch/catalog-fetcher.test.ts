import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG_2026_2027, courseDetailUrl } from "../catalog/urls.js";
import { createCatalogFetcher } from "./catalog-fetcher.js";
import { DisallowedUrlError } from "./robots.js";

const DETAIL_URL = courseDetailUrl({ catoid: CATALOG_2026_2027.catoid, coid: "232623" });
const mockWait = vi.fn().mockResolvedValue(undefined);
vi.mock("./crawl-delay.js", () => ({
  createCrawlDelay: vi.fn(() => ({
    wait: mockWait,
  })),
}));

// Every test makes at most one request per fetcher: the crawl delay only
// sleeps from the second request on, so nothing here ever waits or touches the
// network, and the browser (only used for non-detail pages) is never launched.
function stubFetch() {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  mockWait.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createCatalogFetcher", () => {
  it.each([1000, 119_999, -1, Number.NaN, Number.POSITIVE_INFINITY, 3e9])(
    "rejects crawlDelayMs %s out of range",
    (crawlDelayMs) => {
      expect(() => createCatalogFetcher({ crawlDelayMs })).toThrow(RangeError);
    },
  );

  it.each([undefined, 120_000, 300_000, 2_147_483_647])(
    "accepts crawlDelayMs %s",
    (crawlDelayMs) => {
      expect(() => createCatalogFetcher({ crawlDelayMs })).not.toThrow();
    },
  );

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
      redirect: "manual",
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

  it("does not follow redirects and rejects a 3xx response with catalog fetch failed", async () => {
    const fetchMock = stubFetch();
    const ajaxUrl = "https://catalog.lsu.edu/ajax/preview_course.php?catoid=35&coid=1";
    fetchMock.mockResolvedValue(
      new Response("", {
        status: 302,
        headers: { Location: ajaxUrl },
      }),
    );
    const fetcher = createCatalogFetcher();

    await expect(fetcher.fetchHtml(DETAIL_URL)).rejects.toThrow(
      `catalog fetch failed: 302 ${DETAIL_URL}`,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(DETAIL_URL, {
      headers: {
        "User-Agent": "JevSchedule catalog scraper (+https://github.com/Sweet-Rice/shep4proj)",
      },
      redirect: "manual",
    });
    expect(fetchMock).not.toHaveBeenCalledWith(ajaxUrl, expect.anything());
  });

  it("runs the crawl delay through the fetcher after the allow check and before fetch", async () => {
    const events: string[] = [];
    mockWait.mockImplementation(async () => {
      events.push("wait");
    });
    const fetchMock = stubFetch();
    fetchMock.mockImplementation(async () => {
      events.push("fetch");
      return new Response("<html></html>", { status: 200 });
    });
    const fetcher = createCatalogFetcher();

    const disallowedUrl = "https://catalog.lsu.edu/ajax/preview_course.php?catoid=35&coid=1";
    await expect(fetcher.fetchHtml(disallowedUrl)).rejects.toThrow(DisallowedUrlError);
    expect(mockWait).not.toHaveBeenCalled();
    expect(events).toEqual([]);

    await fetcher.fetchHtml(DETAIL_URL);
    expect(events).toEqual(["wait", "fetch"]);
    expect(mockWait).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sectionListingUrl } from "../sections/urls.js";
import {
  assertAllowedSectionUrl,
  createSectionFetcher,
  DisallowedSectionUrlError,
  SECTION_CRAWL_DELAY_MS,
} from "./section-fetcher.js";

const mockRun = vi.fn(<T>(task: () => Promise<T>) => task());
vi.mock("./crawl-delay.js", () => ({
  createCrawlDelay: vi.fn(() => ({ run: mockRun })),
}));

const LISTING_URL = sectionListingUrl({ department: "CSC", periodId: "LSUAM_FALL_2026" });

function stubFetch() {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  mockRun.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sectionListingUrl", () => {
  it("builds the landing page URL", () => {
    expect(sectionListingUrl({ department: "CSC" })).toBe(
      "https://courseofferings.lsu.edu/LSU?University=AU00000079&Department=CSC",
    );
  });

  it("builds a period listing URL matching the fixture's source", () => {
    expect(LISTING_URL).toBe(
      "https://courseofferings.lsu.edu/LSU?University=AU00000079&Department=CSC&AcademicPeriod=LSUAM_FALL_2026",
    );
  });

  it("encodes the department", () => {
    expect(sectionListingUrl({ department: "A&B" })).toContain("Department=A%26B");
  });
});

describe("assertAllowedSectionUrl", () => {
  it("accepts listing pages", () => {
    expect(() => assertAllowedSectionUrl(LISTING_URL)).not.toThrow();
    expect(() => assertAllowedSectionUrl(sectionListingUrl({ department: "CSC" }))).not.toThrow();
  });

  it.each([
    ["http", "http://courseofferings.lsu.edu/LSU?Department=CSC"],
    ["another host", "https://catalog.lsu.edu/LSU"],
    ["a lookalike host", "https://courseofferings.lsu.edu.example.com/LSU"],
    ["a custom port", "https://courseofferings.lsu.edu:8443/LSU"],
    ["credentials", "https://user:pw@courseofferings.lsu.edu/LSU"],
    ["another path", "https://courseofferings.lsu.edu/Error/Index/404"],
    ["a sub-path", "https://courseofferings.lsu.edu/LSU/Export"],
    ["garbage", "not a url"],
  ])("rejects %s", (_label, url) => {
    expect(() => assertAllowedSectionUrl(url)).toThrow(DisallowedSectionUrlError);
  });
});

describe("createSectionFetcher", () => {
  it.each([0, SECTION_CRAWL_DELAY_MS - 1, -1, Number.NaN, Number.POSITIVE_INFINITY, 3e9])(
    "rejects crawlDelayMs %s",
    (crawlDelayMs) => {
      expect(() => createSectionFetcher({ crawlDelayMs })).toThrow(RangeError);
    },
  );

  it("rejects a disallowed URL before any request, wait or log line", async () => {
    const fetchMock = stubFetch();
    const log = vi.fn();
    await expect(
      createSectionFetcher({ log }).fetchHtml("https://courseofferings.lsu.edu/Admin"),
    ).rejects.toThrow(DisallowedSectionUrlError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("waits for the crawl delay, then fetches with the project User-Agent and no redirects", async () => {
    const fetchMock = stubFetch().mockResolvedValue(new Response("<html></html>", { status: 200 }));
    const log = vi.fn();

    await expect(createSectionFetcher({ log }).fetchHtml(LISTING_URL)).resolves.toBe(
      "<html></html>",
    );

    expect(mockRun).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(LISTING_URL, {
      headers: { "User-Agent": expect.stringContaining("JevSchedule") },
      redirect: "manual",
    });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^fetch \S+ https:\/\/courseofferings/));
  });

  it.each([302, 404, 500])("throws on a %s response", async (status) => {
    stubFetch().mockResolvedValue(new Response(null, { status }));
    await expect(createSectionFetcher().fetchHtml(LISTING_URL)).rejects.toThrow(
      `section fetch failed: ${status} ${LISTING_URL}`,
    );
  });
});

import { describe, expect, it } from "vitest";
import { CATALOG_2026_2027, courseDetailUrl, courseListUrl } from "../catalog/urls.js";
import { CATALOG_CRAWL_DELAY_MS, DisallowedUrlError, assertAllowedCatalogUrl } from "./robots.js";

describe("CATALOG_CRAWL_DELAY_MS", () => {
  it("is the 120 s robots.txt Crawl-delay", () => {
    expect(CATALOG_CRAWL_DELAY_MS).toBe(120_000);
  });
});

describe("assertAllowedCatalogUrl", () => {
  it("allows the course list URL from the fixture README", () => {
    const url = courseListUrl({ ...CATALOG_2026_2027, prefix: "CSC", page: 1 });
    expect(() => assertAllowedCatalogUrl(url)).not.toThrow();
  });

  it("allows the course detail URL from the fixture README", () => {
    const url = courseDetailUrl({ catoid: "35", coid: "229578" });
    expect(() => assertAllowedCatalogUrl(url)).not.toThrow();
  });

  it("allows the program page and ignores the case of the host", () => {
    expect(() =>
      assertAllowedCatalogUrl("https://CATALOG.LSU.EDU/preview_program.php?catoid=35&poid=14278"),
    ).not.toThrow();
  });

  it.each([
    ["an /ajax/ URL", "https://catalog.lsu.edu/ajax/preview_course.php?catoid=35&coid=1"],
    ["the bare /ajax path", "https://catalog.lsu.edu/ajax"],
    ["a differently cased /AJAX/ URL", "https://catalog.lsu.edu/AJAX/preview_course.php"],
    ["a doubled slash before ajax", "https://catalog.lsu.edu//ajax/preview_course.php"],
    ["a percent-encoded letter in ajax", "https://catalog.lsu.edu/%61jax/preview_course.php"],
    [
      "a dot segment that resolves into /ajax/",
      "https://catalog.lsu.edu/content.php/../ajax/x.php",
    ],
    ["a percent-encoded dot segment into /ajax/", "https://catalog.lsu.edu/x/..%2fajax/y.php"],
    ["/portfolio.php", "https://catalog.lsu.edu/portfolio.php?catoid=35"],
    ["/portfolio_nopop.php", "https://catalog.lsu.edu/portfolio_nopop.php"],
    ["/search_advanced.php", "https://catalog.lsu.edu/search_advanced.php?catoid=35"],
    ["/portfolio.php/", "https://catalog.lsu.edu/portfolio.php/"],
    ["/portfolio.php/extra", "https://catalog.lsu.edu/portfolio.php/extra"],
    ["/portfolio_nopop.php/x", "https://catalog.lsu.edu/portfolio_nopop.php/x"],
    ["/search_advanced.php/x", "https://catalog.lsu.edu/search_advanced.php/x"],
    ["a plain http URL", "http://catalog.lsu.edu/content.php?catoid=35"],
    ["another host", "https://example.com/"],
    ["a look-alike host", "https://catalog.lsu.edu.example.com/content.php"],
    ["a subdomain of the catalog host", "https://www.catalog.lsu.edu/content.php"],
    ["a non-default port", "https://catalog.lsu.edu:8443/content.php"],
    ["credentials in the URL", "https://user:secret@catalog.lsu.edu/content.php"],
    ["malformed percent-encoding", "https://catalog.lsu.edu/%E0%A4%A"],
    ["a string that is not a URL", "not a url"],
    ["an empty string", ""],
  ])("throws DisallowedUrlError for %s", (_label, url) => {
    expect(() => assertAllowedCatalogUrl(url)).toThrow(DisallowedUrlError);
  });

  it("names the offending URL in the error", () => {
    const url = "https://catalog.lsu.edu/ajax/preview_course.php?catoid=35&coid=1";
    let caught: unknown;
    try {
      assertAllowedCatalogUrl(url);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DisallowedUrlError);
    expect((caught as DisallowedUrlError).name).toBe("DisallowedUrlError");
    expect((caught as DisallowedUrlError).message).toContain(url);
  });
});

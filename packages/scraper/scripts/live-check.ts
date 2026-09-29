/**
 * Opt-in live check of the catalog fetch layer. Not run in CI: it makes real
 * requests to catalog.lsu.edu, and `robots.txt` asks for one request per 120 s,
 * so it takes over two minutes.
 *
 * Fetches the CSC course list (through the browser, past the AWS WAF
 * challenge) and then the CSC 4330 detail page (plain HTTP), parsing both.
 *
 * Usage: pnpm --filter @jevschedule/scraper live-check
 * (runs against the build output, so it builds first)
 *
 * Environment:
 *   CATALOG_BROWSER_CHANNEL  installed browser to drive (default chrome; e.g. msedge)
 *   CATALOG_HEADLESS=false   show the browser window if headless fails the challenge
 */
import {
  CATALOG_2026_2027,
  courseDetailUrl,
  courseListUrl,
  createCatalogFetcher,
  parseCourseDetail,
  parseCourseList,
} from "../dist/index.js";

async function main(): Promise<void> {
  const fetcher = createCatalogFetcher({
    log: console.log,
    headless: process.env["CATALOG_HEADLESS"] !== "false",
  });

  try {
    const listHtml = await fetcher.fetchHtml(
      courseListUrl({ ...CATALOG_2026_2027, prefix: "CSC", page: 1 }),
    );
    const entries = parseCourseList(listHtml);
    console.log(`list: ${entries.length} courses`);

    const target = entries.find((entry) => entry.code === "CSC 4330");
    if (target === undefined) {
      throw new Error("CSC 4330 is not on the CSC course list");
    }

    const detailHtml = await fetcher.fetchHtml(
      courseDetailUrl({ catoid: CATALOG_2026_2027.catoid, coid: target.coid }),
    );
    const detail = parseCourseDetail(detailHtml);
    console.log(`detail: ${detail.code} ${detail.title} prereq=${detail.prerequisiteText}`);
  } finally {
    await fetcher.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

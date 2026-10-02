import { and, count, eq, max } from "drizzle-orm";
import { CATALOG_2026_2027, type CatalogFetcher } from "@jevschedule/scraper";
import type { Db } from "../db/client.js";
import { courses } from "../db/schema.js";
import { runCatalogScrape } from "./scrape-job.js";

export const CATALOG_SCRAPE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const CATALOG_SCRAPE_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function runScheduledCatalogScrape(o: {
  db: Db;
  createFetcher: () => CatalogFetcher;
  runScrape?: typeof runCatalogScrape;
  now?: () => number;
  log: (message: string) => void;
}): Promise<"skipped" | "scraped"> {
  const [freshness] = await o.db
    .select({ count: count(), latest: max(courses.updatedAt) })
    .from(courses)
    .where(and(eq(courses.catalogYear, CATALOG_2026_2027.catalogYear), eq(courses.dept, "CSC")));
  const now = o.now ?? Date.now;
  if (
    freshness !== undefined &&
    freshness.count > 0 &&
    freshness.latest !== null &&
    now() - freshness.latest.getTime() < CATALOG_SCRAPE_MIN_AGE_MS
  ) {
    o.log("catalog scrape skipped: refreshed within 7 days");
    return "skipped";
  }

  const fetcher = o.createFetcher();
  try {
    const result = await (o.runScrape ?? runCatalogScrape)({
      db: o.db,
      fetcher,
      ...CATALOG_2026_2027,
      prefix: "CSC",
      log: o.log,
    });
    o.log(
      `catalog scrape finished: ${result.listed} listed, ${result.upserted} upserted, ${result.failed.length} failed`,
    );
    for (const failure of result.failed) {
      o.log(`${failure.code}: failed: ${failure.error}`);
    }
    return "scraped";
  } finally {
    await fetcher.close();
  }
}

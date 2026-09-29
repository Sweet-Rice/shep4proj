import { fileURLToPath } from "node:url";
import { CATALOG_2026_2027 } from "@jevschedule/scraper";
import type { Db } from "../db/client.js";
import { createFixtureFetcher, FIXTURE_DETAIL_COIDS } from "./fixture-fetcher.js";
import { runCatalogScrape } from "./scrape-job.js";

/**
 * Absolute path to fixtures/catalog/2026-2027/, resolved from import.meta.url.
 */
export const CATALOG_FIXTURE_DIR = fileURLToPath(
  new URL("../../../../fixtures/catalog/2026-2027/", import.meta.url),
);

/**
 * Seeds the database from the checked-in catalog fixtures for 2026-2027.
 * Returns the number of upserted courses, or throws if any course failed to scrape.
 */
export async function seedCatalogFixtures(db: Db): Promise<number> {
  const result = await runCatalogScrape({
    db,
    fetcher: createFixtureFetcher(CATALOG_FIXTURE_DIR),
    ...CATALOG_2026_2027,
    prefix: "CSC",
    codes: Object.keys(FIXTURE_DETAIL_COIDS),
  });

  if (result.failed.length > 0) {
    const details = result.failed.map((f) => `${f.code}: ${f.error}`).join("; ");
    throw new Error(`Failed to seed catalog fixtures: ${details}`);
  }

  return result.upserted;
}

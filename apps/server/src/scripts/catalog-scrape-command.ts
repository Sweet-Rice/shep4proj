import { CATALOG_2026_2027, createCatalogFetcher } from "@jevschedule/scraper";
import { createDb } from "../db/client.js";
import { runCatalogScrape } from "../catalog/scrape-job.js";

export interface CatalogScrapeCommandDependencies {
  createDb: typeof createDb;
  createCatalogFetcher: typeof createCatalogFetcher;
  runCatalogScrape: typeof runCatalogScrape;
  log: (message: string) => void;
  error: (message: string) => void;
}

export async function runCatalogScrapeCommand(
  databaseUrl: string | undefined,
  dependencies: CatalogScrapeCommandDependencies,
): Promise<number> {
  if (!databaseUrl) {
    dependencies.error("DATABASE_URL is not set (see .env.example)");
    return 1;
  }

  const { db, close } = dependencies.createDb(databaseUrl);
  try {
    const fetcher = dependencies.createCatalogFetcher({ log: dependencies.log });
    try {
      const result = await dependencies.runCatalogScrape({
        db,
        fetcher,
        ...CATALOG_2026_2027,
        prefix: "CSC",
        log: dependencies.log,
      });
      dependencies.log(
        `${result.listed} courses listed; ${result.upserted} courses stored/upserted`,
      );
      for (const { code, error } of result.failed) {
        dependencies.error(`${code}: failed: ${error}`);
      }
      return result.failed.length > 0 ? 1 : 0;
    } finally {
      await fetcher.close();
    }
  } finally {
    await close();
  }
}

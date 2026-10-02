import { createCatalogFetcher } from "@jevschedule/scraper";
import { createDb } from "../db/client.js";
import { runScheduledCatalogScrape } from "../catalog/scheduled-scrape.js";

export interface CatalogScrapeCommandDependencies {
  createDb: typeof createDb;
  createCatalogFetcher: typeof createCatalogFetcher;
  runScheduledCatalogScrape: typeof runScheduledCatalogScrape;
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
    const result = await dependencies.runScheduledCatalogScrape({
      db,
      createFetcher: () => dependencies.createCatalogFetcher({ log: dependencies.log }),
      log: dependencies.log,
    });
    dependencies.log(
      `${result.scraped.length} departments scraped; ${result.skipped.length} skipped`,
    );
    for (const { code, error } of result.failed) {
      dependencies.error(`${code}: failed: ${error}`);
    }
    return result.failed.length > 0 ? 1 : 0;
  } finally {
    await close();
  }
}

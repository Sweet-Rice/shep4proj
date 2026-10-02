import { existsSync } from "node:fs";
import { CATALOG_2026_2027, createCatalogFetcher } from "@jevschedule/scraper";
import { createDb } from "../db/client.js";
import { runCatalogScrape } from "../catalog/scrape-job.js";

// Runs the catalog scrape once against the live LSU catalog, for local/operator use only.
// CI never runs this; it requires an installed Chrome or Edge browser, which the server image
// does not contain.

// Scripts run with cwd = apps/server; the repo-root .env is shared with docker compose.
if (!process.env.DATABASE_URL && existsSync("../../.env")) {
  process.loadEnvFile("../../.env");
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (see .env.example)");
  process.exit(1);
}

async function main(databaseUrl: string): Promise<void> {
  const { db, close } = createDb(databaseUrl);
  try {
    const fetcher = createCatalogFetcher({ log: console.log });
    try {
      const result = await runCatalogScrape({
        db,
        fetcher,
        ...CATALOG_2026_2027,
        prefix: "CSC",
        log: console.log,
      });
      console.log(`${result.listed} courses listed; ${result.upserted} courses stored/upserted`);
      for (const { code, error } of result.failed) {
        console.error(`${code}: failed: ${error}`);
      }
      if (result.failed.length > 0) {
        process.exitCode = 1;
      }
    } finally {
      await fetcher.close();
    }
  } finally {
    await close();
  }
}

main(url).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

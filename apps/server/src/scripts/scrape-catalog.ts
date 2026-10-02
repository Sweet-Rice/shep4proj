import { existsSync } from "node:fs";
import { createCatalogFetcher } from "@jevschedule/scraper";
import { createDb } from "../db/client.js";
import { runScheduledCatalogScrape } from "../catalog/scheduled-scrape.js";
import { runCatalogScrapeCommand } from "./catalog-scrape-command.js";

// For local one-off runs; deployed servers run this on a schedule (CATALOG_SCRAPE_ENABLED).

// Scripts run with cwd = apps/server; the repo-root .env is shared with docker compose.
if (!process.env.DATABASE_URL && existsSync("../../.env")) {
  process.loadEnvFile("../../.env");
}

void runCatalogScrapeCommand(process.env.DATABASE_URL, {
  createDb,
  createCatalogFetcher,
  runScheduledCatalogScrape,
  log: console.log,
  error: console.error,
})
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });

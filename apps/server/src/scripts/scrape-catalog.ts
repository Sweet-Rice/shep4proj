import { existsSync } from "node:fs";
import { createCatalogFetcher } from "@jevschedule/scraper";
import { createDb } from "../db/client.js";
import { runCatalogScrape } from "../catalog/scrape-job.js";
import { runCatalogScrapeCommand } from "./catalog-scrape-command.js";

// Runs the catalog scrape once against the live LSU catalog, for local/operator use only.
// CI never runs this; it requires an installed Chrome or Edge browser, which the server image
// does not contain.

// Scripts run with cwd = apps/server; the repo-root .env is shared with docker compose.
if (!process.env.DATABASE_URL && existsSync("../../.env")) {
  process.loadEnvFile("../../.env");
}

void runCatalogScrapeCommand(process.env.DATABASE_URL, {
  createDb,
  createCatalogFetcher,
  runCatalogScrape,
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

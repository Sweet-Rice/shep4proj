import { existsSync } from "node:fs";
import { createSectionFetcher } from "@jevschedule/scraper";
import { readSectionScrapeConfig } from "../config.js";
import { createDb } from "../db/client.js";
import { runSectionScrape } from "../sections/scrape-job.js";

// Runs the section scrape once against the live Course Offerings portal, for local use only.
// CI never runs this (SECURITY.md: CI never hits live LSU). Terms scraped in the last day are
// skipped, exactly as the scheduled job would.

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
  const { departments } = readSectionScrapeConfig();
  const { db, close } = createDb(databaseUrl);
  const fetcher = createSectionFetcher({ log: console.log });
  try {
    for (const department of departments) {
      const result = await runSectionScrape({ db, fetcher, department, log: console.log });
      for (const { term, sections } of result.scraped) {
        console.log(`${department} ${term}: stored ${sections} sections`);
      }
      for (const term of result.skipped) {
        console.log(`${department} ${term}: skipped (scraped in the last day)`);
      }
      for (const { term, error } of result.failed) {
        console.error(`${department} ${term}: failed: ${error}`);
        process.exitCode = 1;
      }
    }
  } finally {
    await close();
  }
}

main(url).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

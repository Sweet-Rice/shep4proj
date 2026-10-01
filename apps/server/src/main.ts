import { existsSync } from "node:fs";
import { createSectionFetcher } from "@jevschedule/scraper";
import { buildServer } from "./app.js";
import { readListenConfig, readSeatPollConfig, readSectionScrapeConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { DEFAULT_DEGREE_DATA_DIR } from "./degrees/load.js";
import { startSectionScrapeSchedule, type Schedule } from "./sections/scheduler.js";
import { runSectionScrape } from "./sections/scrape-job.js";
import { pollWatchedSeats, startSeatPoller } from "./watches/seat-poller.js";

if (!process.env["DATABASE_URL"] && existsSync("../../.env")) {
  process.loadEnvFile("../../.env");
}

const { host, port } = readListenConfig();
const sectionScrape = readSectionScrapeConfig();
const seatPoll = readSeatPollConfig();

const databaseUrl = process.env["DATABASE_URL"];
const database = databaseUrl ? createDb(databaseUrl) : undefined;
const degreeDataDir = process.env["DEGREE_DATA_DIR"] || DEFAULT_DEGREE_DATA_DIR;
const app = buildServer({ db: database?.db, degreeDataDir, logger: true });
if (!database) {
  app.log.warn("DATABASE_URL is not set; /courses routes are disabled (see .env.example)");
}

// One fetcher for every job that reads the Course Offerings portal, so they share its crawl
// delay instead of each keeping its own and multiplying the request rate.
const fetcherLog = app.log.child({ component: "section-fetcher" });
const sectionFetcher = createSectionFetcher({ log: (message) => fetcherLog.info(message) });

let schedule: Schedule | undefined;
let seatPoller: Schedule | undefined;

/** Starts the daily section scrape (T-403) when enabled; it needs the database. */
function startSectionScrape(): void {
  if (!sectionScrape.enabled) return;
  if (!database) {
    app.log.warn("SECTION_SCRAPE_ENABLED is true but DATABASE_URL is not set; not scraping");
    return;
  }
  const { db } = database;
  const log = app.log.child({ job: "section-scrape" });
  schedule = startSectionScrapeSchedule({
    async run() {
      for (const department of sectionScrape.departments) {
        const result = await runSectionScrape({ db, fetcher: sectionFetcher, department });
        const summary = { department, scraped: result.scraped, skipped: result.skipped };
        if (result.failed.length > 0) {
          log.warn({ ...summary, failed: result.failed }, "section scrape finished with failures");
        } else {
          log.info(summary, "section scrape finished");
        }
      }
    },
    onError: (error) => log.error(error, "section scrape failed"),
  });
}

/**
 * Starts the seat poller (T-512) when enabled; it needs the database. Openings are only logged
 * until notification delivery (T-513) subscribes. Logs name the section, never the watch ID:
 * that's the student's bearer token.
 */
function startSeatPolling(): void {
  if (!seatPoll.enabled) return;
  if (!database) {
    app.log.warn("SEAT_POLL_ENABLED is true but DATABASE_URL is not set; not polling seats");
    return;
  }
  const { db } = database;
  const log = app.log.child({ job: "seat-poll" });
  const onError = (error: unknown) => log.error(error, "seat poll failed");
  seatPoller = startSeatPoller({
    intervalMs: seatPoll.intervalMs,
    onError,
    async poll() {
      const result = await pollWatchedSeats({
        db,
        fetcher: sectionFetcher,
        onSeatsOpened: ({ watchId: _watchId, ...opening }) => log.info(opening, "seats opened"),
        onError,
      });
      if (result.failed.length > 0) {
        log.warn(result, "seat poll finished with failures");
      } else {
        log.info(result, "seat poll finished");
      }
      return result;
    },
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "shutting down");
    app
      .close()
      .then(async () => {
        await Promise.all([schedule?.stop(), seatPoller?.stop()]);
        await database?.close();
        process.exit(0);
      })
      .catch((error: unknown) => {
        app.log.error(error, "error during shutdown");
        process.exit(1);
      });
  });
}

try {
  await app.listen({ host, port });
  startSectionScrape();
  startSeatPolling();
} catch (error) {
  app.log.error(error, "failed to start");
  process.exit(1);
}

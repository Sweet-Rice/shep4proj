import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogFetcher } from "@jevschedule/scraper";
import { createDb, type Db } from "../db/client.js";
import { catalogDepartmentScrapes, courses } from "../db/schema.js";
import { getTestDatabaseUrl, truncateCourses } from "../test-support/db.js";
import { CATALOG_SCRAPE_DEPARTMENTS } from "./departments.js";
import { runCatalogScrape } from "./scrape-job.js";
import { runScheduledCatalogScrape } from "./scheduled-scrape.js";

const NOW = new Date("2026-10-02T12:00:00Z");
const CURRENT = new Date("2026-09-01T00:00:00Z");
const PREVIOUS = new Date("2026-07-15T00:00:00Z");
const fetcher: CatalogFetcher = {
  fetchHtml: async () => "",
  close: async () => {},
};
const scrapeResult = {
  listed: 3,
  upserted: 1,
  skipped: 1,
  failed: [] as { code: string; error: string }[],
};

describe.skipIf(!getTestDatabaseUrl())("runScheduledCatalogScrape", () => {
  let db: Db;
  let closeDb: () => Promise<void>;

  beforeAll(() => {
    const databaseUrl = getTestDatabaseUrl();
    if (!databaseUrl) throw new Error("DATABASE_URL is required for integration tests");
    const client = createDb(databaseUrl);
    db = client.db;
    closeDb = client.close;
  });

  beforeEach(async () => {
    await truncateCourses(db);
  });

  afterAll(async () => {
    await closeDb?.();
  });

  async function writeState(dept: string, completedAt: Date, failedCount = 0): Promise<void> {
    await db.insert(catalogDepartmentScrapes).values({
      catalogYear: "2026-2027",
      dept,
      completedAt,
      failedCount,
    });
  }

  function makeRun() {
    const calls: Parameters<typeof runCatalogScrape>[0][] = [];
    const runScrape = vi.fn(async (options: Parameters<typeof runCatalogScrape>[0]) => {
      calls.push(options);
      return scrapeResult;
    });
    return { calls, runScrape };
  }

  it("scrapes the configured CSC-first department order", async () => {
    const { calls, runScrape } = makeRun();
    const createFetcher = vi.fn(() => fetcher);
    const result = await runScheduledCatalogScrape({
      db,
      createFetcher,
      runScrape,
      now: () => NOW,
      log: () => {},
    });

    expect(calls.map((call) => call.prefix)).toEqual([...CATALOG_SCRAPE_DEPARTMENTS]);
    expect(result.scraped).toEqual([...CATALOG_SCRAPE_DEPARTMENTS]);
    expect(createFetcher).toHaveBeenCalledTimes(1);
    expect(await db.select().from(catalogDepartmentScrapes)).toHaveLength(
      CATALOG_SCRAPE_DEPARTMENTS.length,
    );
  });

  it("skips a department already completed in the current semester without creating a fetcher", async () => {
    await writeState("CSC", CURRENT);
    const createFetcher = vi.fn(() => fetcher);
    const log = vi.fn();
    const result = await runScheduledCatalogScrape({
      db,
      departments: ["CSC"],
      createFetcher,
      now: () => NOW,
      log,
    });

    expect(result.skipped).toEqual(["CSC"]);
    expect(result.scraped).toEqual([]);
    expect(createFetcher).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("catalog scrape CSC: skipped, already scraped this semester");
  });

  it.each([
    ["previous semester", PREVIOUS, 0],
    ["prior failures", CURRENT, 2],
  ])("retries CSC when it has %s", async (_reason, completedAt, failedCount) => {
    await writeState("CSC", completedAt, failedCount);
    const { calls, runScrape } = makeRun();
    const result = await runScheduledCatalogScrape({
      db,
      departments: ["CSC"],
      createFetcher: () => fetcher,
      runScrape,
      now: () => NOW,
      log: () => {},
    });

    expect(calls.map((call) => call.prefix)).toEqual(["CSC"]);
    expect(result.scraped).toEqual(["CSC"]);
  });

  it("skips only courses refreshed this semester and records the run's failure count", async () => {
    await db.insert(courses).values([
      {
        catalogYear: "2026-2027",
        code: "CSC 1350",
        dept: "CSC",
        title: "Intro",
        creditsMin: 3,
        creditsMax: 3,
        creditsNote: null,
        description: "",
        prerequisiteText: null,
        prereqTree: null,
        prereqNeedsReview: false,
        prereqReviewReason: null,
        prereqNotes: [],
        coid: "1350",
        createdAt: CURRENT,
        updatedAt: CURRENT,
      },
      {
        catalogYear: "2026-2027",
        code: "CSC 3102",
        dept: "CSC",
        title: "Data Structures",
        creditsMin: 3,
        creditsMax: 3,
        creditsNote: null,
        description: "",
        prerequisiteText: null,
        prereqTree: null,
        prereqNeedsReview: false,
        prereqReviewReason: null,
        prereqNotes: [],
        coid: "3102",
        createdAt: PREVIOUS,
        updatedAt: PREVIOUS,
      },
    ]);
    const { calls } = makeRun();
    const runScrape = vi.fn(async (options: Parameters<typeof runCatalogScrape>[0]) => {
      calls.push(options);
      return { ...scrapeResult, failed: [{ code: "CSC 3102", error: "failed" }] };
    });

    await runScheduledCatalogScrape({
      db,
      departments: ["CSC"],
      createFetcher: () => fetcher,
      runScrape,
      now: () => NOW,
      log: () => {},
    });

    expect(calls[0]?.skipCodes).toEqual(new Set(["CSC 1350"]));
    const [state] = await db
      .select()
      .from(catalogDepartmentScrapes)
      .where(
        and(
          eq(catalogDepartmentScrapes.catalogYear, "2026-2027"),
          eq(catalogDepartmentScrapes.dept, "CSC"),
        ),
      );
    expect(state?.failedCount).toBe(1);
    expect(state?.completedAt).toEqual(NOW);
  });

  it("does not create a fetcher when every department is current", async () => {
    await Promise.all(CATALOG_SCRAPE_DEPARTMENTS.map((dept) => writeState(dept, CURRENT)));
    const createFetcher = vi.fn(() => fetcher);
    const result = await runScheduledCatalogScrape({
      db,
      createFetcher,
      now: () => NOW,
      log: () => {},
    });

    expect(result.skipped).toEqual([...CATALOG_SCRAPE_DEPARTMENTS]);
    expect(createFetcher).not.toHaveBeenCalled();
  });
});

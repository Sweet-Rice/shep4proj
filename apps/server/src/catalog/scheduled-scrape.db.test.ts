import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogFetcher } from "@jevschedule/scraper";
import { createDb, type Db } from "../db/client.js";
import { courses } from "../db/schema.js";
import { getTestDatabaseUrl, truncateCourses } from "../test-support/db.js";
import { seedCatalogFixtures } from "./seed.js";
import { runScheduledCatalogScrape, CATALOG_SCRAPE_MIN_AGE_MS } from "./scheduled-scrape.js";

const NOW = new Date("2026-10-02T12:00:00Z").getTime();

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

  it("skips fresh CSC rows without creating a fetcher", async () => {
    await seedCatalogFixtures(db);
    const createFetcher = vi.fn(() => {
      throw new Error("must not create a fetcher");
    });
    const log = vi.fn();

    await expect(
      runScheduledCatalogScrape({ db, createFetcher, now: () => NOW, log }),
    ).resolves.toBe("skipped");

    expect(createFetcher).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("catalog scrape skipped: refreshed within 7 days");
  });

  it("scrapes an empty catalog and closes its fetcher", async () => {
    const fetcher: CatalogFetcher = {
      fetchHtml: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const createFetcher = vi.fn(() => fetcher);
    const runScrape = vi.fn().mockResolvedValue({
      listed: 12,
      upserted: 10,
      failed: [{ code: "CSC 1000", error: "bad detail" }],
    });
    const log = vi.fn();

    await expect(
      runScheduledCatalogScrape({ db, createFetcher, runScrape, now: () => NOW, log }),
    ).resolves.toBe("scraped");

    expect(createFetcher).toHaveBeenCalledOnce();
    expect(runScrape).toHaveBeenCalledOnce();
    expect(runScrape.mock.calls[0]?.[0]).toMatchObject({
      db,
      fetcher,
      catalogYear: "2026-2027",
      catoid: "35",
      navoid: "3486",
      prefix: "CSC",
    });
    expect(fetcher.close).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith("catalog scrape finished: 12 listed, 10 upserted, 1 failed");
    expect(log).toHaveBeenCalledWith("CSC 1000: failed: bad detail");
  });

  it("scrapes when the latest catalog row is older than seven days", async () => {
    await seedCatalogFixtures(db);
    await db
      .update(courses)
      .set({ updatedAt: new Date(NOW - CATALOG_SCRAPE_MIN_AGE_MS - 1) })
      .where(eq(courses.dept, "CSC"));
    const fetcher: CatalogFetcher = {
      fetchHtml: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const runScrape = vi.fn().mockResolvedValue({ listed: 0, upserted: 0, failed: [] });

    await expect(
      runScheduledCatalogScrape({
        db,
        createFetcher: () => fetcher,
        runScrape,
        now: () => NOW,
        log: vi.fn(),
      }),
    ).resolves.toBe("scraped");

    expect(runScrape).toHaveBeenCalledOnce();
    expect(fetcher.close).toHaveBeenCalledOnce();
  });
});

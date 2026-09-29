import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../db/client.js";
import { courses } from "../db/schema.js";
import { getTestDatabaseUrl, truncateCourses } from "../test-support/db.js";
import { FIXTURE_DETAIL_COIDS, createFixtureFetcher } from "./fixture-fetcher.js";
import { runCatalogScrape } from "./scrape-job.js";
import { seedCatalogFixtures } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(__dirname, "../../../../fixtures/catalog/2026-2027");

describe.skipIf(!getTestDatabaseUrl())("runCatalogScrape integration", () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(() => {
    const dbUrl = getTestDatabaseUrl();
    if (!dbUrl) {
      throw new Error("DATABASE_URL is required for integration tests");
    }
    const client = createDb(dbUrl);
    db = client.db;
    close = client.close;
  });

  afterAll(async () => {
    await close?.();
  });

  it("upserts courses and updates idempotently", async () => {
    // 1. truncateCourses(db);
    await truncateCourses(db);

    const fetcher = createFixtureFetcher(fixtureDir);
    const codes = Object.keys(FIXTURE_DETAIL_COIDS);

    // 2. seedCatalogFixtures(db) -> upserted 5, count 5
    const upserted = await seedCatalogFixtures(db);
    expect(upserted).toBe(5);

    const initialRows = await db.select().from(courses);
    expect(initialRows).toHaveLength(5);

    // 3. await db.update(courses).set({ title: "x" }).where(eq(courses.code, "CSC 4330"));
    await db.update(courses).set({ title: "x" }).where(eq(courses.code, "CSC 4330"));
    const modified = (await db.select().from(courses).where(eq(courses.code, "CSC 4330")))[0];
    expect(modified?.title).toBe("x");

    // 4. run again -> count still 5 and title restored to "Software Systems Development".
    const result2 = await runCatalogScrape({
      db,
      fetcher,
      catalogYear: "2026-2027",
      catoid: "35",
      navoid: "3486",
      prefix: "CSC",
      codes,
    });

    expect(result2.upserted).toBe(5);
    expect(result2.failed).toEqual([]);

    const finalRows = await db.select().from(courses);
    expect(finalRows).toHaveLength(5);

    const restored = (await db.select().from(courses).where(eq(courses.code, "CSC 4330")))[0];
    expect(restored?.title).toBe("Software Systems Development");
  });
});

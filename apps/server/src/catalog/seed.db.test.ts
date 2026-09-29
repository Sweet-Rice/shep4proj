import { asc } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../db/client.js";
import { courses } from "../db/schema.js";
import { getTestDatabaseUrl, truncateCourses } from "../test-support/db.js";
import { seedCatalogFixtures } from "./seed.js";

describe.skipIf(!getTestDatabaseUrl())("seedCatalogFixtures integration", () => {
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

  it("seeds catalog fixtures idempotently", async () => {
    await truncateCourses(db);

    const upserted = await seedCatalogFixtures(db);
    expect(upserted).toBe(5);

    const rows = await db.select({ code: courses.code }).from(courses).orderBy(asc(courses.code));

    expect(rows.map((r) => r.code)).toEqual([
      "CSC 1350",
      "CSC 2700",
      "CSC 3102",
      "CSC 3200",
      "CSC 4330",
    ]);

    const secondUpserted = await seedCatalogFixtures(db);
    expect(secondUpserted).toBe(5);

    const allCourses = await db.select().from(courses);
    expect(allCourses).toHaveLength(5);
  });
});

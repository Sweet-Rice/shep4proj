import Fastify from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "../db/client.js";
import { watches } from "../db/schema.js";
import { createSectionFixtureFetcher, SECTION_FIXTURE_PERIOD } from "../sections/seed.js";
import { getTestDatabaseUrl, truncateWatches } from "../test-support/db.js";
import { createSeatPollRun } from "./seat-poll-job.js";

describe.skipIf(!getTestDatabaseUrl())("createSeatPollRun", () => {
  let db: Db;
  let closeDb: () => Promise<void>;

  beforeAll(() => {
    const dbUrl = getTestDatabaseUrl();
    if (!dbUrl) throw new Error("DATABASE_URL is required for integration tests");
    ({ db, close: closeDb } = createDb(dbUrl));
  });

  beforeEach(async () => {
    await truncateWatches(db);
  });

  afterAll(async () => {
    await closeDb?.();
  });

  it("logs an opening's section and counts, never its watch ID", async () => {
    const [watch] = await db
      .insert(watches)
      .values({
        term: SECTION_FIXTURE_PERIOD,
        courseCode: "CSC 1110",
        sectionNumber: "001",
        sectionType: "LEC",
        lastEnrollment: 40,
        lastCapacity: 40,
      })
      .returning({ id: watches.id });
    const lines: string[] = [];
    const app = Fastify({ logger: { stream: { write: (line: string) => void lines.push(line) } } });
    const onError = vi.fn();

    const result = await createSeatPollRun({
      db,
      fetcher: createSectionFixtureFetcher(),
      log: app.log,
      onError,
    })();

    expect(result.opened).toBe(1);
    expect(onError).not.toHaveBeenCalled();
    const logged = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(logged.find((entry) => entry["msg"] === "seats opened")).toMatchObject({
      term: SECTION_FIXTURE_PERIOD,
      courseCode: "CSC 1110",
      sectionNumber: "001",
      sectionType: "LEC",
      enrollment: 38,
      capacity: 40,
    });
    expect(lines.join("\n")).not.toContain(watch!.id);
    await app.close();
  });
});

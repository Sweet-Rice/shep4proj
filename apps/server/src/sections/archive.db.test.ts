import { asc } from "drizzle-orm";
import type { Section } from "@jevschedule/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../app.js";
import { createDb, type Db } from "../db/client.js";
import { sectionArchive } from "../db/schema.js";
import {
  getTestDatabaseUrl,
  truncateSectionArchive,
  truncateSections,
} from "../test-support/db.js";
import { runSectionScrape } from "./scrape-job.js";
import { createSectionFixtureFetcher, SECTION_FIXTURE_PERIOD } from "./seed.js";
import { replaceTermSections } from "./store.js";

const SPRING = "LSUAM_SPRING_2027";
const T0 = new Date("2026-09-29T09:00:00Z");
const T1 = new Date("2026-09-30T09:00:00Z");

const springSection: Section = {
  term: SPRING,
  courseCode: "CSC 4330",
  sectionNumber: "001",
  sectionType: "LEC",
  credits: { min: 3, max: 3, note: null },
  instructor: null,
  location: null,
  deliveryMode: "On Campus",
  enrollment: 0,
  capacity: 80,
  meetings: [{ days: ["Mon", "Wed"], startMinute: 630, endMinute: 710 }],
};

describe.skipIf(!getTestDatabaseUrl())("section archive", () => {
  let db: Db;
  let closeDb: () => Promise<void>;

  const archiveRows = () =>
    db
      .select()
      .from(sectionArchive)
      .orderBy(asc(sectionArchive.term), asc(sectionArchive.department));

  /** Scrapes the fixture's Fall 2026 CSC listing as of `at`. */
  const scrapeFall = (at: Date) =>
    runSectionScrape({
      db,
      fetcher: createSectionFixtureFetcher(),
      department: "CSC",
      periodIds: [SECTION_FIXTURE_PERIOD],
      minIntervalMs: 0,
      now: () => at,
    });

  beforeAll(() => {
    const dbUrl = getTestDatabaseUrl();
    if (!dbUrl) throw new Error("DATABASE_URL is required for integration tests");
    ({ db, close: closeDb } = createDb(dbUrl));
  });

  beforeEach(async () => {
    await truncateSections(db);
    await truncateSectionArchive(db);
  });

  afterAll(async () => {
    await closeDb?.();
  });

  it("writes one snapshot per term: two runs for two terms produce two snapshots", async () => {
    await scrapeFall(T0);
    await replaceTermSections(db, {
      department: "CSC",
      term: SPRING,
      sections: [springSection],
      scrapedAt: T1,
    });

    const rows = await archiveRows();
    expect(rows.map((r) => [r.term, r.department, r.capturedAt, r.sections.length])).toEqual([
      [SECTION_FIXTURE_PERIOD, "CSC", T0, 188],
      [SPRING, "CSC", T1, 1],
    ]);
  });

  it("stores each section in full, meetings included", async () => {
    await scrapeFall(T0);
    const [row] = await archiveRows();
    expect(row?.sections).toContainEqual({
      term: SECTION_FIXTURE_PERIOD,
      courseCode: "CSC 4330",
      sectionNumber: "001",
      sectionType: "LEC",
      credits: { min: 3, max: 3, note: null },
      instructor: "David C. Shepherd",
      location: "1206 Patrick F. Taylor Hall",
      deliveryMode: "On Campus",
      enrollment: 78,
      capacity: 78,
      meetings: [{ days: ["Tue", "Thu"], startMinute: 900, endMinute: 980 }],
    });
  });

  it("updates a term's snapshot in place when the term is scraped again", async () => {
    await scrapeFall(T0);
    await scrapeFall(T1);

    const rows = await archiveRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.capturedAt).toEqual(T1);
  });

  it("keeps each department's snapshot for the same term separate", async () => {
    await replaceTermSections(db, {
      department: "CSC",
      term: SPRING,
      sections: [springSection],
      scrapedAt: T0,
    });
    await replaceTermSections(db, {
      department: "MATH",
      term: SPRING,
      sections: [{ ...springSection, courseCode: "MATH 1550" }],
      scrapedAt: T1,
    });

    const rows = await archiveRows();
    expect(rows.map((r) => [r.department, r.sections[0]?.courseCode])).toEqual([
      ["CSC", "CSC 4330"],
      ["MATH", "MATH 1550"],
    ]);
  });

  it("leaves the snapshot alone when a re-scrape fails", async () => {
    await scrapeFall(T0);
    const result = await runSectionScrape({
      db,
      fetcher: {
        fetchHtml: async (url) =>
          new URL(url).searchParams.has("AcademicPeriod")
            ? "<html>redesigned</html>"
            : createSectionFixtureFetcher().fetchHtml(url),
      },
      department: "CSC",
      periodIds: [SECTION_FIXTURE_PERIOD],
      minIntervalMs: 0,
      now: () => T1,
    });

    expect(result.failed).toHaveLength(1);
    const [row] = await archiveRows();
    expect(row?.capturedAt).toEqual(T0);
    expect(row?.sections).toHaveLength(188);
  });

  it("keeps a term's snapshot when its live sections are cleared", async () => {
    await scrapeFall(T0);
    await truncateSections(db);
    expect(await archiveRows()).toHaveLength(1);
  });

  it("serves only the requested course's archived offering terms", async () => {
    await replaceTermSections(db, {
      department: "CSC",
      term: SECTION_FIXTURE_PERIOD,
      sections: [
        { ...springSection, term: SECTION_FIXTURE_PERIOD },
        { ...springSection, term: SECTION_FIXTURE_PERIOD, sectionNumber: "002" },
        { ...springSection, term: SECTION_FIXTURE_PERIOD, courseCode: "CSC 1350" },
      ],
      scrapedAt: T0,
    });
    await replaceTermSections(db, {
      department: "CSC",
      term: SPRING,
      sections: [springSection],
      scrapedAt: T1,
    });

    const app = buildServer({ db });
    try {
      const response = await app.inject({ method: "GET", url: "/courses/csc-4330/history" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        history: [
          { term: SECTION_FIXTURE_PERIOD, sectionCount: 2, capturedAt: T0.toISOString() },
          { term: SPRING, sectionCount: 1, capturedAt: T1.toISOString() },
        ],
      });
      expect((await app.inject("/courses/CSC-9999/history")).json()).toEqual({ history: [] });
      const invalid = await app.inject("/courses/CSC-99/history");
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toEqual({ error: "invalid course id" });
    } finally {
      await app.close();
    }
  });
});

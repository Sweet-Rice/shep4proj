import { readFileSync } from "node:fs";
import { count, eq, like } from "drizzle-orm";
import type { SectionFetcher } from "@jevschedule/scraper";
import type { Section } from "@jevschedule/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "../db/client.js";
import { meetings, sections, sectionScrapes } from "../db/schema.js";
import { getTestDatabaseUrl, truncateSections } from "../test-support/db.js";
import { runSectionScrape } from "./scrape-job.js";
import {
  createSectionFixtureFetcher,
  SECTION_FIXTURE_PATH,
  SECTION_FIXTURE_PERIOD,
  seedSectionFixtures,
} from "./seed.js";
import { replaceTermSections } from "./store.js";

const FIXTURE_HTML = readFileSync(SECTION_FIXTURE_PATH, "utf8");
const FIXTURE_SECTIONS = 188;
const FIXTURE_MEETINGS = 73;
const T0 = new Date("2026-09-29T09:00:00Z");
const hoursAfter = (hours: number) => new Date(T0.getTime() + hours * 60 * 60 * 1000);

/** Wraps a fetcher so tests can see which URLs were requested. */
function spyOn(fetcher: SectionFetcher) {
  const fetchHtml = vi.fn((url: string) => fetcher.fetchHtml(url));
  return { fetchHtml };
}

/** A fixture fetcher whose listing is `html` for every period. */
function listingFetcher(html: string): SectionFetcher {
  return { fetchHtml: async () => html };
}

describe.skipIf(!getTestDatabaseUrl())("runSectionScrape", () => {
  let db: Db;
  let closeDb: () => Promise<void>;

  const countRows = async (table: typeof sections | typeof meetings) =>
    (await db.select({ n: count() }).from(table))[0]?.n;

  beforeAll(() => {
    const dbUrl = getTestDatabaseUrl();
    if (!dbUrl) throw new Error("DATABASE_URL is required for integration tests");
    ({ db, close: closeDb } = createDb(dbUrl));
  });

  beforeEach(async () => {
    await truncateSections(db);
  });

  afterAll(async () => {
    await closeDb?.();
  });

  it("reads the periods from the landing page and stores the fixture period's sections", async () => {
    const result = await runSectionScrape({
      db,
      fetcher: createSectionFixtureFetcher(),
      department: "CSC",
      now: () => T0,
    });

    expect(result.periods).toHaveLength(5);
    expect(result.scraped).toEqual([{ term: SECTION_FIXTURE_PERIOD, sections: FIXTURE_SECTIONS }]);
    // The other four periods have no saved fixture; each fails on its own.
    expect(result.failed.map((f) => f.term)).toEqual(
      result.periods.filter((p) => p !== SECTION_FIXTURE_PERIOD),
    );
    expect(await countRows(sections)).toBe(FIXTURE_SECTIONS);
    expect(await countRows(meetings)).toBe(FIXTURE_MEETINGS);
    expect(await db.select().from(sectionScrapes)).toEqual([
      {
        department: "CSC",
        term: SECTION_FIXTURE_PERIOD,
        scrapedAt: T0,
        sectionCount: FIXTURE_SECTIONS,
      },
    ]);
  });

  it("stores sections the way the parser read them", async () => {
    await seedSectionFixtures(db);
    const [lecture] = await db
      .select()
      .from(sections)
      .where(eq(sections.courseCode, "CSC 4330"))
      .orderBy(sections.sectionNumber)
      .limit(1);
    expect(lecture).toMatchObject({
      term: SECTION_FIXTURE_PERIOD,
      sectionNumber: "001",
      sectionType: "LEC",
      instructor: "David C. Shepherd",
      enrollment: 78,
      capacity: 78,
    });
    const lectureMeetings = await db
      .select({ days: meetings.days, start: meetings.startMinute, end: meetings.endMinute })
      .from(meetings)
      .where(eq(meetings.sectionId, lecture?.id ?? -1));
    expect(lectureMeetings).toEqual([{ days: ["Tue", "Thu"], start: 900, end: 980 }]);
  });

  it("doesn't let seeded fixture data hold off a live scrape", async () => {
    await seedSectionFixtures(db);
    const result = await runSectionScrape({
      db,
      fetcher: createSectionFixtureFetcher(),
      department: "CSC",
      periodIds: [SECTION_FIXTURE_PERIOD],
      now: () => T0,
    });
    expect(result.skipped).toEqual([]);
    expect(result.scraped).toHaveLength(1);
  });

  it("skips a term scraped less than a day ago without fetching it", async () => {
    const opts = { db, department: "CSC", periodIds: [SECTION_FIXTURE_PERIOD] };
    await runSectionScrape({ ...opts, fetcher: createSectionFixtureFetcher(), now: () => T0 });

    const fetcher = spyOn(createSectionFixtureFetcher());
    const result = await runSectionScrape({ ...opts, fetcher, now: () => hoursAfter(23) });

    expect(result.skipped).toEqual([SECTION_FIXTURE_PERIOD]);
    expect(result.scraped).toEqual([]);
    expect(fetcher.fetchHtml).toHaveBeenCalledOnce(); // the landing page only
  });
  it("serializes concurrent scrapes of a missing term and rechecks freshness under the lock", async () => {
    let detailFetches = 0;
    let landingFetches = 0;
    let releaseLandings: () => void = () => {};
    const bothLandings = new Promise<void>((resolve) => {
      releaseLandings = resolve;
    });
    const fetcher: SectionFetcher = {
      fetchHtml: async (url) => {
        if (!new URL(url).searchParams.has("AcademicPeriod")) {
          landingFetches += 1;
          if (landingFetches === 2) releaseLandings();
          await bothLandings;
          return FIXTURE_HTML;
        }
        detailFetches += 1;
        return FIXTURE_HTML;
      },
    };
    const opts = {
      db,
      fetcher,
      department: "CSC",
      periodIds: [SECTION_FIXTURE_PERIOD],
      now: () => T0,
    };

    const results = await Promise.all([runSectionScrape(opts), runSectionScrape(opts)]);

    expect(detailFetches).toBe(1);
    expect(results.filter((result) => result.scraped.length === 1)).toHaveLength(1);
    expect(
      results.filter((result) => result.skipped.includes(SECTION_FIXTURE_PERIOD)),
    ).toHaveLength(1);
  });

  it("clears old term rows after a valid empty listing", async () => {
    await seedSectionFixtures(db);
    const emptyListing = FIXTURE_HTML.replace(
      /<div class="accordion mb-4 course-accordion"[\s\S]*?(?=<\/body>)/g,
      "",
    );

    const result = await runSectionScrape({
      db,
      fetcher: listingFetcher(emptyListing),
      department: "CSC",
      periodIds: [SECTION_FIXTURE_PERIOD],
      force: true,
    });

    expect(result.failed).toEqual([]);
    expect(result.scraped).toEqual([{ term: SECTION_FIXTURE_PERIOD, sections: 0 }]);
    expect(await countRows(sections)).toBe(0);
    expect(await countRows(meetings)).toBe(0);
    expect(await db.select().from(sectionScrapes)).toEqual([
      {
        department: "CSC",
        term: SECTION_FIXTURE_PERIOD,
        scrapedAt: expect.any(Date),
        sectionCount: 0,
      },
    ]);
  });

  it("skips a term within its semester window and re-scrapes it in the next window", async () => {
    const opts = { db, department: "CSC", periodIds: [SECTION_FIXTURE_PERIOD] };
    await runSectionScrape({
      ...opts,
      fetcher: createSectionFixtureFetcher(),
      now: () => new Date("2026-08-02T09:00:00Z"),
    });

    const skipped = await runSectionScrape({
      ...opts,
      fetcher: createSectionFixtureFetcher(),
      now: () => new Date("2026-12-01T09:00:00Z"),
    });
    expect(skipped.skipped).toEqual([SECTION_FIXTURE_PERIOD]);
    expect(skipped.scraped).toEqual([]);

    const refreshedAt = new Date("2027-01-02T09:00:00Z");
    const refreshed = await runSectionScrape({
      ...opts,
      fetcher: createSectionFixtureFetcher(),
      now: () => refreshedAt,
    });
    expect(refreshed.scraped).toEqual([
      { term: SECTION_FIXTURE_PERIOD, sections: FIXTURE_SECTIONS },
    ]);
    expect(await countRows(sections)).toBe(FIXTURE_SECTIONS);
    expect(await countRows(meetings)).toBe(FIXTURE_MEETINGS);
    const [scrape] = await db.select().from(sectionScrapes);
    expect(scrape?.scrapedAt).toEqual(refreshedAt);
  });

  it("drops sections the portal no longer lists", async () => {
    await seedSectionFixtures(db);
    // The same page with every CSC 4330 block (and its repeat) removed.
    const without4330 = FIXTURE_HTML.replace(
      /<div class="accordion mb-4 course-accordion" id="courseAccordion_LSUAM_CSC4330">[\s\S]*?(?=<div class="accordion mb-4 course-accordion")/g,
      "",
    );
    const result = await runSectionScrape({
      db,
      fetcher: listingFetcher(without4330),
      department: "CSC",
      periodIds: [SECTION_FIXTURE_PERIOD],
      force: true,
    });

    expect(result.scraped).toEqual([
      { term: SECTION_FIXTURE_PERIOD, sections: FIXTURE_SECTIONS - 2 },
    ]);
    const left = await db.select().from(sections).where(eq(sections.courseCode, "CSC 4330"));
    expect(left).toEqual([]);
  });

  it("leaves other departments' sections for the same term alone", async () => {
    const math: Section = {
      term: SECTION_FIXTURE_PERIOD,
      courseCode: "MATH 1550",
      sectionNumber: "001",
      sectionType: "LEC",
      credits: { min: 5, max: 5, note: null },
      instructor: null,
      location: null,
      deliveryMode: null,
      enrollment: 1,
      capacity: 2,
      meetings: [],
    };
    await replaceTermSections(db, {
      department: "MATH",
      term: SECTION_FIXTURE_PERIOD,
      sections: [math],
      scrapedAt: T0,
    });

    await seedSectionFixtures(db);

    const mathLeft = await db.select().from(sections).where(like(sections.courseCode, "MATH %"));
    expect(mathLeft).toHaveLength(1);
  });

  it("records a term whose page lists a different period as failed and stores nothing", async () => {
    const wrongPeriod = FIXTURE_HTML.replace(
      'data-selected-id="LSUAM_FALL_2026"',
      'data-selected-id="LSUAM_FALL_1_2026"',
    );
    const result = await runSectionScrape({
      db,
      fetcher: listingFetcher(wrongPeriod),
      department: "CSC",
      periodIds: [SECTION_FIXTURE_PERIOD],
    });

    expect(result.failed).toEqual([
      {
        term: SECTION_FIXTURE_PERIOD,
        error: "asked for LSUAM_FALL_2026 but the page lists LSUAM_FALL_1_2026",
      },
    ]);
    expect(await countRows(sections)).toBe(0);
  });

  it("keeps the previous listing when a re-scrape fails", async () => {
    await seedSectionFixtures(db);
    const result = await runSectionScrape({
      db,
      fetcher: {
        fetchHtml: async (url) =>
          new URL(url).searchParams.has("AcademicPeriod")
            ? "<html>redesigned</html>"
            : FIXTURE_HTML,
      },
      department: "CSC",
      periodIds: [SECTION_FIXTURE_PERIOD],
      force: true,
    });

    expect(result.failed).toHaveLength(1);
    expect(await countRows(sections)).toBe(FIXTURE_SECTIONS);
  });

  it("throws when the landing page can't be read", async () => {
    await expect(
      runSectionScrape({ db, fetcher: listingFetcher("<html></html>"), department: "CSC" }),
    ).rejects.toThrow("academic period picker not found");
  });

  it.each(["csc", "C", "CSC%", "CSCXX"])("rejects department %j", async (department) => {
    await expect(
      runSectionScrape({ db, fetcher: createSectionFixtureFetcher(), department }),
    ).rejects.toThrow("department must be 2-4 capital letters");
  });
});

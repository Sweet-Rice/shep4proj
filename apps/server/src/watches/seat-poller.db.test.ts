import { readFileSync } from "node:fs";
import { inspect } from "node:util";
import { eq, sql } from "drizzle-orm";
import type { SectionFetcher } from "@jevschedule/scraper";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "../db/client.js";
import { watches } from "../db/schema.js";
import {
  createSectionFixtureFetcher,
  SECTION_FIXTURE_PATH,
  SECTION_FIXTURE_PERIOD,
} from "../sections/seed.js";
import { getTestDatabaseUrl, truncateWatches } from "../test-support/db.js";
import { pollWatchedSeats, type SeatOpening } from "./seat-poller.js";

const FIXTURE_HTML = readFileSync(SECTION_FIXTURE_PATH, "utf8");

// Seat counts in the saved Fall 2026 CSC listing.
const OPEN = { courseCode: "CSC 1110", sectionNumber: "001", sectionType: "LEC" }; // 38/40
const FULL = { courseCode: "CSC 2259", sectionNumber: "001", sectionType: "REC" }; // 20/20

/** Wraps a fetcher so tests can count requests. */
function spyOn(fetcher: SectionFetcher) {
  return { fetchHtml: vi.fn((url: string) => fetcher.fetchHtml(url)) };
}

describe.skipIf(!getTestDatabaseUrl())("pollWatchedSeats", () => {
  let db: Db;
  let closeDb: () => Promise<void>;

  async function watch(
    section: typeof OPEN,
    last: { lastEnrollment: number; lastCapacity: number },
    term = SECTION_FIXTURE_PERIOD,
  ): Promise<string> {
    const [row] = await db
      .insert(watches)
      .values({ term, ...section, ...last })
      .returning({ id: watches.id });
    return row!.id;
  }

  async function poll(fetcher: SectionFetcher = createSectionFixtureFetcher()) {
    const openings: SeatOpening[] = [];
    const onError = vi.fn();
    const result = await pollWatchedSeats({
      db,
      fetcher,
      onSeatsOpened: (opening) => {
        openings.push(opening);
      },
      onError,
    });
    return { result, openings, onError };
  }

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

  it("reports a full section that opened once, and records the new counts", async () => {
    const id = await watch(OPEN, { lastEnrollment: 40, lastCapacity: 40 });

    const first = await poll();
    expect(first.result).toEqual({ opened: 1, failed: [], unlistedTerms: [], missingSections: 0 });
    expect(first.openings).toEqual([
      { watchId: id, term: SECTION_FIXTURE_PERIOD, ...OPEN, enrollment: 38, capacity: 40 },
    ]);
    expect(await db.select().from(watches)).toMatchObject([
      { id, lastEnrollment: 38, lastCapacity: 40 },
    ]);

    const second = await poll();
    expect(second.result.opened).toBe(0);
    expect(second.openings).toEqual([]);
  });

  it("updates counts without reporting when the section was already open or is still full", async () => {
    const wasOpen = await watch(OPEN, { lastEnrollment: 30, lastCapacity: 40 });
    const stillFull = await watch(FULL, { lastEnrollment: 21, lastCapacity: 20 });

    const { result, openings } = await poll();
    expect(result.opened).toBe(0);
    expect(openings).toEqual([]);
    const rows = await db.select().from(watches);
    expect(rows.find((row) => row.id === wasOpen)).toMatchObject({ lastEnrollment: 38 });
    expect(rows.find((row) => row.id === stillFull)).toMatchObject({ lastEnrollment: 20 });
  });

  it("fetches each watched department and term once, and nothing when there are no watches", async () => {
    const idle = spyOn(createSectionFixtureFetcher());
    await poll(idle);
    expect(idle.fetchHtml).not.toHaveBeenCalled();

    await watch(OPEN, { lastEnrollment: 40, lastCapacity: 40 });
    await watch(OPEN, { lastEnrollment: 40, lastCapacity: 40 });
    await watch(FULL, { lastEnrollment: 20, lastCapacity: 20 });
    const fetcher = spyOn(createSectionFixtureFetcher());
    const { result } = await poll(fetcher);
    expect(fetcher.fetchHtml).toHaveBeenCalledTimes(1);
    expect(new URL(fetcher.fetchHtml.mock.calls[0]![0]).searchParams.get("AcademicPeriod")).toBe(
      SECTION_FIXTURE_PERIOD,
    );
    expect(result.opened).toBe(2);
  });

  it("records a fetch failure for an unservable term and still polls the other terms", async () => {
    // The fixture fetcher throws for any period but the fixture's.
    const unservable = await watch(
      OPEN,
      { lastEnrollment: 40, lastCapacity: 40 },
      "LSUAM_SPRING_2027",
    );
    await watch(OPEN, { lastEnrollment: 40, lastCapacity: 40 });

    const { result, openings } = await poll();
    expect(result.failed).toEqual([
      { department: "CSC", term: "LSUAM_SPRING_2027", error: expect.stringMatching(/no fixture/) },
    ]);
    expect(result.unlistedTerms).toEqual([]);
    expect(openings.map((opening) => opening.term)).toEqual([SECTION_FIXTURE_PERIOD]);
    const [row] = await db.select().from(watches).where(eq(watches.id, unservable));
    expect(row).toMatchObject({ lastEnrollment: 40 });
  });

  it("skips a term the portal answers with another period's page, without counting a failure", async () => {
    const ended = await watch(OPEN, { lastEnrollment: 40, lastCapacity: 40 }, "LSUAM_SPRING_2026");

    const { result, openings } = await poll({ fetchHtml: async () => FIXTURE_HTML });
    expect(result).toEqual({
      opened: 0,
      failed: [],
      unlistedTerms: ["CSC LSUAM_SPRING_2026"],
      missingSections: 0,
    });
    expect(openings).toEqual([]);
    const [row] = await db.select().from(watches).where(eq(watches.id, ended));
    expect(row).toMatchObject({ lastEnrollment: 40 });
  });

  it("keeps a watch whose section is no longer listed", async () => {
    await watch({ ...OPEN, sectionNumber: "999" }, { lastEnrollment: 40, lastCapacity: 40 });

    const { result } = await poll();
    expect(result).toMatchObject({ opened: 0, failed: [], missingSections: 1 });
    expect(await db.select().from(watches)).toHaveLength(1);
  });

  it("passes a throwing listener's error to onError and reports the remaining openings", async () => {
    await watch(OPEN, { lastEnrollment: 40, lastCapacity: 40 });
    await watch(OPEN, { lastEnrollment: 40, lastCapacity: 40 });
    const error = new Error("listener failed");
    const onSeatsOpened = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined);
    const onError = vi.fn();

    const result = await pollWatchedSeats({
      db,
      fetcher: createSectionFixtureFetcher(),
      onSeatsOpened,
      onError,
    });
    expect(onSeatsOpened).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith(error);
    expect(result.opened).toBe(2);
  });

  it("fails a poll whose watch update fails without exposing the watch ID", async () => {
    const id = await watch(OPEN, { lastEnrollment: 40, lastCapacity: 40 });
    const fetcher: SectionFetcher = {
      async fetchHtml(url) {
        // Makes the update to the fixture's 38 enrolled fail in Postgres.
        await db.execute(
          sql`ALTER TABLE watches ADD CONSTRAINT t512_reject CHECK (last_enrollment <> 38) NOT VALID`,
        );
        return createSectionFixtureFetcher().fetchHtml(url);
      },
    };

    try {
      const polling = poll(fetcher);
      await expect(polling).rejects.toThrow(/CSC 1110 001-LEC/);
      const error: unknown = await polling.catch((caught: unknown) => caught);
      expect(inspect(error, { depth: 10 })).not.toContain(id);
      expect(JSON.stringify(error)).not.toContain(id);
    } finally {
      await db.execute(sql`ALTER TABLE watches DROP CONSTRAINT IF EXISTS t512_reject`);
    }
  });

  it("reports an opening only once when only the watch's capacity changed after the poll read it", async () => {
    // Last seen 38/38 (full); the fixture lists 38/40 (open).
    const id = await watch(OPEN, { lastEnrollment: 38, lastCapacity: 38 });
    const fetcher: SectionFetcher = {
      async fetchHtml(url) {
        // Another poll records the new capacity, and the opening, before this poll's update.
        await db.update(watches).set({ lastCapacity: 40 }).where(eq(watches.id, id));
        return createSectionFixtureFetcher().fetchHtml(url);
      },
    };

    const { result, openings } = await poll(fetcher);
    expect(result.opened).toBe(0);
    expect(openings).toEqual([]);
  });

  it("reports an opening only once when its watch changed after the poll read it", async () => {
    const id = await watch(OPEN, { lastEnrollment: 40, lastCapacity: 40 });
    const fetcher: SectionFetcher = {
      async fetchHtml(url) {
        // Another poll records the opening between this poll's read and its update.
        await db.update(watches).set({ lastEnrollment: 38 }).where(eq(watches.id, id));
        return createSectionFixtureFetcher().fetchHtml(url);
      },
    };

    const { result, openings } = await poll(fetcher);
    expect(result.opened).toBe(0);
    expect(openings).toEqual([]);
  });
});

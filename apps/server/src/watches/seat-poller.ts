import { and, eq } from "drizzle-orm";
import { parseSectionListing, sectionListingUrl, type SectionFetcher } from "@jevschedule/scraper";
import type { Db } from "../db/client.js";
import { watches, type WatchRow } from "../db/schema.js";
import type { Schedule } from "../sections/scheduler.js";
import { DEPARTMENT_PATTERN } from "../sections/store.js";

/** Seat counts for one section at one point in time. */
export interface SeatCounts {
  enrollment: number;
  capacity: number;
}

/** A watched section that had no open seats at the last poll and has some now. */
export interface SeatOpening extends SeatCounts {
  /** The watch's opaque ID. It's a bearer token: never log it. */
  watchId: string;
  term: string;
  courseCode: string;
  sectionNumber: string;
  sectionType: string;
}

export interface SeatPollResult {
  /** Openings passed to `onSeatsOpened`. */
  opened: number;
  /** Department/term listings that couldn't be fetched or parsed; their watches are unchanged. */
  failed: { department: string; term: string; error: string }[];
  /** Terms the portal no longer lists (`CSC LSUAM_FALL_2026`). Not a failure: they ended. */
  unlistedTerms: string[];
  /** Watched sections missing from their term's listing (cancelled); their watches are kept. */
  missingSections: number;
}

/** True when a section went from no open seats to at least one. Over-enrolled counts as full. */
export function seatsOpened(before: SeatCounts, after: SeatCounts): boolean {
  return before.capacity - before.enrollment <= 0 && after.capacity - after.enrollment > 0;
}

const sectionKey = (s: { courseCode: string; sectionNumber: string; sectionType: string }) =>
  `${s.courseCode} ${s.sectionNumber}-${s.sectionType}`;

/**
 * Polls every watched section once (T-512). Each department and term with a watch costs one
 * listing request through the shared, rate-limited section fetcher; nothing else is fetched.
 * Every watch whose counts changed is updated to the new counts, and each one that went from
 * full to open is passed to `onSeatsOpened` exactly once: the update only applies if the
 * watch still holds the counts this poll read, so overlapping polls can't both report it.
 *
 * Only `watches` is written. The `sections` table stays the daily scrape's (T-403), so it may
 * show older counts than the watches until that scrape runs.
 *
 * An opening is reported after its watch is updated, so one whose listener throws is passed to
 * `onError` and not retried.
 */
export async function pollWatchedSeats(o: {
  db: Db;
  fetcher: SectionFetcher;
  onSeatsOpened: (opening: SeatOpening) => void | Promise<void>;
  onError: (error: unknown) => void;
}): Promise<SeatPollResult> {
  const result: SeatPollResult = { opened: 0, failed: [], unlistedTerms: [], missingSections: 0 };

  const groups = new Map<string, { department: string; term: string; rows: WatchRow[] }>();
  for (const row of await o.db.select().from(watches)) {
    const department = row.courseCode.split(" ")[0] ?? "";
    const key = `${department} ${row.term}`;
    const group = groups.get(key) ?? { department, term: row.term, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  for (const [key, { department, term, rows }] of groups) {
    let listing;
    try {
      if (!DEPARTMENT_PATTERN.test(department)) {
        throw new Error(`department must be 2-4 capital letters, got "${department}"`);
      }
      const url = sectionListingUrl({ department, periodId: term });
      listing = parseSectionListing(await o.fetcher.fetchHtml(url));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failed.push({ department, term, error: message });
      continue;
    }
    // A page for another period means the portal no longer serves this one. That's assumed, not
    // observed (CI can't reach the live portal), so it's reported as unlisted, not dropped.
    if (listing.selectedPeriodId !== term) {
      result.unlistedTerms.push(key);
      continue;
    }

    const current = new Map(listing.sections.map((section) => [sectionKey(section), section]));
    for (const row of rows) {
      const section = current.get(sectionKey(row));
      if (section === undefined) {
        result.missingSections += 1;
        continue;
      }
      const before = { enrollment: row.lastEnrollment, capacity: row.lastCapacity };
      if (section.enrollment === before.enrollment && section.capacity === before.capacity) {
        continue;
      }
      let updated;
      try {
        [updated] = await o.db
          .update(watches)
          .set({ lastEnrollment: section.enrollment, lastCapacity: section.capacity })
          .where(
            and(
              eq(watches.id, row.id),
              eq(watches.lastEnrollment, before.enrollment),
              eq(watches.lastCapacity, before.capacity),
            ),
          )
          .returning({ id: watches.id });
      } catch {
        // Drizzle's error carries the query's parameters, which include the watch ID. Leave it
        // (and its cause) out so it can't reach a log.
        throw new Error(`could not update a watch on ${sectionKey(row)} (${row.term})`);
      }
      if (updated === undefined || !seatsOpened(before, section)) continue;

      result.opened += 1;
      try {
        await o.onSeatsOpened({
          watchId: row.id,
          term: row.term,
          courseCode: row.courseCode,
          sectionNumber: row.sectionNumber,
          sectionType: row.sectionType,
          enrollment: section.enrollment,
          capacity: section.capacity,
        });
      } catch (error) {
        o.onError(error);
      }
    }
  }
  return result;
}

/** First retry after a failed poll. Each further failure doubles it, up to the poll interval. */
export const SEAT_POLL_RETRY_BASE_MS = 15 * 60 * 1000;

/**
 * How long to wait before the next poll: the interval after a clean poll, and exponential
 * backoff from `SEAT_POLL_RETRY_BASE_MS` after `failures` failed polls in a row. The backoff is
 * capped at the interval, so failures never make the poller fetch more often than the
 * interval's rate once they've backed off.
 */
export function nextSeatPollDelayMs(failures: number, intervalMs: number): number {
  if (failures === 0) return intervalMs;
  return Math.min(SEAT_POLL_RETRY_BASE_MS * 2 ** (failures - 1), intervalMs);
}

/**
 * Runs `poll` now and then again after each one finishes, waiting `nextSeatPollDelayMs` (T-512).
 * A poll fails if it throws (passed to `onError`) or any listing in it failed. Polls never
 * overlap, and the timer is unref'd so it never keeps the process alive on its own.
 */
export function startSeatPoller(o: {
  poll: () => Promise<SeatPollResult>;
  intervalMs: number;
  onError: (error: unknown) => void;
}): Schedule {
  let failures = 0;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> | undefined;

  function tick(): void {
    running = o
      .poll()
      .then(
        (result) => result.failed.length === 0,
        (error: unknown) => {
          o.onError(error);
          return false;
        },
      )
      .then((ok) => {
        failures = ok ? 0 : failures + 1;
      })
      .finally(() => {
        running = undefined;
        if (!stopped) timer = setTimeout(tick, nextSeatPollDelayMs(failures, o.intervalMs)).unref();
      });
  }

  tick();
  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await running;
    },
  };
}

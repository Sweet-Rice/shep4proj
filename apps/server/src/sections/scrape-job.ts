import { and, eq, sql } from "drizzle-orm";
import {
  parseAcademicPeriods,
  parseSectionListing,
  sectionListingUrl,
  type SectionFetcher,
} from "@jevschedule/scraper";
import type { Db } from "../db/client.js";
import { sectionScrapes } from "../db/schema.js";
import { DEPARTMENT_PATTERN, replaceTermSections } from "./store.js";

/**
 * A term is re-scraped at most once per this interval. The portal says seat availability "is
 * updated daily", so reading it more often only adds load (T-005 decision, #90).
 */
export const SECTION_SCRAPE_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface SectionScrapeResult {
  /** Period ids the portal currently lists (after any `periodIds` filter). */
  periods: string[];
  scraped: { term: string; sections: number }[];
  /** Terms scraped less than `minIntervalMs` ago. */
  skipped: string[];
  failed: { term: string; error: string }[];
}

/**
 * Scrapes one department's sections from the Course Offerings portal for every academic period
 * it currently lists (T-403). The period ids come from the portal's own picker, never a
 * hardcoded list, so new terms are picked up as soon as LSU publishes them.
 *
 * Each term is fetched, parsed and stored on its own: a failure is recorded in `failed` and
 * the other terms still run. Only the landing page failing (so no periods are known) throws.
 */
export async function runSectionScrape(o: {
  db: Db;
  fetcher: SectionFetcher;
  department: string;
  /** Only scrape these periods (used to seed from the one saved fixture). */
  periodIds?: readonly string[];
  minIntervalMs?: number;
  now?: () => Date;
  log?: (message: string) => void;
}): Promise<SectionScrapeResult> {
  if (!DEPARTMENT_PATTERN.test(o.department)) {
    throw new Error(`department must be 2-4 capital letters, got "${o.department}"`);
  }
  const minIntervalMs = o.minIntervalMs ?? SECTION_SCRAPE_MIN_INTERVAL_MS;
  const now = o.now ?? (() => new Date());

  const landing = await o.fetcher.fetchHtml(sectionListingUrl({ department: o.department }));
  let periods = parseAcademicPeriods(landing).map((period) => period.id);
  if (o.periodIds !== undefined) {
    const wanted = new Set(o.periodIds);
    periods = periods.filter((id) => wanted.has(id));
  }

  const result: SectionScrapeResult = { periods, scraped: [], skipped: [], failed: [] };
  for (const term of periods) {
    await o.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${o.department}), hashtext(${term}))`,
      );
      const [lastScrape] = await tx
        .select({ scrapedAt: sectionScrapes.scrapedAt })
        .from(sectionScrapes)
        .where(and(eq(sectionScrapes.department, o.department), eq(sectionScrapes.term, term)))
        .limit(1);
      if (
        lastScrape !== undefined &&
        now().getTime() - lastScrape.scrapedAt.getTime() < minIntervalMs
      ) {
        result.skipped.push(term);
        return;
      }
      try {
        const url = sectionListingUrl({ department: o.department, periodId: term });
        o.log?.(`Fetching ${o.department} sections for ${term}: ${url}`);
        const listing = parseSectionListing(await o.fetcher.fetchHtml(url));
        if (listing.selectedPeriodId !== term) {
          throw new Error(`asked for ${term} but the page lists ${listing.selectedPeriodId}`);
        }
        await replaceTermSections(o.db, {
          department: o.department,
          term,
          sections: listing.sections,
          scrapedAt: now(),
        });
        result.scraped.push({ term, sections: listing.sections.length });
      } catch (error) {
        result.failed.push({ term, error: error instanceof Error ? error.message : String(error) });
      }
    });
  }
  return result;
}

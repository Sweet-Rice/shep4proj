import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { SectionFetcher } from "@jevschedule/scraper";
import type { Db } from "../db/client.js";
import { runSectionScrape } from "./scrape-job.js";

/** The saved Fall 2026 CSC listing (fixtures/sections/fall-2026/csc.html). */
export const SECTION_FIXTURE_PATH = fileURLToPath(
  new URL("../../../../fixtures/sections/fall-2026/csc.html", import.meta.url),
);

/** The period the fixture lists; it's also the only period seeded. */
export const SECTION_FIXTURE_PERIOD = "LSUAM_FALL_2026";

/**
 * Serves the saved listing for both the landing page (it has the same period picker) and the
 * fixture's own period, and throws for anything else, so tests never reach the live portal.
 */
export function createSectionFixtureFetcher(fixturePath = SECTION_FIXTURE_PATH): SectionFetcher {
  return {
    async fetchHtml(url: string): Promise<string> {
      const period = new URL(url).searchParams.get("AcademicPeriod");
      if (period === null || period === SECTION_FIXTURE_PERIOD) {
        return readFile(fixturePath, "utf8");
      }
      throw new Error(`no fixture for ${url}`);
    },
  };
}

/**
 * Seeds the database with the fixture's CSC sections for Fall 2026. Returns the number of
 * sections stored, or throws if the scrape failed.
 *
 * The seed is recorded as scraped at the epoch, not now: otherwise a live scrape run after
 * seeding would treat the fixture term as fresh and keep the fixture data for a day.
 */
export async function seedSectionFixtures(db: Db): Promise<number> {
  const result = await runSectionScrape({
    db,
    fetcher: createSectionFixtureFetcher(),
    department: "CSC",
    periodIds: [SECTION_FIXTURE_PERIOD],
    force: true,
    now: () => new Date(0),
  });
  const scraped = result.scraped[0];
  if (result.failed.length > 0 || scraped === undefined) {
    const details = result.failed.map((f) => `${f.term}: ${f.error}`).join("; ");
    throw new Error(`Failed to seed section fixtures: ${details || "nothing scraped"}`);
  }
  return scraped.sections;
}

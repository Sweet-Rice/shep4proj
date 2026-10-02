import { and, eq, gte } from "drizzle-orm";
import { CATALOG_2026_2027, type CatalogFetcher } from "@jevschedule/scraper";
import type { Db } from "../db/client.js";
import { catalogDepartmentScrapes, courses } from "../db/schema.js";
import { currentSemesterStart } from "../scrape-policy.js";
import { CATALOG_SCRAPE_DEPARTMENTS } from "./departments.js";
import { runCatalogScrape } from "./scrape-job.js";

export const CATALOG_SCRAPE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function runScheduledCatalogScrape(o: {
  db: Db;
  createFetcher: () => CatalogFetcher;
  departments?: readonly string[];
  runScrape?: typeof runCatalogScrape;
  now?: () => Date;
  log: (m: string) => void;
}): Promise<{
  scraped: string[];
  skipped: string[];
  failed: { code: string; error: string }[];
}> {
  const now = o.now ?? (() => new Date());
  const semesterStart = currentSemesterStart(now());
  const scraped: string[] = [];
  const skipped: string[] = [];
  const failed: { code: string; error: string }[] = [];
  let fetcher: CatalogFetcher | undefined;

  try {
    for (const dept of o.departments ?? CATALOG_SCRAPE_DEPARTMENTS) {
      const [state] = await o.db
        .select({
          completedAt: catalogDepartmentScrapes.completedAt,
          failedCount: catalogDepartmentScrapes.failedCount,
        })
        .from(catalogDepartmentScrapes)
        .where(
          and(
            eq(catalogDepartmentScrapes.catalogYear, CATALOG_2026_2027.catalogYear),
            eq(catalogDepartmentScrapes.dept, dept),
          ),
        )
        .limit(1);
      if (state !== undefined && state.completedAt >= semesterStart && state.failedCount === 0) {
        o.log(`catalog scrape ${dept}: skipped, already scraped this semester`);
        skipped.push(dept);
        continue;
      }

      const freshRows = await o.db
        .select({ code: courses.code })
        .from(courses)
        .where(
          and(
            eq(courses.catalogYear, CATALOG_2026_2027.catalogYear),
            eq(courses.dept, dept),
            gte(courses.updatedAt, semesterStart),
          ),
        );
      const skipCodes = new Set(freshRows.map(({ code }) => code));
      fetcher ??= o.createFetcher();
      try {
        const result = await (o.runScrape ?? runCatalogScrape)({
          db: o.db,
          fetcher,
          ...CATALOG_2026_2027,
          prefix: dept,
          skipCodes,
          log: o.log,
        });
        const completedAt = now();
        await o.db
          .insert(catalogDepartmentScrapes)
          .values({
            catalogYear: CATALOG_2026_2027.catalogYear,
            dept,
            completedAt,
            failedCount: result.failed.length,
          })
          .onConflictDoUpdate({
            target: [catalogDepartmentScrapes.catalogYear, catalogDepartmentScrapes.dept],
            set: { completedAt, failedCount: result.failed.length },
          });
        o.log(
          `catalog scrape ${dept}: ${result.listed} listed, ${result.skipped} already stored, ${result.upserted} upserted, ${result.failed.length} failed`,
        );
        for (const failure of result.failed) {
          o.log(`${failure.code}: failed: ${failure.error}`);
        }
        scraped.push(dept);
        failed.push(...result.failed);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        o.log(`catalog scrape ${dept}: failed: ${message}`);
        failed.push({ code: dept, error: message });
      }
    }
  } finally {
    await fetcher?.close();
  }

  return { scraped, skipped, failed };
}

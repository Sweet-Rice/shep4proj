import { CourseSchema, toPrereqRecord } from "@jevschedule/shared";
import {
  type CatalogFetcher,
  type CourseDetail,
  type CourseListEntry,
  COURSE_LIST_PAGE_SIZE,
  courseDetailUrl,
  courseListUrl,
  parseCourseDetail,
  parseCourseList,
} from "@jevschedule/scraper";
import type { Db } from "../db/client.js";
import { type NewCourseRow } from "../db/schema.js";
import { upsertCourses } from "./upsert.js";

/** Hard stop for a malformed or unexpectedly unbounded catalog listing (10,000 rows). */
export const MAX_CATALOG_LIST_PAGES = 100;

export function toCourseRow(
  entry: CourseListEntry,
  detail: CourseDetail,
  catalogYear: string,
): NewCourseRow {
  // Validate through CourseSchema.parse
  const course = CourseSchema.parse({
    catalogYear,
    code: entry.code,
    title: detail.title,
    credits: detail.creditsText,
    description: detail.description,
    prerequisiteText: detail.prerequisiteText,
  });
  const dept = course.code.split(" ")[0] ?? "";
  const prereqRecord = toPrereqRecord(detail.prerequisiteText);
  return {
    catalogYear: course.catalogYear,
    code: course.code,
    dept,
    title: course.title,
    creditsMin: course.credits.min,
    creditsMax: course.credits.max,
    creditsNote: course.credits.note,
    description: course.description,
    prerequisiteText: course.prerequisiteText,
    prereqTree: prereqRecord.tree,
    prereqNeedsReview: prereqRecord.needsReview,
    prereqReviewReason: prereqRecord.reviewReason,
    prereqNotes: prereqRecord.notes,
    coid: entry.coid,
  };
}

export async function runCatalogScrape(o: {
  db: Db;
  fetcher: CatalogFetcher;
  catalogYear: string;
  catoid: string;
  navoid: string;
  prefix: string;
  codes?: readonly string[];
  skipCodes?: ReadonlySet<string>;
  log?: (m: string) => void;
}): Promise<{
  listed: number;
  upserted: number;
  skipped: number;
  failed: { code: string; error: string }[];
}> {
  // 1. Fetch catalog pages until one is short; fail closed if the listing never ends.
  const entries: CourseListEntry[] = [];
  let page = 1;
  while (page <= MAX_CATALOG_LIST_PAGES) {
    const url = courseListUrl({
      catoid: o.catoid,
      navoid: o.navoid,
      prefix: o.prefix,
      page,
    });
    o.log?.(`Fetching course list page ${page}: ${url}`);
    const html = await o.fetcher.fetchHtml(url);
    const pageEntries = parseCourseList(html);
    entries.push(...pageEntries);
    if (pageEntries.length < COURSE_LIST_PAGE_SIZE) {
      break;
    }
    if (page === MAX_CATALOG_LIST_PAGES) {
      throw new Error(`Catalog course list exceeded ${MAX_CATALOG_LIST_PAGES} pages`);
    }
    page++;
  }

  // 2. listed = unique entry count.
  const uniqueEntries = new Map<string, CourseListEntry>();
  for (const entry of entries) {
    if (!uniqueEntries.has(entry.code)) {
      uniqueEntries.set(entry.code, entry);
    }
  }
  const listed = uniqueEntries.size;

  // 3. Filter entries by codes when given.
  let targetEntries = Array.from(uniqueEntries.values());
  if (o.codes !== undefined) {
    const codeSet = new Set(o.codes);
    targetEntries = targetEntries.filter((entry) => codeSet.has(entry.code));
  }

  // 4. Fetch and persist each target sequentially, retaining earlier successes after failures.
  const failed: { code: string; error: string }[] = [];
  let upserted = 0;
  let skipped = 0;

  for (const entry of targetEntries) {
    if (o.skipCodes?.has(entry.code)) {
      skipped++;
      continue;
    }
    try {
      const detailUrl = courseDetailUrl({ catoid: o.catoid, coid: entry.coid });
      o.log?.(`Fetching course detail for ${entry.code}: ${detailUrl}`);
      const html = await o.fetcher.fetchHtml(detailUrl);
      const detail = parseCourseDetail(html);
      if (detail.code !== entry.code) {
        failed.push({
          code: entry.code,
          error: `Detail code mismatch: expected ${entry.code}, got ${detail.code}`,
        });
        continue;
      }
      const row = toCourseRow(entry, detail, o.catalogYear);
      upserted += await upsertCourses(o.db, [row]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ code: entry.code, error: message });
    }
  }

  return { listed, upserted, skipped, failed };
}

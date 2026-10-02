import type { CourseCode } from "@jevschedule/shared";
import type { StoreImport } from "./workday-import.js";

export const NOT_IN_CATALOG_REASON = "not in the LSU course catalog";

export class CourseNotInCatalogError extends Error {
  constructor(readonly codes: readonly CourseCode[]) {
    super(`Not in the LSU course catalog: ${codes.join(", ")}`);
    this.name = "CourseNotInCatalogError";
  }
}

export type WorkdayImportReview = StoreImport;

export function restrictReviewToCatalog(
  review: WorkdayImportReview,
  catalog: ReadonlySet<CourseCode>,
): WorkdayImportReview {
  const missing = new Set<CourseCode>();
  const completed = review.completed.filter((code) => {
    if (catalog.has(code)) return true;
    missing.add(code);
    return false;
  });
  const inProgress = review.inProgress
    .map((term) => ({
      ...term,
      courses: term.courses.filter((code) => {
        if (catalog.has(code)) return true;
        missing.add(code);
        return false;
      }),
    }))
    .filter((term) => term.courses.length > 0);
  const skipped: WorkdayImportReview["skipped"] = [];
  const seen = new Set<string>();
  for (const item of review.skipped) {
    const key = `${item.code}\0${item.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    skipped.push(item);
  }
  for (const code of missing) {
    const key = `${code}\0${NOT_IN_CATALOG_REASON}`;
    if (!seen.has(key)) skipped.push({ code, reason: NOT_IN_CATALOG_REASON });
    seen.add(key);
  }
  return { completed, inProgress, skipped };
}

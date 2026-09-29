/** Package identifier, used to prove cross-package builds work. */
export const PACKAGE_NAME = "@jevschedule/scraper";

/**
 * Placeholder for the catalog and section parsers that will live in this
 * package. Pure, fixture-tested; never hits live LSU pages in CI.
 */
export function isPlaceholder(): boolean {
  return true;
}

export { parseCourseDetail } from "./catalog/course-detail.js";
export type { CourseDetail } from "./catalog/course-detail.js";
export { parseCourseList } from "./catalog/course-list.js";
export type { CourseListEntry } from "./catalog/course-list.js";
export { CatalogShapeError } from "./catalog/errors.js";
export {
  CATALOG_2026_2027,
  CATALOG_ORIGIN,
  COURSE_LIST_PAGE_SIZE,
  courseDetailUrl,
  courseListUrl,
} from "./catalog/urls.js";

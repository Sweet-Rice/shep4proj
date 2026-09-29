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
export { createCatalogFetcher } from "./fetch/catalog-fetcher.js";
export type { CatalogFetcher, CatalogFetcherOptions } from "./fetch/catalog-fetcher.js";
export { createCrawlDelay } from "./fetch/crawl-delay.js";
export type { CrawlDelay } from "./fetch/crawl-delay.js";
export {
  CATALOG_CRAWL_DELAY_MS,
  DisallowedUrlError,
  assertAllowedCatalogUrl,
} from "./fetch/robots.js";
export { PREREQ_PATTERN_TAGS, suggestPrereqTags } from "./prereq-corpus/tags.js";
export { SectionShapeError } from "./sections/errors.js";
export { parseSectionListing } from "./sections/section-listing.js";
export type { AcademicPeriod, SectionListing } from "./sections/section-listing.js";
export type { PrereqPatternTag } from "./prereq-corpus/tags.js";

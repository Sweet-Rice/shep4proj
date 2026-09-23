/** Package identifier, used to prove cross-package builds work. */
export const PACKAGE_NAME = "@jevschedule/scraper";

/**
 * Placeholder for the catalog and section parsers that will live in this
 * package. Pure, fixture-tested; never hits live LSU pages in CI.
 */
export function isPlaceholder(): boolean {
  return true;
}

/** Package identifier, used to prove cross-package builds work. */
export const PACKAGE_NAME = "@jevschedule/workday";

/**
 * Placeholder for the Workday response parser and transcript PDF parser
 * that will live in this package. Pure, fixture-tested; never touches a
 * live Workday session.
 */
export function isPlaceholder(): boolean {
  return true;
}

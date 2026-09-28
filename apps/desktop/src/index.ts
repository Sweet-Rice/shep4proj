import { greet, PACKAGE_NAME as SHARED_PACKAGE_NAME } from "@jevschedule/shared";

/** Package identifier, used to prove cross-package builds work. */
export const PACKAGE_NAME = "@jevschedule/desktop";

/**
 * Confirms the desktop package can import from @jevschedule/shared.
 */
export function describeDesktop(): string {
  return `${PACKAGE_NAME} depends on ${SHARED_PACKAGE_NAME}: ${greet("desktop")}`;
}

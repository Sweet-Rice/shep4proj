import { greet, PACKAGE_NAME as SHARED_PACKAGE_NAME } from "@jevschedule/shared";

/** Package identifier, used to prove cross-package builds work. */
export const PACKAGE_NAME = "@jevschedule/desktop";

/**
 * Placeholder entry point. Confirms the desktop package can import from
 * @jevschedule/shared. The real Electron + React shell lands in T-017.
 */
export function describeDesktop(): string {
  return `${PACKAGE_NAME} depends on ${SHARED_PACKAGE_NAME}: ${greet("desktop")}`;
}

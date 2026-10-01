import { greet, PACKAGE_NAME as SHARED_PACKAGE_NAME } from "@jevschedule/shared";
export { CourseSchema, type Course } from "@jevschedule/shared";
export { DegreeProgressView } from "./renderer/src/components/DegreeProgressView.js";
export { DegreeProgressScreen } from "./renderer/src/components/DegreeProgressScreen.js";
export { MarkPrereqsDialog } from "./renderer/src/components/MarkPrereqsDialog.js";

/** Package identifier, used to prove cross-package builds work. */
export const PACKAGE_NAME = "@jevschedule/desktop";

/**
 * Confirms the desktop package can import from @jevschedule/shared.
 */
export function describeDesktop(): string {
  return `${PACKAGE_NAME} depends on ${SHARED_PACKAGE_NAME}: ${greet("desktop")}`;
}

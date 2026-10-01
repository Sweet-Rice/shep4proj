import { greet, PACKAGE_NAME as SHARED_PACKAGE_NAME } from "@jevschedule/shared";
export { CourseSchema, type Course } from "@jevschedule/shared";
export { DegreeProgressView } from "./renderer/src/components/DegreeProgressView.js";
export { DegreeProgressScreen } from "./renderer/src/components/DegreeProgressScreen.js";
export { MarkPrereqsDialog } from "./renderer/src/components/MarkPrereqsDialog.js";
export { CourseSearch } from "./renderer/src/components/CourseSearch.js";
export { useCourseSearch, filterCourses } from "./renderer/src/hooks/useCourseSearch.js";
export { SemesterBoard } from "./renderer/src/components/SemesterBoard.js";
export { usePlan } from "./renderer/src/hooks/usePlan.js";
export { WeeklyCalendar, formatMinuteToTime } from "./renderer/src/components/WeeklyCalendar.js";
export { ImportReviewScreen } from "./renderer/src/components/ImportReviewScreen.js";
export { ImportProgressFlow } from "./renderer/src/components/ImportProgressFlow.js";
export {
  useScheduleBuilder,
  findScheduleConflicts,
  getSectionKey,
} from "./renderer/src/hooks/useScheduleBuilder.js";
export { SectionWatchToggle } from "./renderer/src/components/SectionWatchToggle.js";
export { useSectionWatches } from "./renderer/src/hooks/useSectionWatches.js";
export { JevProviderService } from "./renderer/src/services/jevProvider.js";

/** Package identifier, used to prove cross-package builds work. */
export const PACKAGE_NAME = "@jevschedule/desktop";

/**
 * Confirms the desktop package can import from @jevschedule/shared.
 */
export function describeDesktop(): string {
  return `${PACKAGE_NAME} depends on ${SHARED_PACKAGE_NAME}: ${greet("desktop")}`;
}

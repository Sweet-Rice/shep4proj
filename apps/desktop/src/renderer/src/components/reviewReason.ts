import type { CourseDetail } from "@jevschedule/shared";

/**
 * Turns the prerequisite parser's `<reason>: <detail>` string into a sentence
 * for students, quoting the original catalog text so they know what to check.
 */
export function describeReviewReason(detail: CourseDetail): string {
  const kind = detail.prereq.reviewReason?.split(":", 1)[0];
  const original = detail.prerequisiteText?.trim();
  if (!original) {
    return "Prerequisite text couldn't be read. Check the catalog for the requirements.";
  }
  if (kind === "ambiguous-and-or") {
    return `Prerequisite text mixes "and" and "or" in a way that could mean more than one thing: ${original}`;
  }
  return `Prerequisite text couldn't be read: ${original}`;
}

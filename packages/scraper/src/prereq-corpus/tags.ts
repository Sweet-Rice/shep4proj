/**
 * Tag definitions and classification heuristics for catalog prerequisite texts.
 */

export const PREREQ_PATTERN_TAGS = [
  "single",
  "and-list",
  "or-list",
  "semicolon-groups",
  "mixed-and-or",
  "coreq",
  "min-grade",
  "non-course",
  "non-csc",
  "other",
] as const;

export type PrereqPatternTag = (typeof PREREQ_PATTERN_TAGS)[number];

const COREQ_PHRASES_TEST =
  /credit or registration in|credit or concurrent enrollment in|concurrent enrollment in|registration in/i;

const COREQ_PHRASES_STRIP =
  /credit or registration in|credit or concurrent enrollment in|concurrent enrollment in|registration in/gi;

const MIN_GRADE_PATTERN = /["“]?[A-D]["”]? or better|grade of ["“]?[A-D]/i;

const NON_COURSE_PATTERN = /permission|consent|equivalent|standing|majors only|approval|admission/i;

const COURSE_CODE_PATTERN = /\b([a-zA-Z]{2,4})\s+(\d{4})\b/g;

const COMMA_SEPARATES_COURSES =
  /\b[a-zA-Z]{2,4}\s+\d{4}\s*,\s*(?:(?:and|or)\s+)?[a-zA-Z]{2,4}\s+\d{4}\b/i;

/**
 * Suggests pattern tags for a course prerequisite string based on heuristic rules.
 *
 * Rules are evaluated after collapsing whitespace runs. Tags are returned in
 * the exact order defined by {@link PREREQ_PATTERN_TAGS}.
 */
export function suggestPrereqTags(text: string): PrereqPatternTag[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  const tags = new Set<PrereqPatternTag>();

  if (COREQ_PHRASES_TEST.test(normalized)) {
    tags.add("coreq");
  }

  // Strip coreq phrases before evaluating and/or rules
  const stripped = normalized.replace(COREQ_PHRASES_STRIP, " ");

  if (MIN_GRADE_PATTERN.test(normalized)) {
    tags.add("min-grade");
  }

  if (NON_COURSE_PATTERN.test(normalized)) {
    tags.add("non-course");
  }

  const courseCodes = [...normalized.matchAll(COURSE_CODE_PATTERN)];
  if (courseCodes.some((m) => m[1]?.toUpperCase() !== "CSC")) {
    tags.add("non-csc");
  }

  if (normalized.includes(";")) {
    tags.add("semicolon-groups");
  }

  const semicolonGroups = stripped.split(";");
  const hasMixedAndOr = semicolonGroups.some(
    (group) => /\band\b/i.test(group) && /\bor\b/i.test(group),
  );

  if (hasMixedAndOr) {
    tags.add("mixed-and-or");
  }

  if (!hasMixedAndOr && /\bor\b/i.test(stripped)) {
    tags.add("or-list");
  }

  if (!hasMixedAndOr && (/\band\b/i.test(stripped) || COMMA_SEPARATES_COURSES.test(stripped))) {
    tags.add("and-list");
  }

  if (
    courseCodes.length === 1 &&
    !/\band\b/i.test(stripped) &&
    !/\bor\b/i.test(stripped) &&
    !normalized.includes(";")
  ) {
    tags.add("single");
  }

  if (tags.size === 0) {
    tags.add("other");
  }

  return PREREQ_PATTERN_TAGS.filter((tag) => tags.has(tag));
}

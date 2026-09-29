/** Package identifier, used to prove cross-package builds work. */
export const PACKAGE_NAME = "@jevschedule/shared";

export { CourseSchema } from "./course.js";
export type { Course } from "./course.js";

export { CatalogYearSchema } from "./catalog-year.js";
export type { CatalogYear } from "./catalog-year.js";
export { CourseCodeSchema } from "./course-code.js";
export type { CourseCode } from "./course-code.js";
export { LetterGradeSchema } from "./grade.js";
export type { LetterGrade } from "./grade.js";
export {
  ChooseNRequirementSchema,
  CourseRefSchema,
  CreditBucketRequirementSchema,
  DegreeProgramSchema,
  FixedRequirementSchema,
  RequirementSchema,
} from "./requirements.js";
export type {
  ChooseNRequirement,
  CourseRef,
  CreditBucketRequirement,
  DegreeProgram,
  FixedRequirement,
  Requirement,
} from "./requirements.js";

/**
 * Placeholder for the shared planner types, zod schemas, and prereq /
 * requirement / eligibility / conflict logic that will live in this package.
 */
export function greet(name: string): string {
  return `Hello, ${name}, from ${PACKAGE_NAME}`;
}

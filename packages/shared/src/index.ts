/** Package identifier, used to prove cross-package builds work. */
export const PACKAGE_NAME = "@jevschedule/shared";

export { CourseKeySchema, CourseSchema, CreditsSchema, parseCreditsText } from "./course.js";
export { CourseDetailSchema, DegreeSummarySchema } from "./catalog-api.js";
export type { CourseDetail, DegreeSummary } from "./catalog-api.js";
export type { Course, CourseKey, Credits } from "./course.js";

export { CatalogYearSchema } from "./catalog-year.js";
export type { CatalogYear } from "./catalog-year.js";
export { CourseCodeSchema } from "./course-code.js";
export type { CourseCode } from "./course-code.js";
export { LetterGradeSchema } from "./grade.js";
export type { LetterGrade } from "./grade.js";
export { DEFAULT_CREDIT_LIMIT, PlanSchema, PlanTermSchema, SeasonSchema } from "./plan.js";
export type { Plan, PlanTerm, Season } from "./plan.js";
export { PrereqNodeSchema } from "./prereq.js";
export type { PrereqNode } from "./prereq.js";
export { parsePrereqText } from "./prereq-parser.js";
export type { PrereqFailureReason, PrereqParseResult } from "./prereq-parser.js";
export { PrereqRecordSchema, toPrereqRecord } from "./prereq-record.js";
export type { PrereqRecord } from "./prereq-record.js";
export { collectPrereqCourseCodes, getUnfulfilledPrereqs } from "./prereq-utils.js";
export { isEligible } from "./is-eligible.js";
export type { EligibilityCourse, EligibilityResult } from "./is-eligible.js";
export { validatePlan } from "./validate-plan.js";
export type {
  PlanCourse,
  PlanValidationIssue,
  PlanValidationResult,
  ValidationPlan,
} from "./validate-plan.js";
export {
  AcademicPeriodIdSchema,
  MeetingSchema,
  SectionCourseCodeSchema,
  SectionSchema,
  WeekdaySchema,
} from "./section.js";
export type { AcademicPeriodId, Meeting, Section, SectionCourseCode, Weekday } from "./section.js";
export { typicalTerms } from "./typical-terms.js";
export type { CourseOfferingHistory, TypicalTerm } from "./typical-terms.js";
export { createPlannerTools } from "./planner-tools.js";
export { createRuleBasedAdvisorProvider } from "./advisor-provider.js";
export type { AdvisorContext, AdvisorProvider, AdvisorSuggestion } from "./advisor-provider.js";
export type {
  EligibleCourse,
  PlannerTools,
  PlannerToolsPorts,
  RemainingRequirements,
} from "./planner-tools.js";
export { findConflicts } from "./find-conflicts.js";
export type { SectionConflict } from "./find-conflicts.js";
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

export { evaluateRequirements } from "./evaluate-requirements.js";
export type {
  CompletedCourseInput,
  CompletedInput,
  DegreeEvaluation,
  EvaluatedChooseNRequirement,
  EvaluatedCreditBucketRequirement,
  EvaluatedFixedRequirement,
  EvaluatedRequirement,
} from "./evaluate-requirements.js";

/**
 * Placeholder for the shared planner types, zod schemas, and prereq /
 * requirement / eligibility / conflict logic that will live in this package.
 */
export function greet(name: string): string {
  return `Hello, ${name}, from ${PACKAGE_NAME}`;
}

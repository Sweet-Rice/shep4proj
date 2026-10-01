import type { CourseCode } from "./course-code.js";
import type { Credits } from "./course.js";
import type { CompletedInput } from "./evaluate-requirements.js";
import { isEligible, type EligibilityCourse } from "./is-eligible.js";
import type { Plan, PlanTerm, Season } from "./plan.js";

/** Course details loaded from the catalog before a plan is validated. */
export interface PlanCourse extends EligibilityCourse {
  credits: Credits;
}

/** The saved plan, enriched with the catalog data needed to validate it. */
export type ValidationPlan = Plan & {
  courseDetails: Readonly<Record<CourseCode, PlanCourse>>;
};

export type PlanValidationIssue =
  | { type: "missing_course"; term: PlanTerm; courseCode: CourseCode }
  | {
      type: "prerequisite";
      term: PlanTerm;
      courseCode: CourseCode;
      missingPrerequisites: string[];
    }
  | { type: "credit_limit"; term: PlanTerm; credits: number; creditLimit: number };

export interface PlanValidationResult {
  valid: boolean;
  issues: PlanValidationIssue[];
}

const SEASON_ORDER: Record<Season, number> = { Winter: 0, Spring: 1, Summer: 2, Fall: 3 };

/**
 * Checks each term in calendar order. Planned courses become available to later
 * terms, while only explicit corequisites may satisfy a same-term requirement.
 * Variable-credit courses use their maximum, so a possible overload is shown.
 * Course data that was not loaded is reported rather than assumed to have no
 * prerequisites or credits.
 */
export function validatePlan(
  plan: ValidationPlan,
  completed: CompletedInput[] | Set<CourseCode>,
): PlanValidationResult {
  const issues: PlanValidationIssue[] = [];
  const prior = Array.from(completed);
  const terms = [...plan.terms].sort(
    (a, b) => a.year - b.year || SEASON_ORDER[a.season] - SEASON_ORDER[b.season],
  );

  for (const term of terms) {
    const sameTerm = new Set(term.courses);
    let credits = 0;
    for (const courseCode of term.courses) {
      const course = plan.courseDetails[courseCode];
      if (!course || course.code !== courseCode) {
        issues.push({ type: "missing_course", term, courseCode });
        continue;
      }
      credits += course.credits.max;
      const eligibility = isEligible(course, prior, sameTerm);
      if (!eligibility.eligible) {
        issues.push({
          type: "prerequisite",
          term,
          courseCode,
          missingPrerequisites: eligibility.missingPrerequisites,
        });
      }
    }
    if (credits > plan.creditLimit) {
      issues.push({ type: "credit_limit", term, credits, creditLimit: plan.creditLimit });
    }
    prior.push(...term.courses);
  }

  return { valid: issues.length === 0, issues };
}

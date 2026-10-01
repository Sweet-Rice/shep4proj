import type { CourseCode } from "./course-code.js";
import type { Course } from "./course.js";
import {
  evaluateRequirements,
  type CompletedInput,
  type DegreeEvaluation,
  type EvaluatedRequirement,
} from "./evaluate-requirements.js";
import { isEligible, type EligibilityCourse, type EligibilityResult } from "./is-eligible.js";
import type { DegreeProgram } from "./requirements.js";
import { validatePlan, type PlanValidationResult, type ValidationPlan } from "./validate-plan.js";
import type { CourseOfferingHistory } from "./typical-terms.js";

export interface PlannerToolsPorts {
  /** Local completed-course store, supplied by the app. */
  getCompleted?: () => Promise<CompletedInput[]>;
  /** Course history API, supplied by the app once its base URL is configured. */
  getHistory?: (code: CourseCode) => Promise<CourseOfferingHistory[]>;
}

export type RemainingRequirements = DegreeEvaluation & {
  remainingRequirements: EvaluatedRequirement[];
};

export interface EligibleCourse {
  course: EligibilityCourse;
  result: EligibilityResult;
}

export interface PlannerTools {
  getCompleted(): Promise<CompletedInput[]>;
  getRemainingRequirements(
    degree: DegreeProgram,
    completed: CompletedInput[] | Set<CourseCode>,
    catalog?: Map<CourseCode, Course> | Course[],
  ): RemainingRequirements;
  getEligible(
    courses: readonly EligibilityCourse[],
    completed: CompletedInput[] | Set<CourseCode>,
    plannedSameTerm?: ReadonlySet<CourseCode> | readonly CourseCode[],
  ): EligibleCourse[];
  getHistory(code: CourseCode): Promise<CourseOfferingHistory[]>;
  validatePlan(
    plan: ValidationPlan,
    completed: CompletedInput[] | Set<CourseCode>,
  ): PlanValidationResult;
}

/**
 * One entry point for planner queries. Store and network access stay in the host
 * application; the shared package owns their contracts and pure evaluations.
 */
export function createPlannerTools(ports: PlannerToolsPorts = {}): PlannerTools {
  return {
    getCompleted: async () => {
      if (!ports.getCompleted) throw new Error("completed-course source is not configured");
      return ports.getCompleted();
    },
    getRemainingRequirements: (degree, completed, catalog) => {
      const evaluation = evaluateRequirements(degree, completed, catalog);
      return {
        ...evaluation,
        remainingRequirements: evaluation.requirements.filter(
          (requirement) => !requirement.isSatisfied,
        ),
      };
    },
    getEligible: (courses, completed, plannedSameTerm = []) =>
      courses.map((course) => ({ course, result: isEligible(course, completed, plannedSameTerm) })),
    getHistory: async (code) => {
      if (!ports.getHistory) throw new Error("course-history source is not configured");
      return ports.getHistory(code);
    },
    validatePlan,
  };
}

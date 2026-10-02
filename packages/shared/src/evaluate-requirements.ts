import type { CourseCode } from "./course-code.js";
import type { Course } from "./course.js";
import type { LetterGrade } from "./grade.js";
import type {
  ChooseNRequirement,
  CourseRef,
  CreditBucketRequirement,
  DegreeProgram,
  FixedRequirement,
} from "./requirements.js";

export interface CompletedCourseInput {
  code: CourseCode;
  grade?: LetterGrade | null;
  credits?: number;
}

export type CompletedInput = CourseCode | CompletedCourseInput;

export interface EvaluatedFixedRequirement extends FixedRequirement {
  isSatisfied: boolean;
  status: "satisfied" | "partially_satisfied" | "unsatisfied";
  fulfilledCourses: CourseRef[];
  missingCourses: CourseRef[];
}

export interface EvaluatedChooseNRequirement extends ChooseNRequirement {
  isSatisfied: boolean;
  status: "satisfied" | "partially_satisfied" | "unsatisfied";
  fulfilledOptions: CourseRef[];
  missingCount: number;
}

export interface EvaluatedCreditBucketRequirement extends CreditBucketRequirement {
  isSatisfied: boolean;
  status: "satisfied" | "partially_satisfied" | "unsatisfied";
  fulfilledCredits: number;
  fulfilledCourses: CourseRef[];
}

export type EvaluatedRequirement =
  EvaluatedFixedRequirement | EvaluatedChooseNRequirement | EvaluatedCreditBucketRequirement;

export interface DegreeEvaluation {
  degreeId: string;
  isSatisfied: boolean;
  totalCreditsRequired: number;
  totalCreditsFulfilled: number;
  requirements: EvaluatedRequirement[];
  unusedCompletedCourses: CourseCode[];
}

const GRADE_RANKS: Record<LetterGrade, number> = {
  A: 4,
  B: 3,
  C: 2,
  D: 1,
};

function satisfiesMinGrade(
  minGrade: LetterGrade | null,
  actualGrade?: LetterGrade | null,
): boolean {
  if (minGrade === null) {
    return true;
  }
  if (actualGrade === null || actualGrade === undefined) {
    // When no grade is recorded on a completed course, assume passing grade
    return true;
  }
  const minRank = GRADE_RANKS[minGrade];
  const actualRank = GRADE_RANKS[actualGrade];
  return actualRank !== undefined && actualRank >= minRank;
}

function resolveCourseCredits(
  code: CourseCode,
  inputCredits?: number,
  catalog?: Map<CourseCode, Course> | Course[],
): number {
  if (inputCredits !== undefined && inputCredits > 0) {
    return inputCredits;
  }
  if (catalog) {
    if (catalog instanceof Map) {
      const found = catalog.get(code);
      if (found?.credits?.min !== undefined && found.credits.min > 0) {
        return found.credits.min;
      }
    } else if (Array.isArray(catalog)) {
      const found = catalog.find((c) => c.code === code);
      if (found?.credits?.min !== undefined && found.credits.min > 0) {
        return found.credits.min;
      }
    }
  }
  return 3; // Standard default credit hours per course
}

/** Normalizes completed inputs into uniform objects for evaluation. */
function normalizeCompleted(completed: CompletedInput[] | Set<CourseCode>): CompletedCourseInput[] {
  if (completed instanceof Set) {
    return Array.from(completed).map((code) => ({ code }));
  }
  return completed.map((item) => (typeof item === "string" ? { code: item } : item));
}

/**
 * Evaluates a degree program against a set of completed courses.
 * Enforces strict single-assignment per course to prevent double-counting
 * across fixed, chooseN, and credit bucket requirements.
 */
export function evaluateRequirements(
  degree: DegreeProgram,
  completed: CompletedInput[] | Set<CourseCode>,
  catalog?: Map<CourseCode, Course> | Course[],
): DegreeEvaluation {
  const available = normalizeCompleted(completed);
  const evaluatedRequirements: EvaluatedRequirement[] = new Array(degree.requirements.length);
  const processingOrder = degree.requirements
    .map((requirement, index) => ({ requirement, index }))
    .sort((a, b) => {
      const aIsOpenBucket =
        a.requirement.kind === "creditBucket" && a.requirement.eligibleCourses.length === 0;
      const bIsOpenBucket =
        b.requirement.kind === "creditBucket" && b.requirement.eligibleCourses.length === 0;
      return Number(aIsOpenBucket) - Number(bIsOpenBucket) || a.index - b.index;
    });
  let totalCreditsFulfilled = 0;

  for (const { requirement, index } of processingOrder) {
    switch (requirement.kind) {
      case "fixed": {
        const fulfilledCourses: CourseRef[] = [];
        const missingCourses: CourseRef[] = [];
        let reqCredits = 0;

        for (const ref of requirement.courses) {
          const index = available.findIndex(
            (c) => c.code === ref.code && satisfiesMinGrade(ref.minGrade, c.grade),
          );
          if (index !== -1) {
            fulfilledCourses.push(ref);
            const courseItem = available[index]!;
            const credits = resolveCourseCredits(courseItem.code, courseItem.credits, catalog);
            reqCredits += credits;
            available.splice(index, 1);
          } else {
            missingCourses.push(ref);
          }
        }

        const isSatisfied = missingCourses.length === 0;
        totalCreditsFulfilled += reqCredits;

        evaluatedRequirements[index] = {
          ...requirement,
          isSatisfied,
          status: isSatisfied
            ? "satisfied"
            : fulfilledCourses.length > 0
              ? "partially_satisfied"
              : "unsatisfied",
          fulfilledCourses,
          missingCourses,
        };
        break;
      }

      case "chooseN": {
        const fulfilledOptions: CourseRef[] = [];
        let reqCredits = 0;

        for (const option of requirement.options) {
          if (fulfilledOptions.length >= requirement.n) {
            break;
          }
          const index = available.findIndex(
            (c) => c.code === option.code && satisfiesMinGrade(option.minGrade, c.grade),
          );
          if (index !== -1) {
            fulfilledOptions.push(option);
            const courseItem = available[index]!;
            const credits = resolveCourseCredits(courseItem.code, courseItem.credits, catalog);
            reqCredits += credits;
            available.splice(index, 1);
          }
        }

        const missingCount = Math.max(0, requirement.n - fulfilledOptions.length);
        const isSatisfied = missingCount === 0;
        totalCreditsFulfilled += reqCredits;

        evaluatedRequirements[index] = {
          ...requirement,
          isSatisfied,
          status: isSatisfied
            ? "satisfied"
            : fulfilledOptions.length > 0
              ? "partially_satisfied"
              : "unsatisfied",
          fulfilledOptions,
          missingCount,
        };
        break;
      }

      case "creditBucket": {
        const fulfilledCourses: CourseRef[] = [];
        let fulfilledCredits = 0;

        if (requirement.eligibleCourses.length > 0) {
          for (const eligible of requirement.eligibleCourses) {
            if (fulfilledCredits >= requirement.credits) {
              break;
            }
            const index = available.findIndex(
              (c) => c.code === eligible.code && satisfiesMinGrade(eligible.minGrade, c.grade),
            );
            if (index !== -1) {
              fulfilledCourses.push(eligible);
              const courseItem = available[index]!;
              const credits = resolveCourseCredits(courseItem.code, courseItem.credits, catalog);
              fulfilledCredits += credits;
              available.splice(index, 1);
            }
          }
        } else {
          // Open bucket: any remaining completed course fills it
          while (available.length > 0 && fulfilledCredits < requirement.credits) {
            const courseItem = available.shift()!;
            const credits = resolveCourseCredits(courseItem.code, courseItem.credits, catalog);
            fulfilledCredits += credits;
            fulfilledCourses.push({ code: courseItem.code, minGrade: null });
          }
        }

        const isSatisfied = fulfilledCredits >= requirement.credits;
        totalCreditsFulfilled += fulfilledCredits;

        evaluatedRequirements[index] = {
          ...requirement,
          isSatisfied,
          status: isSatisfied
            ? "satisfied"
            : fulfilledCredits > 0
              ? "partially_satisfied"
              : "unsatisfied",
          fulfilledCredits,
          fulfilledCourses,
        };
        break;
      }
    }
  }

  const unusedCompletedCourses = available.map((c) => c.code);
  const degreeSatisfied = evaluatedRequirements.every((r) => r.isSatisfied);

  return {
    degreeId: degree.id,
    isSatisfied: degreeSatisfied,
    totalCreditsRequired: degree.totalCredits,
    totalCreditsFulfilled,
    requirements: evaluatedRequirements,
    unusedCompletedCourses,
  };
}

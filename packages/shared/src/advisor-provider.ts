import type { CourseCode } from "./course-code.js";
import type { CompletedInput, EvaluatedRequirement } from "./evaluate-requirements.js";
import { evaluateRequirements, satisfiesMinGrade } from "./evaluate-requirements.js";
import type { LetterGrade } from "./grade.js";
import { isEligible } from "./is-eligible.js";
import type { Season } from "./plan.js";
import type { DegreeProgram } from "./requirements.js";
import { typicalTerms, type CourseOfferingHistory } from "./typical-terms.js";
import { validatePlan, type PlanCourse } from "./validate-plan.js";

export interface AdvisorContext {
  degree: DegreeProgram;
  /** Caller includes grades only when the student has opted in. */
  completed: CompletedInput[];
  courses: PlanCourse[];
  term: { season: Season; year: number };
  creditLimit: number;
  /** Missing history means the offering season is unknown, not unavailable. */
  history?: Partial<Record<CourseCode, CourseOfferingHistory[]>>;
}

export interface AdvisorSuggestion {
  courses: CourseCode[];
  rationale: Record<CourseCode, string>;
}

/** All providers share this contract; remote or local AI providers can be async. */
export interface AdvisorProvider {
  suggest(context: AdvisorContext): Promise<AdvisorSuggestion>;
}

type Reason = {
  priority: number;
  requirementId: string;
  label: string;
  limit: number;
  minGrade: LetterGrade | null;
};

function reasonsFor(requirements: EvaluatedRequirement[]): Map<CourseCode, Reason> {
  const reasons = new Map<CourseCode, Reason>();
  for (const requirement of requirements) {
    if (requirement.isSatisfied) continue;
    const candidates =
      requirement.kind === "fixed"
        ? requirement.missingCourses
        : requirement.kind === "chooseN"
          ? requirement.options
          : requirement.eligibleCourses;
    const priority = requirement.kind === "fixed" ? 0 : requirement.kind === "chooseN" ? 1 : 2;
    const limit =
      requirement.kind === "chooseN"
        ? requirement.missingCount
        : requirement.kind === "creditBucket"
          ? requirement.credits - requirement.fulfilledCredits
          : Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const previous = reasons.get(candidate.code);
      if (!previous || priority < previous.priority) {
        reasons.set(candidate.code, {
          priority,
          requirementId: requirement.id,
          label: requirement.label,
          limit,
          minGrade: candidate.minGrade,
        });
      }
    }
  }
  return reasons;
}

/** Deterministic, local baseline: required, eligible courses in observed seasons first. */
export function createRuleBasedAdvisorProvider(): AdvisorProvider {
  return {
    async suggest(context) {
      const { completed, courses, creditLimit, term, history = {} } = context;
      const reasons = reasonsFor(evaluateRequirements(context.degree, completed).requirements);
      const ranked = courses
        .filter((course) => {
          const reason = reasons.get(course.code);
          if (!reason) return false;
          return !completed.some((item) => {
            if ((typeof item === "string" ? item : item.code) !== course.code) return false;
            return satisfiesMinGrade(
              reason.minGrade,
              typeof item === "string" ? undefined : item.grade,
            );
          });
        })
        .filter((course) => isEligible(course, completed, []).status === "eligible")
        .filter((course) => {
          const observed = typicalTerms(history[course.code] ?? []);
          return observed.length === 0 || observed.some((item) => item.season === term.season);
        })
        .sort((a, b) => {
          const first = reasons.get(a.code)!;
          const second = reasons.get(b.code)!;
          return first.priority - second.priority || a.code.localeCompare(b.code);
        });
      const selected: CourseCode[] = [];
      const rationale: Record<CourseCode, string> = {};
      const usedByRequirement = new Map<string, number>();
      let credits = 0;
      const courseDetails = Object.fromEntries(courses.map((course) => [course.code, course]));
      for (const course of ranked) {
        const reason = reasons.get(course.code)!;
        const used = usedByRequirement.get(reason.requirementId) ?? 0;
        const contribution = reason.priority === 2 ? course.credits.max : 1;
        if (used >= reason.limit || credits + course.credits.max > creditLimit) continue;
        const proposed = [...selected, course.code];
        const validation = validatePlan(
          { creditLimit, terms: [{ ...term, courses: proposed }], courseDetails },
          completed,
        );
        if (!validation.valid) continue;
        selected.push(course.code);
        usedByRequirement.set(reason.requirementId, used + contribution);
        credits += course.credits.max;
        rationale[course.code] = `Meets ${reason.label}; prerequisites satisfied${
          typicalTerms(history[course.code] ?? []).length
            ? `; offered in ${term.season} before`
            : ""
        }.`;
      }
      return { courses: selected, rationale };
    },
  };
}

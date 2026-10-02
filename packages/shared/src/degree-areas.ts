import type { DegreeEvaluation, EvaluatedRequirement } from "./evaluate-requirements.js";
import type { CourseRef } from "./requirements.js";

export interface AreaCreditSlot {
  category: string;
  requiredCredits: number;
  fulfilledCredits: number;
  completed: CourseRef[];
  eligibleCourses: CourseRef[];
}

export interface AreaChoice {
  n: number;
  remaining: number;
  options: CourseRef[];
}

export interface CourseAreaProgress {
  area: string;
  unit: "courses";
  required: number;
  fulfilled: number;
  status: "satisfied" | "partially_satisfied" | "unsatisfied";
  completed: CourseRef[];
  remaining: CourseRef[];
  choices: AreaChoice[];
}

export interface CreditAreaProgress {
  area: string;
  unit: "credits";
  required: number;
  fulfilled: number;
  status: "satisfied" | "partially_satisfied" | "unsatisfied";
  slots: AreaCreditSlot[];
}

export type AreaProgress = CourseAreaProgress | CreditAreaProgress;

function progressStatus(fulfilled: number, required: number): AreaProgress["status"] {
  if (fulfilled >= required) return "satisfied";
  return fulfilled > 0 ? "partially_satisfied" : "unsatisfied";
}

/** Group evaluated degree requirements into first-seen audit areas. */
export function groupRequirementsByArea(evaluation: DegreeEvaluation): AreaProgress[] {
  const byArea = new Map<string, EvaluatedRequirement[]>();
  for (const requirement of evaluation.requirements) {
    const areaRequirements = byArea.get(requirement.area);
    if (areaRequirements) areaRequirements.push(requirement);
    else byArea.set(requirement.area, [requirement]);
  }

  const areas: AreaProgress[] = [];
  for (const [area, requirements] of byArea) {
    if (requirements[0]?.kind === "creditBucket") {
      const slotsByCategory = new Map<string, AreaCreditSlot>();
      let required = 0;
      let fulfilled = 0;
      for (const requirement of requirements) {
        if (requirement.kind !== "creditBucket") continue;
        const fulfilledCredits = Math.min(requirement.fulfilledCredits, requirement.credits);
        required += requirement.credits;
        fulfilled += fulfilledCredits;
        let slot = slotsByCategory.get(requirement.category);
        if (!slot) {
          slot = {
            category: requirement.category,
            requiredCredits: 0,
            fulfilledCredits: 0,
            completed: [],
            eligibleCourses: [],
          };
          slotsByCategory.set(requirement.category, slot);
        }
        slot.requiredCredits += requirement.credits;
        slot.fulfilledCredits += fulfilledCredits;
        slot.completed.push(...requirement.fulfilledCourses);
        for (const course of requirement.eligibleCourses) {
          if (!slot.eligibleCourses.some((item) => item.code === course.code))
            slot.eligibleCourses.push(course);
        }
      }
      areas.push({
        area,
        unit: "credits",
        required,
        fulfilled,
        status: progressStatus(fulfilled, required),
        slots: [...slotsByCategory.values()],
      });
      continue;
    }

    let required = 0;
    let fulfilled = 0;
    const completed: CourseRef[] = [];
    const remaining: CourseRef[] = [];
    const choices: AreaChoice[] = [];
    for (const requirement of requirements) {
      if (requirement.kind === "fixed") {
        required += requirement.courses.length;
        fulfilled += requirement.fulfilledCourses.length;
        completed.push(...requirement.fulfilledCourses);
        remaining.push(...requirement.missingCourses);
      } else if (requirement.kind === "chooseN") {
        const count = Math.min(requirement.fulfilledOptions.length, requirement.n);
        required += requirement.n;
        fulfilled += count;
        completed.push(...requirement.fulfilledOptions.slice(0, requirement.n));
        if (requirement.missingCount > 0) {
          const completedCodes = new Set(requirement.fulfilledOptions.map((course) => course.code));
          choices.push({
            n: requirement.n,
            remaining: requirement.missingCount,
            options: requirement.options.filter((course) => !completedCodes.has(course.code)),
          });
        }
      }
    }
    areas.push({
      area,
      unit: "courses",
      required,
      fulfilled,
      status: progressStatus(fulfilled, required),
      completed,
      remaining,
      choices,
    });
  }
  return areas;
}

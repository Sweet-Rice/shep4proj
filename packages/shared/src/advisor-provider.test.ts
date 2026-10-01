import { describe, expect, it } from "vitest";
import { createRuleBasedAdvisorProvider, type AdvisorContext } from "./advisor-provider.js";
import type { DegreeProgram } from "./requirements.js";
import { validatePlan, type PlanCourse } from "./validate-plan.js";

const degree: DegreeProgram = {
  id: "sample",
  program: "Computer Science, B.S.",
  concentration: "Software Engineering",
  catalogYear: "2026-2027",
  totalCredits: 120,
  source: "https://example.edu/catalog",
  requirements: [
    {
      kind: "fixed",
      id: "core",
      label: "Core courses",
      semester: 1,
      courses: [
        { code: "CSC 1350", minGrade: null },
        { code: "CSC 1351", minGrade: null },
      ],
    },
    {
      kind: "chooseN",
      id: "elective",
      label: "One elective",
      semester: 2,
      n: 1,
      options: [
        { code: "CSC 2200", minGrade: null },
        { code: "CSC 2201", minGrade: null },
      ],
    },
  ],
};

function course(code: string, credits: number, prerequisite?: string): PlanCourse {
  return {
    code,
    credits: { min: credits, max: credits, note: null },
    prereq: {
      tree: prerequisite
        ? { type: "COURSE", code: prerequisite, coreq: false, minGrade: null }
        : null,
      needsReview: false,
    },
  };
}

const courses = [
  course("CSC 1350", 4),
  course("CSC 1351", 4, "CSC 1350"),
  course("CSC 2200", 3),
  course("CSC 2201", 3),
];

function context(overrides: Partial<AdvisorContext> = {}): AdvisorContext {
  return {
    degree,
    completed: [],
    courses,
    term: { season: "Fall", year: 2027 },
    creditLimit: 7,
    ...overrides,
  };
}

describe("rule-based advisor", () => {
  const advisor = createRuleBasedAdvisorProvider();

  it("prioritizes required courses, respects prerequisites and credit limit", async () => {
    const input = context();
    const suggestion = await advisor.suggest(input);

    expect(suggestion.courses).toEqual(["CSC 1350", "CSC 2200"]);
    expect(suggestion.rationale["CSC 1350"]).toContain("Core courses");
    expect(suggestion.rationale["CSC 2200"]).toContain("One elective");
    expect(
      validatePlan(
        {
          creditLimit: input.creditLimit,
          terms: [{ ...input.term, courses: suggestion.courses }],
          courseDetails: Object.fromEntries(input.courses.map((item) => [item.code, item])),
        },
        input.completed,
      ).valid,
    ).toBe(true);
  });

  it("avoids a course with an observed history outside the target season", async () => {
    const suggestion = await advisor.suggest(
      context({
        completed: ["CSC 1350"],
        history: {
          "CSC 1351": [{ term: "LSUAM_SPRING_2026", sectionCount: 2 }],
          "CSC 2200": [{ term: "LSUAM_FALL_2026", sectionCount: 1 }],
        },
      }),
    );

    expect(suggestion.courses).toEqual(["CSC 2200"]);
    expect(suggestion.rationale["CSC 2200"]).toContain("offered in Fall before");
  });

  it("does not suggest courses whose prerequisites need manual review", async () => {
    const cautiousCourses = courses.map((item) =>
      item.code === "CSC 1350" ? { ...item, prereq: { tree: null, needsReview: true } } : item,
    );
    expect((await advisor.suggest(context({ courses: cautiousCourses }))).courses).toEqual([
      "CSC 2200",
    ]);
  });
});

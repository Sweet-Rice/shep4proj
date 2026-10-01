import { describe, expect, it, vi } from "vitest";
import { createPlannerTools } from "./planner-tools.js";
import type { Course } from "./course.js";
import type { DegreeProgram } from "./requirements.js";
import type { ValidationPlan } from "./validate-plan.js";

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
  ],
};

describe("createPlannerTools", () => {
  it("calls each query through one facade", async () => {
    const completed = vi.fn().mockResolvedValue(["CSC 1350"]);
    const history = vi.fn().mockResolvedValue([{ term: "LSUAM_FALL_2025", sectionCount: 2 }]);
    const tools = createPlannerTools({ getCompleted: completed, getHistory: history });

    expect(await tools.getCompleted()).toEqual(["CSC 1350"]);
    expect(completed).toHaveBeenCalledOnce();

    const requirements = tools.getRemainingRequirements(degree, ["CSC 1350"]);
    expect(requirements.requirements).toHaveLength(1);
    expect(requirements.remainingRequirements.map((item) => item.id)).toEqual(["core"]);
    expect(
      tools.getRemainingRequirements(degree, ["CSC 1350", "CSC 1351"]).remainingRequirements,
    ).toEqual([]);

    const eligibility = tools.getEligible(
      [
        {
          code: "CSC 1351",
          prereq: {
            tree: { type: "COURSE", code: "CSC 1350", coreq: false, minGrade: null },
            needsReview: false,
          },
        },
        { code: "CSC 3102", prereq: { tree: null, needsReview: true } },
      ],
      ["CSC 1350"],
    );
    expect(eligibility.map((item) => item.result.status)).toEqual(["eligible", "needs_review"]);

    expect(await tools.getHistory("CSC 1350")).toEqual([
      { term: "LSUAM_FALL_2025", sectionCount: 2 },
    ]);
    expect(history).toHaveBeenCalledWith("CSC 1350");

    const plan: ValidationPlan = {
      creditLimit: 19,
      terms: [{ season: "Fall", year: 2027, courses: ["CSC 1350"] }],
      courseDetails: {
        "CSC 1350": {
          code: "CSC 1350",
          credits: { min: 4, max: 4, note: null },
          prereq: { tree: null, needsReview: false },
        },
      },
    };
    expect(tools.validatePlan(plan, []).valid).toBe(true);
  });

  it("counts a corequisite planned for the same term toward eligibility", () => {
    const tools = createPlannerTools();
    const course = {
      code: "CSC 3102",
      prereq: {
        tree: { type: "COURSE", code: "CSC 2259", coreq: true, minGrade: null },
        needsReview: false,
      },
    } as const;

    expect(tools.getEligible([course], [])[0]?.result.status).toBe("ineligible");
    expect(tools.getEligible([course], [], ["CSC 2259"])[0]?.result.status).toBe("eligible");
  });

  it("evaluates requirement credits from the supplied catalog", () => {
    const tools = createPlannerTools();
    const catalog: Course[] = [
      {
        catalogYear: "2026-2027",
        code: "CSC 1350",
        title: "Computer Science I for Majors",
        credits: { min: 4, max: 4, note: null },
        description: "Fundamentals of programming.",
        prerequisiteText: null,
      },
    ];

    expect(tools.getRemainingRequirements(degree, ["CSC 1350"]).totalCreditsFulfilled).toBe(3);
    expect(
      tools.getRemainingRequirements(degree, ["CSC 1350"], catalog).totalCreditsFulfilled,
    ).toBe(4);
  });

  it("asks the history source for the requested course", async () => {
    const history = vi.fn().mockResolvedValue([]);
    const tools = createPlannerTools({ getHistory: history });

    await tools.getHistory("CSC 3102");
    expect(history).toHaveBeenCalledWith("CSC 3102");
  });

  it("rejects unconfigured data sources instead of returning empty data", async () => {
    const tools = createPlannerTools();
    await expect(tools.getCompleted()).rejects.toThrow("completed-course source is not configured");
    await expect(tools.getHistory("CSC 1350")).rejects.toThrow(
      "course-history source is not configured",
    );
  });
});

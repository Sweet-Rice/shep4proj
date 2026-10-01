import { describe, expect, it } from "vitest";
import type { CourseCode } from "./course-code.js";
import type { PrereqNode } from "./prereq.js";
import { validatePlan, type PlanCourse, type ValidationPlan } from "./validate-plan.js";

const course = (code: CourseCode, credits: number, tree: PrereqNode | null = null): PlanCourse => ({
  code,
  credits: { min: credits, max: credits, note: null },
  prereq: { tree, needsReview: false },
});
const requirement = (code: CourseCode, coreq = false): PrereqNode => ({
  type: "COURSE",
  code,
  coreq,
  minGrade: null,
});

const details: ValidationPlan["courseDetails"] = {
  "CSC 1350": course("CSC 1350", 4),
  "CSC 1351": course("CSC 1351", 4, requirement("CSC 1350")),
  "MATH 1550": course("MATH 1550", 5),
  "CSC 2259": course("CSC 2259", 3, requirement("MATH 1550", true)),
};
const term = (season: "Spring" | "Fall", year: number, ...courses: CourseCode[]) => ({
  season,
  year,
  courses,
});

describe("validatePlan", () => {
  it("checks prerequisites in calendar order, even if the saved terms are rearranged", () => {
    const plan: ValidationPlan = {
      creditLimit: 19,
      terms: [term("Fall", 2027, "CSC 1351"), term("Spring", 2027, "CSC 1350")],
      courseDetails: details,
    };
    expect(validatePlan(plan, []).issues).toEqual([]);
    plan.terms[0]!.courses = ["CSC 1350"];
    plan.terms[1]!.courses = ["CSC 1351"];
    expect(validatePlan(plan, []).issues).toMatchObject([
      {
        type: "prerequisite",
        courseCode: "CSC 1351",
        missingPrerequisites: ["CSC 1350 completed"],
      },
    ]);
  });

  it("allows a completed prerequisite and an explicit same-term corequisite", () => {
    const plan: ValidationPlan = {
      creditLimit: 19,
      terms: [term("Spring", 2027, "CSC 1351", "CSC 2259", "MATH 1550")],
      courseDetails: details,
    };
    expect(validatePlan(plan, ["CSC 1350"]).valid).toBe(true);
  });

  it("reports overloads and missing catalog data", () => {
    const plan: ValidationPlan = {
      creditLimit: 8,
      terms: [term("Spring", 2027, "CSC 1350", "MATH 1550", "ENGL 1001")],
      courseDetails: details,
    };
    expect(validatePlan(plan, []).issues).toMatchObject([
      { type: "missing_course", courseCode: "ENGL 1001" },
      { type: "credit_limit", credits: 9, creditLimit: 8 },
    ]);
  });

  it("reports manual review as a warning without claiming the plan is invalid", () => {
    const plan: ValidationPlan = {
      creditLimit: 19,
      terms: [term("Spring", 2027, "CSC 1351")],
      courseDetails: {
        ...details,
        "CSC 1351": {
          ...details["CSC 1351"]!,
          prereq: { tree: null, needsReview: true },
        },
      },
    };
    expect(validatePlan(plan, [])).toMatchObject({
      valid: true,
      issues: [{ type: "prerequisite_warning", courseCode: "CSC 1351" }],
    });
  });
});

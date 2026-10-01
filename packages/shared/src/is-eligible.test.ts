import { describe, expect, it } from "vitest";
import { isEligible, type EligibilityCourse } from "./is-eligible.js";
import type { PrereqNode } from "./prereq.js";

const leaf = (code: string, coreq = false, minGrade: "C" | null = null): PrereqNode => ({
  type: "COURSE",
  code,
  coreq,
  minGrade,
});

const course = (tree: PrereqNode | null, needsReview = false): EligibilityCourse => ({
  code: "CSC 3102",
  prereq: { tree, needsReview },
});

describe("isEligible", () => {
  it("accepts a course without prerequisites", () => {
    expect(isEligible(course(null), [], [])).toEqual({
      eligible: true,
      status: "eligible",
      missingPrerequisites: [],
    });
  });

  it("requires every AND child and reports only the missing ones", () => {
    const tree: PrereqNode = {
      type: "AND",
      children: [leaf("CSC 1350"), leaf("MATH 1550")],
    };
    expect(isEligible(course(tree), new Set(["CSC 1350"]), [])).toEqual({
      eligible: false,
      status: "ineligible",
      missingPrerequisites: ["MATH 1550 completed"],
    });
    expect(isEligible(course(tree), ["CSC 1350", "MATH 1550"], []).eligible).toBe(true);
  });

  it("accepts any OR alternative, including an alternative inside an AND", () => {
    const tree: PrereqNode = {
      type: "AND",
      children: [
        leaf("CSC 1350"),
        { type: "OR", children: [leaf("MATH 1550"), leaf("MATH 1551")] },
      ],
    };
    expect(isEligible(course(tree), ["CSC 1350", "MATH 1551"], []).eligible).toBe(true);
    expect(isEligible(course(tree), ["CSC 1350"], [])).toEqual({
      eligible: false,
      status: "ineligible",
      missingPrerequisites: ["One of: MATH 1550 completed; or MATH 1551 completed"],
    });
  });

  it("counts a same-term course only when the leaf allows a corequisite", () => {
    expect(isEligible(course(leaf("CSC 1350", true)), [], ["CSC 1350"]).eligible).toBe(true);
    expect(isEligible(course(leaf("CSC 1350")), [], ["CSC 1350"])).toEqual({
      eligible: false,
      status: "ineligible",
      missingPrerequisites: ["CSC 1350 completed"],
    });
  });

  it("checks recorded minimum grades and does not assume an unknown grade passes", () => {
    const required = course(leaf("CSC 1350", false, "C"));
    expect(isEligible(required, [{ code: "CSC 1350", grade: "B" }], []).eligible).toBe(true);
    expect(isEligible(required, [{ code: "CSC 1350", grade: "D" }], []).eligible).toBe(false);
    expect(
      isEligible(
        required,
        [
          { code: "CSC 1350", grade: "B" },
          { code: "CSC 1350", grade: "D" },
        ],
        [],
      ).eligible,
    ).toBe(true);
    expect(isEligible(required, ["CSC 1350"], []).missingPrerequisites).toEqual([
      "CSC 1350 with a recorded grade of C or better",
    ]);
  });

  it("returns a warning instead of an ineligible verdict for unreviewed text", () => {
    expect(isEligible(course(null, true), [], [])).toEqual({
      eligible: null,
      status: "needs_review",
      missingPrerequisites: [],
      warning: "Prerequisites need manual review; check the catalog before enrolling.",
    });
  });
});

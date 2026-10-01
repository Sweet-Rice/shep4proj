import { describe, expect, it } from "vitest";
import type { PrereqNode } from "./prereq.js";
import { collectPrereqCourseCodes, getUnfulfilledPrereqs } from "./prereq-utils.js";

const sampleTree: PrereqNode = {
  type: "AND",
  children: [
    { type: "COURSE", code: "CSC 1350", coreq: false, minGrade: "C" },
    { type: "COURSE", code: "MATH 1550", coreq: false, minGrade: null },
  ],
};

describe("prereq-utils", () => {
  it("collects course codes from a PrereqNode tree", () => {
    const codes = collectPrereqCourseCodes(sampleTree);
    expect(codes).toEqual(["CSC 1350", "MATH 1550"]);
  });

  it("returns unfulfilled prerequisites for a course given completed set", () => {
    const completed = new Set(["CSC 1350"]);
    const unfulfilled = getUnfulfilledPrereqs(sampleTree, "CSC 1351", completed);

    expect(unfulfilled).toEqual(["MATH 1550"]);
  });

  it("returns empty array when all prerequisites are already completed", () => {
    const completed = new Set(["CSC 1350", "MATH 1550"]);
    const unfulfilled = getUnfulfilledPrereqs(sampleTree, "CSC 1351", completed);

    expect(unfulfilled).toEqual([]);
  });
});

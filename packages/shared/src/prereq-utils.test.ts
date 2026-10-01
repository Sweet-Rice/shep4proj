import { describe, expect, it } from "vitest";
import type { PrereqNode } from "./prereq.js";
import { collectPrereqCourseCodes, getRequiredUnmetPrereqs } from "./prereq-utils.js";

const course = (code: "CSC 1350" | "CSC 1351" | "CSC 2250" | "CSC 3102" | "CSC 3380") =>
  ({ type: "COURSE", code, coreq: false, minGrade: null }) as const;

describe("prereq-utils", () => {
  it("collects course codes from a prerequisite tree", () => {
    const tree: PrereqNode = {
      type: "AND",
      children: [course("CSC 1350"), course("CSC 1351")],
    };
    expect(collectPrereqCourseCodes(tree)).toEqual(["CSC 1350", "CSC 1351"]);
  });

  it("returns unmet leaves in an AND", () => {
    const tree: PrereqNode = {
      type: "AND",
      children: [course("CSC 1350"), course("CSC 1351")],
    };
    expect(getRequiredUnmetPrereqs(tree, new Set(["CSC 1350"]))).toEqual(["CSC 1351"]);
  });

  it("skips an OR subtree inside an AND", () => {
    const tree: PrereqNode = {
      type: "AND",
      children: [
        course("CSC 1350"),
        { type: "OR", children: [course("CSC 1351"), course("CSC 2250")] },
      ],
    };
    expect(getRequiredUnmetPrereqs(tree, new Set())).toEqual(["CSC 1350"]);
  });

  it("returns no suggestions for a pure OR", () => {
    const tree: PrereqNode = {
      type: "OR",
      children: [course("CSC 1350"), course("CSC 1351")],
    };
    expect(getRequiredUnmetPrereqs(tree, new Set())).toEqual([]);
  });

  it("filters completed leaves and deduplicates in first-seen order", () => {
    const tree: PrereqNode = {
      type: "AND",
      children: [
        course("CSC 1350"),
        course("CSC 3102"),
        { type: "AND", children: [course("CSC 3380"), course("CSC 3102")] },
      ],
    };
    expect(getRequiredUnmetPrereqs(tree, new Set(["CSC 1350"]))).toEqual(["CSC 3102", "CSC 3380"]);
  });

  it("returns no suggestions for a null tree", () => {
    expect(getRequiredUnmetPrereqs(null, new Set())).toEqual([]);
  });
});

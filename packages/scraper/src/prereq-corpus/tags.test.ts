import { describe, expect, it } from "vitest";
import { suggestPrereqTags } from "./tags.js";

describe("suggestPrereqTags fixture courses", () => {
  it("parses CSC 1350: coreq wording, or-list, and non-csc course codes", () => {
    const text =
      "credit or registration in MATH 1022 or MATH 1023 or MATH 1550 or MATH 1551 or MATH 1552.";
    expect(suggestPrereqTags(text)).toEqual(["or-list", "coreq", "non-csc"]);
  });

  it("parses CSC 2700: or-list and non-course permission alternative", () => {
    const text = "CSC 1254 or CSC 1351 or permission of department.";
    expect(suggestPrereqTags(text)).toEqual(["or-list", "non-course"]);
  });

  it("parses CSC 3102: mixed and/or with coreq and non-csc course code", () => {
    const text = "CSC 1254 or CSC 1351 and credit or concurrent enrollment in CSC 2259 or EE 2741.";
    expect(suggestPrereqTags(text)).toEqual(["mixed-and-or", "coreq", "non-csc"]);
  });

  it("parses CSC 3200: or-list in semicolon-separated group with non-csc codes", () => {
    const text = "ENGL 1005 or ENGL 2000 or HNRS 2000; CSC 3102.";
    expect(suggestPrereqTags(text)).toEqual(["or-list", "semicolon-groups", "non-csc"]);
  });

  it("parses CSC 4330: comma-separated and-list of CSC courses", () => {
    const text = "CSC 3102, CSC 3380.";
    expect(suggestPrereqTags(text)).toEqual(["and-list"]);
  });
});

describe("suggestPrereqTags unit rules", () => {
  it("tags single course prerequisite", () => {
    expect(suggestPrereqTags("CSC 1350.")).toEqual(["single"]);
    expect(suggestPrereqTags("  CSC 1254  ")).toEqual(["single"]);
  });

  it("tags min-grade requirement", () => {
    expect(suggestPrereqTags('grade of "C" in CSC 1350')).toEqual(["single", "min-grade"]);
    expect(suggestPrereqTags("grade of C in CSC 1350")).toEqual(["single", "min-grade"]);
    expect(suggestPrereqTags("“C” or better in CSC 1350")).toEqual(["or-list", "min-grade"]);
  });

  it("tags empty or unclassified text as other", () => {
    expect(suggestPrereqTags("")).toEqual(["other"]);
    expect(suggestPrereqTags("   ")).toEqual(["other"]);
    expect(suggestPrereqTags("None.")).toEqual(["other"]);
  });

  it("handles case-insensitivity in course codes and keywords", () => {
    expect(suggestPrereqTags("csc 1350")).toEqual(["single"]);
    expect(suggestPrereqTags("CREDIT OR REGISTRATION IN math 1550 OR math 1551")).toEqual([
      "or-list",
      "coreq",
      "non-csc",
    ]);
    expect(suggestPrereqTags("PERMISSION OF DEPARTMENT")).toEqual(["non-course"]);
  });
});

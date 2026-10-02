import { describe, expect, it } from "vitest";
import type { CourseDetail } from "@jevschedule/shared";
import { describeReviewReason } from "./reviewReason.js";

const record = (prerequisiteText: string | null, reviewReason: string | null): CourseDetail => ({
  catalogYear: "2026-2027",
  code: "CSC 3102",
  title: "Advanced Data Structures",
  credits: { min: 3, max: 3, note: null },
  description: "Advanced Data Structures",
  prerequisiteText,
  prereq: { tree: null, needsReview: true, reviewReason, notes: [] },
});

describe("describeReviewReason", () => {
  it("explains an unparseable prerequisite with the original catalog text", () => {
    expect(
      describeReviewReason(
        record("permission of instructor", "unrecognized-token: permission of instructor"),
      ),
    ).toBe("Prerequisite text couldn't be read: permission of instructor");
  });

  it("explains a mix of and/or that could mean more than one thing", () => {
    expect(
      describeReviewReason(
        record(
          "ANTH 1001 or ANTH 1003 and ANTH 2015",
          "ambiguous-and-or: ANTH 1001 or ANTH 1003 and ANTH 2015",
        ),
      ),
    ).toBe(
      'Prerequisite text mixes "and" and "or" in a way that could mean more than one thing: ANTH 1001 or ANTH 1003 and ANTH 2015',
    );
  });

  it("falls back to a plain message for parser errors and unknown reasons", () => {
    for (const reason of ["parser-error: Unexpected end", "something-new: x", "empty: none"]) {
      const text = describeReviewReason(record("CSC 1350 or so", reason));
      expect(text).toBe("Prerequisite text couldn't be read: CSC 1350 or so");
      expect(text).not.toMatch(/parser-error|something-new|empty:/);
    }
  });

  it("still explains the problem when the original text is missing", () => {
    expect(describeReviewReason(record(null, "unrecognized-token: x"))).toBe(
      "Prerequisite text couldn't be read. Check the catalog for the requirements.",
    );
  });
});

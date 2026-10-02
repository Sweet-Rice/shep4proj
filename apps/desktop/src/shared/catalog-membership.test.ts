import { describe, expect, it } from "vitest";
import {
  NOT_IN_CATALOG_REASON,
  restrictReviewToCatalog,
  type WorkdayImportReview,
} from "./catalog-membership.js";

describe("restrictReviewToCatalog", () => {
  it("filters completed and in-progress courses and deduplicates skipped codes", () => {
    const review: WorkdayImportReview = {
      completed: ["CSC 1350", "MATH 9999"],
      inProgress: [
        { season: "Fall", year: 2026, courses: ["CSC 4330", "MATH 9999"] },
        { season: "Spring", year: 2027, courses: ["ENGL 9999"] },
      ],
      skipped: [
        { code: "HIST 9999", reason: 'grade "W" does not earn credit' },
        { code: "HIST 9999", reason: 'grade "W" does not earn credit' },
      ],
    };

    expect(restrictReviewToCatalog(review, new Set(["CSC 1350", "CSC 4330"]))).toEqual({
      completed: ["CSC 1350"],
      inProgress: [{ season: "Fall", year: 2026, courses: ["CSC 4330"] }],
      skipped: [
        { code: "HIST 9999", reason: 'grade "W" does not earn credit' },
        { code: "MATH 9999", reason: NOT_IN_CATALOG_REASON },
        { code: "ENGL 9999", reason: NOT_IN_CATALOG_REASON },
      ],
    });
  });
});

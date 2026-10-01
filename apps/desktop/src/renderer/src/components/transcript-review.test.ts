import { describe, expect, it } from "vitest";
import { toTranscriptReview } from "./transcript-review.js";

describe("toTranscriptReview", () => {
  it("keeps completed courses and flags catalog-incompatible codes", () => {
    expect(
      toTranscriptReview({
        courses: [
          { code: "CSC 1350", term: { season: "Fall", year: 2024 }, grade: "A-" },
          { code: "CSC 1350", term: { season: "Fall", year: 2024 }, grade: "A-" },
          { code: "CSC 4103G", term: { season: "Spring", year: 2026 }, grade: "A" },
          { code: "CSC 4562", term: { season: "Fall", year: 2026 }, grade: "Withdrawal" },
          { code: "MATH 1021", term: null, grade: "Pass" },
        ],
        unrecognizedLines: [{ code: "EE 2741", pageNumber: 2, reason: "grade missing" }],
      }),
    ).toEqual({
      parsedCourses: [
        { code: "CSC 1350", term: "Fall 2024", grade: "A-", selected: true },
        { code: "MATH 1021", term: "Credit by exam", grade: "Pass", selected: true },
      ],
      unrecognizedLines: [
        "EE 2741 (page 2: grade missing)",
        "CSC 4103G (catalog course code not supported)",
      ],
    });
  });
});

import { describe, expect, it } from "vitest";
import { toTranscriptReview } from "./transcript-review.js";

describe("toTranscriptReview", () => {
  it("keeps catalog courses and flags malformed or absent catalog rows", () => {
    expect(
      toTranscriptReview(
        {
          courses: [
            { code: "CSC 1350", term: { season: "Fall", year: 2024 }, grade: "A-" },
            { code: "CSC 1350", term: { season: "Fall", year: 2024 }, grade: "A-" },
            { code: "CSC 4103G", term: { season: "Spring", year: 2026 }, grade: "A" },
            { code: "CSC 4103GGG", term: { season: "Spring", year: 2026 }, grade: "A" },
            { code: "CSC 4562", term: { season: "Fall", year: 2026 }, grade: "Withdrawal" },
            { code: "CSC 4103G", term: { season: "Spring", year: 2026 }, grade: " W " },
            { code: "CSC 4103", term: { season: "Spring", year: 2026 }, grade: "" },
            { code: "MATH 1021", term: null, grade: "Pass" },
          ],
          unrecognizedLines: [{ code: "EE 2741", pageNumber: 2, reason: "grade missing" }],
        },
        new Set(["CSC 1350", "CSC 4103"]),
      ),
    ).toEqual({
      parsedCourses: [
        { code: "CSC 1350", term: "Fall 2024", grade: "A-", selected: true },
        { code: "CSC 4103", term: "Spring 2026", grade: "A", selected: true },
      ],
      unrecognizedLines: [
        "EE 2741 (page 2: grade missing)",
        "CSC 4103GGG (unrecognized course code format)",
        'CSC 4562 — grade "Withdrawal" does not earn credit',
        'CSC 4103 — grade "W" does not earn credit',
        "MATH 1021 — not in the LSU course catalog",
      ],
    });
  });
});

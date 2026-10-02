// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Course, DegreeEvaluation } from "@jevschedule/shared";
import { useCreditHourTotals } from "./useCreditHourTotals.js";

const sampleEvaluation: DegreeEvaluation = {
  degreeId: "csc-se-2026",
  isSatisfied: false,
  totalCreditsRequired: 120,
  totalCreditsFulfilled: 9,
  unusedCompletedCourses: [],
  requirements: [
    {
      kind: "fixed",
      id: "req-fixed",
      label: "Core CSC",
      semester: 1,
      courses: [
        { code: "CSC 1350", minGrade: null },
        { code: "CSC 1351", minGrade: "C" },
      ],
      isSatisfied: false,
      status: "unsatisfied",
      fulfilledCourses: [{ code: "CSC 1350", minGrade: null }],
      missingCourses: [{ code: "CSC 1351", minGrade: "C" }],
    },
    {
      kind: "creditBucket",
      id: "req-bucket",
      label: "Natural Sciences",
      semester: 2,
      credits: 6,
      category: "Science",
      eligibleCourses: [{ code: "BIOL 1001", minGrade: null }],
      isSatisfied: false,
      status: "partially_satisfied",
      fulfilledCredits: 3,
      fulfilledCourses: [{ code: "BIOL 1001", minGrade: null }],
    },
  ],
};

const catalog: Course[] = [
  {
    code: "CSC 1350",
    title: "Computer Science I",
    credits: { min: 4, max: 4, note: null },
    catalogYear: "2026-2027",
    description: "Intro",
    prerequisiteText: null,
  },
];

describe("useCreditHourTotals", () => {
  it("returns null when evaluation is null", () => {
    const { result } = renderHook(() => useCreditHourTotals(null));
    expect(result.current).toBeNull();
  });

  it("calculates overall and bucket credit hour totals accurately", () => {
    const { result } = renderHook(() => useCreditHourTotals(sampleEvaluation));

    expect(result.current).not.toBeNull();
    expect(result.current?.overall).toEqual({
      requiredCredits: 120,
      fulfilledCredits: 9,
      remainingCredits: 111,
      percentage: 8,
      isSatisfied: false,
    });

    expect(result.current?.buckets).toHaveLength(2);

    expect(result.current?.buckets[0]).toEqual({
      id: "req-fixed",
      label: "Core CSC",
      kind: "fixed",
      category: undefined,
      requiredCredits: 6,
      fulfilledCredits: 3,
      remainingCredits: 3,
      isSatisfied: false,
    });

    expect(result.current?.buckets[1]).toEqual({
      id: "req-bucket",
      label: "Natural Sciences",
      kind: "creditBucket",
      category: "Science",
      requiredCredits: 6,
      fulfilledCredits: 3,
      remainingCredits: 3,
      isSatisfied: false,
    });
  });

  it("recomputes fixed-course hours when catalog metadata arrives or becomes unavailable", () => {
    const { result, rerender } = renderHook(
      ({ courses }) => useCreditHourTotals(sampleEvaluation, courses),
      { initialProps: { courses: undefined as Course[] | undefined } },
    );
    expect(result.current?.buckets[0]).toMatchObject({
      requiredCredits: 6,
      fulfilledCredits: 3,
      remainingCredits: 3,
    });

    rerender({ courses: catalog });
    expect(result.current?.buckets[0]).toMatchObject({
      requiredCredits: 7,
      fulfilledCredits: 4,
      remainingCredits: 3,
    });

    rerender({ courses: undefined });
    expect(result.current?.buckets[0]).toMatchObject({
      requiredCredits: 6,
      fulfilledCredits: 3,
      remainingCredits: 3,
    });
  });
});

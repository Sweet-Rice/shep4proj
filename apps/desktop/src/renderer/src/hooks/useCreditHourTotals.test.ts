// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { DegreeEvaluation } from "@jevschedule/shared";
import { useCreditHourTotals } from "./useCreditHourTotals.js";

const evaluation: DegreeEvaluation = {
  degreeId: "csc-se-2026",
  isSatisfied: false,
  totalCreditsRequired: 120,
  totalCreditsFulfilled: 9,
  unusedCompletedCourses: [],
  requirements: [],
};

describe("useCreditHourTotals", () => {
  it("returns null when evaluation is null", () => {
    const { result } = renderHook(() => useCreditHourTotals(null));
    expect(result.current).toBeNull();
  });

  it("calculates overall totals from the evaluation", () => {
    const { result } = renderHook(() => useCreditHourTotals(evaluation));
    expect(result.current?.overall).toEqual({
      requiredCredits: 120,
      fulfilledCredits: 9,
      remainingCredits: 111,
      percentage: 8,
      isSatisfied: false,
    });
  });
});

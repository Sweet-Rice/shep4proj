// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { DegreeEvaluation } from "@jevschedule/shared";
import { CreditHourTotalsView } from "./CreditHourTotalsView.js";

const sampleEvaluation: DegreeEvaluation = {
  degreeId: "csc-se-2026",
  isSatisfied: false,
  totalCreditsRequired: 120,
  totalCreditsFulfilled: 9,
  unusedCompletedCourses: [],
  requirements: [
    {
      kind: "fixed",
      id: "req-core",
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
      id: "req-sci",
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

describe("CreditHourTotalsView", () => {
  afterEach(() => {
    cleanup();
  });

  it("returns null when evaluation is null", () => {
    const { container } = render(<CreditHourTotalsView evaluation={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders overall credit totals and per-bucket totals matching expectations", () => {
    render(<CreditHourTotalsView evaluation={sampleEvaluation} />);

    expect(screen.getByTestId("overall-fulfilled")).toHaveTextContent("9 hrs");
    expect(screen.getByTestId("overall-remaining")).toHaveTextContent("111 hrs");
    expect(screen.getByTestId("overall-required")).toHaveTextContent("120 hrs");

    expect(screen.getByTestId("bucket-progress-req-core")).toHaveTextContent("3 / 6 credits");
    expect(screen.getByTestId("bucket-remaining-req-core")).toHaveTextContent("3 credits left");

    expect(screen.getByTestId("bucket-progress-req-sci")).toHaveTextContent("3 / 6 credits");
    expect(screen.getByTestId("bucket-remaining-req-sci")).toHaveTextContent("3 credits left");
  });
});

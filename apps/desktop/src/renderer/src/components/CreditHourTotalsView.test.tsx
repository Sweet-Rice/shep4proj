// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { DegreeEvaluation } from "@jevschedule/shared";
import { CreditHourTotalsView } from "./CreditHourTotalsView.js";

const evaluation: DegreeEvaluation = {
  degreeId: "csc-se-2026",
  isSatisfied: false,
  totalCreditsRequired: 120,
  totalCreditsFulfilled: 9,
  unusedCompletedCourses: [],
  requirements: [],
};

describe("CreditHourTotalsView", () => {
  afterEach(() => cleanup());

  it("returns null when evaluation is null", () => {
    const { container } = render(<CreditHourTotalsView evaluation={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders only the overall credit totals", () => {
    render(<CreditHourTotalsView evaluation={evaluation} />);
    expect(screen.getByTestId("overall-fulfilled")).toHaveTextContent("9 hrs");
    expect(screen.getByTestId("overall-remaining")).toHaveTextContent("111 hrs");
    expect(screen.getByTestId("overall-required")).toHaveTextContent("120 hrs");
    expect(screen.queryByTestId("bucket-totals-grid")).not.toBeInTheDocument();
  });
});

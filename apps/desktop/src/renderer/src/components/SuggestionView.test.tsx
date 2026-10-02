// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { SuggestionView, type CourseSuggestion } from "./SuggestionView.js";
const suggestionsFixture: CourseSuggestion[] = [
  {
    code: "CSC 1351",
    title: "Computer Science II for Majors",
    rationale: "Core requirement following CSC 1350 completion.",
    status: "valid",
  },
  {
    code: "MATH 1552",
    title: "Analytic Geometry and Calculus II",
    rationale: "Prerequisite for upper-level CSC courses.",
    status: "valid",
  },
  {
    code: "CSC 3102",
    title: "Advanced Data Structures",
    rationale: "Core computer science algorithm course.",
    status: "invalid",
    validationReason: "Prerequisite CSC 2250 is not yet completed.",
  },
];

describe("SuggestionView", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders list of AI course suggestions with rationale and validation status", () => {
    render(<SuggestionView onAcceptCourse={vi.fn()} suggestions={suggestionsFixture} />);

    expect(screen.getByTestId("suggestion-view")).toBeInTheDocument();
    expect(screen.getByText("AI Advisor Course Suggestions")).toBeInTheDocument();

    expect(screen.getByTestId("suggestion-card-CSC 1351")).toBeInTheDocument();
    expect(screen.getByTestId("status-badge-CSC 1351")).toHaveTextContent("Eligible");

    expect(screen.getByTestId("suggestion-card-CSC 3102")).toBeInTheDocument();
    expect(screen.getByTestId("status-badge-CSC 3102")).toHaveTextContent("Ineligible");
    expect(screen.getByTestId("validation-reason-CSC 3102")).toHaveTextContent(
      "Prerequisite CSC 2250 is not yet completed.",
    );
  });

  it("accepts an eligible course into the plan when Accept is clicked", async () => {
    const user = userEvent.setup();
    const handleAccept = vi.fn();

    render(<SuggestionView onAcceptCourse={handleAccept} suggestions={suggestionsFixture} />);

    const acceptBtn = screen.getByTestId("accept-course-CSC 1351");
    expect(acceptBtn).not.toBeDisabled();

    await user.click(acceptBtn);

    expect(handleAccept).toHaveBeenCalledWith("CSC 1351");
    expect(acceptBtn).toHaveTextContent("Added to Plan");
    expect(acceptBtn).toBeDisabled();
  });

  it("disables Accept button for ineligible suggestions", () => {
    render(<SuggestionView onAcceptCourse={vi.fn()} suggestions={suggestionsFixture} />);

    const acceptIneligibleBtn = screen.getByTestId("accept-course-CSC 3102");
    expect(acceptIneligibleBtn).toBeDisabled();
  });

  it("removes a suggestion when Reject is clicked", async () => {
    const user = userEvent.setup();
    const handleReject = vi.fn();

    render(
      <SuggestionView
        onAcceptCourse={vi.fn()}
        onRejectCourse={handleReject}
        suggestions={suggestionsFixture}
      />,
    );

    const rejectBtn = screen.getByTestId("reject-course-MATH 1552");
    await user.click(rejectBtn);

    expect(handleReject).toHaveBeenCalledWith("MATH 1552");
    expect(screen.queryByTestId("suggestion-card-MATH 1552")).not.toBeInTheDocument();
  });
});

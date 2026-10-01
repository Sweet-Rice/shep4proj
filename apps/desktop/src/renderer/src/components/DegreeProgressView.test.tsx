// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import type { CourseCode, DegreeProgram } from "@jevschedule/shared";
import { DegreeProgressView } from "./DegreeProgressView.js";

const sampleDegree: DegreeProgram = {
  id: "csc-se-2026",
  program: "Computer Science, B.S.",
  concentration: "Software Engineering",
  catalogYear: "2026-2027",
  totalCredits: 120,
  source: "https://example.com",
  requirements: [
    {
      kind: "fixed",
      id: "req-fixed",
      label: "Core CSC Courses",
      semester: 1,
      courses: [
        { code: "CSC 1350", minGrade: null },
        { code: "CSC 1351", minGrade: "C" },
      ],
    },
    {
      kind: "chooseN",
      id: "req-choose",
      label: "English Elective",
      semester: 2,
      n: 1,
      options: [
        { code: "ENGL 1001", minGrade: null },
        { code: "ENGL 2000", minGrade: null },
      ],
    },
  ],
};

function InteractiveDegreeProgressWrapper({
  initialCompleted = [],
}: {
  initialCompleted?: CourseCode[];
}) {
  const [completed, setCompleted] = useState<Set<CourseCode>>(new Set(initialCompleted));

  const handleToggle = (code: CourseCode) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  return (
    <DegreeProgressView degree={sampleDegree} completed={completed} onToggleCourse={handleToggle} />
  );
}

describe("DegreeProgressView", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders degree title and initial unsatisfied progress state", () => {
    render(<InteractiveDegreeProgressWrapper initialCompleted={[]} />);

    expect(screen.getByText("Computer Science, B.S.")).toBeInTheDocument();
    expect(screen.getByTestId("overall-status")).toHaveTextContent("In Progress");
    expect(screen.getByTestId("req-status-req-fixed")).toHaveTextContent("Unsatisfied");
    expect(screen.getByTestId("req-status-req-choose")).toHaveTextContent("Unsatisfied");
  });

  it("updates progress and requirement status immediately on course toggle without reload", async () => {
    const user = userEvent.setup();
    render(<InteractiveDegreeProgressWrapper initialCompleted={[]} />);

    // Initially 0 credits
    expect(screen.getByTestId("credits-summary")).toHaveTextContent("0 / 120 credits (0%)");

    // Toggle CSC 1350
    const checkbox1350 = screen.getByRole("checkbox", { name: /CSC 1350/i });
    await user.click(checkbox1350);

    // Immediately recomputes credits and status without reload
    expect(screen.getByTestId("credits-summary")).toHaveTextContent("3 / 120 credits (3%)");
    expect(screen.getByTestId("req-status-req-fixed")).toHaveTextContent("Unsatisfied");

    // Toggle CSC 1351
    const checkbox1351 = screen.getByRole("checkbox", { name: /CSC 1351/i });
    await user.click(checkbox1351);

    // Fixed requirement becomes satisfied immediately
    expect(screen.getByTestId("req-status-req-fixed")).toHaveTextContent("Satisfied");
    expect(screen.getByTestId("credits-summary")).toHaveTextContent("6 / 120 credits (5%)");

    // Toggle ENGL 1001 to satisfy Choose N requirement
    const checkboxEngl = screen.getByRole("checkbox", { name: /ENGL 1001/i });
    await user.click(checkboxEngl);

    expect(screen.getByTestId("req-status-req-choose")).toHaveTextContent("Satisfied");
    expect(screen.getByTestId("credits-summary")).toHaveTextContent("9 / 120 credits (8%)");
  });
});

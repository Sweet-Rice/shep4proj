// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import type { Course, CourseCode, DegreeProgram } from "@jevschedule/shared";
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

const catalog: Course[] = [
  {
    code: "CSC 1350",
    title: "Computer Science I",
    credits: { min: 4, max: 4, note: null },
    catalogYear: "2026-2027",
    description: "Intro",
    prerequisiteText: null,
  },
  {
    code: "CSC 1351",
    title: "Computer Science II",
    credits: { min: 3, max: 3, note: null },
    catalogYear: "2026-2027",
    description: "Intro",
    prerequisiteText: null,
  },
];

function InteractiveDegreeProgressWrapper({
  initialCompleted = [],
}: {
  initialCompleted?: CourseCode[];
}) {
  const [completed, setCompleted] = useState<Set<CourseCode>>(new Set(initialCompleted));
  const handleToggle = (code: CourseCode) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  return (
    <DegreeProgressView
      degree={sampleDegree}
      completed={completed}
      catalog={catalog}
      onToggleCourse={handleToggle}
    />
  );
}

describe("DegreeProgressView", () => {
  afterEach(() => cleanup());

  it("renders degree title, credit totals, and initial unsatisfied progress state", () => {
    render(<InteractiveDegreeProgressWrapper initialCompleted={[]} />);
    expect(screen.getByText("Computer Science, B.S.")).toBeInTheDocument();
    expect(screen.getByTestId("overall-status")).toHaveTextContent("In Progress");
    expect(screen.getByTestId("req-status-req-fixed")).toHaveTextContent("Unsatisfied");
    expect(screen.getByTestId("req-status-req-choose")).toHaveTextContent("Unsatisfied");
    expect(screen.getByText("Credit-Hour Summary")).toBeInTheDocument();
    expect(screen.getByTestId("bucket-remaining-req-fixed")).toHaveTextContent("6 credits left");
    expect(screen.getByTestId("overall-remaining")).toHaveTextContent("120 hrs");
  });

  it("updates requirement status and visible credit totals immediately when courses change", async () => {
    const user = userEvent.setup();
    render(<InteractiveDegreeProgressWrapper initialCompleted={[]} />);
    expect(screen.getByTestId("credits-summary")).toHaveTextContent("0 / 120 credits (0%)");
    expect(screen.getByTestId("bucket-progress-req-fixed")).toHaveTextContent("0 / 6 credits");

    await user.click(screen.getByRole("checkbox", { name: /CSC 1350/i }));
    expect(screen.getByTestId("credits-summary")).toHaveTextContent("4 / 120 credits (3%)");
    expect(screen.getByTestId("bucket-progress-req-fixed")).toHaveTextContent("3 / 6 credits");
    expect(screen.getByTestId("bucket-remaining-req-fixed")).toHaveTextContent("3 credits left");
    expect(screen.getByTestId("overall-fulfilled")).toHaveTextContent("4 hrs");
    expect(screen.getByTestId("req-status-req-fixed")).toHaveTextContent("Partially Satisfied");

    await user.click(screen.getByRole("checkbox", { name: /CSC 1351/i }));
    expect(screen.getByTestId("req-status-req-fixed")).toHaveTextContent(/^Satisfied$/);
    expect(screen.getByTestId("bucket-progress-req-fixed")).toHaveTextContent("6 / 6 credits");
    expect(screen.getByTestId("bucket-remaining-req-fixed")).toHaveTextContent("0 credits left");
    expect(screen.getByTestId("credits-summary")).toHaveTextContent("7 / 120 credits (6%)");
  });
});

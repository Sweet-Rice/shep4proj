// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
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
      area: "Computer Science",
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
      area: "English Composition",
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
  const handleToggle = (code: CourseCode) =>
    setCompleted((previous) => {
      const next = new Set(previous);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
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

  it("groups area cards in first appearance order and shows progress counts", () => {
    render(<InteractiveDegreeProgressWrapper />);
    expect(screen.getByText("Computer Science, B.S.")).toBeInTheDocument();
    expect(screen.getByTestId("overall-status")).toHaveTextContent("In Progress");
    expect(screen.getByTestId("area-computer-science")).toHaveTextContent("0 of 2 courses");
    expect(screen.getByTestId("area-english-composition")).toHaveTextContent("0 of 1 courses");
    expect(screen.getAllByRole("progressbar")).toHaveLength(3);
    expect(screen.queryByText(/Semester/i)).not.toBeInTheDocument();
    expect(screen.getByText("Credit-Hour Summary")).toBeInTheDocument();
  });

  it("expands completed and still-required lists and updates area and overall progress when toggled", async () => {
    const user = userEvent.setup();
    render(<InteractiveDegreeProgressWrapper />);
    const area = screen.getByTestId("area-computer-science");
    await user.click(within(area).getByText("Computer Science"));
    expect(within(area).getByRole("heading", { name: "Completed" })).toBeInTheDocument();
    expect(within(area).getByRole("heading", { name: "Still required" })).toBeInTheDocument();
    const areaProgress = within(area).getByRole("progressbar", {
      name: "Computer Science progress",
    });
    const overallProgress = screen.getByRole("progressbar", { name: "Overall degree progress" });
    expect(areaProgress).toHaveAttribute("aria-valuenow", "0");
    const overallBefore = Number(overallProgress.getAttribute("aria-valuenow"));
    await user.click(within(area).getByRole("checkbox", { name: "CSC 1350" }));
    expect(areaProgress).toHaveAttribute("aria-valuenow", "50");
    expect(
      within(area).getByRole("heading", { name: "Completed" }).parentElement,
    ).toHaveTextContent("CSC 1350");
    expect(Number(overallProgress.getAttribute("aria-valuenow"))).toBeGreaterThan(overallBefore);
  });
});

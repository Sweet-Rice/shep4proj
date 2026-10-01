// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { Plan } from "@jevschedule/shared";
import { SemesterBoard } from "./SemesterBoard.js";

const samplePlan: Plan = {
  creditLimit: 12,
  terms: [
    { season: "Fall", year: 2026, courses: ["CSC 1350", "MATH 1550"] },
    { season: "Spring", year: 2027, courses: ["CSC 1351"] },
  ],
};

describe("SemesterBoard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders semester terms and course cards", () => {
    render(<SemesterBoard plan={samplePlan} onMoveCourse={vi.fn()} />);

    expect(screen.getByText("Fall 2026")).toBeInTheDocument();
    expect(screen.getByText("Spring 2027")).toBeInTheDocument();
    expect(screen.getByTestId("course-card-CSC 1350")).toBeInTheDocument();
    expect(screen.getByTestId("course-card-CSC 1351")).toBeInTheDocument();
  });

  it("moves course between terms when Move buttons are clicked", async () => {
    const user = userEvent.setup();
    const handleMove = vi.fn();

    render(<SemesterBoard plan={samplePlan} onMoveCourse={handleMove} />);

    // Click "Move →" on CSC 1350 in Fall 2026
    const moveRightBtn = screen.getByRole("button", {
      name: /Move CSC 1350 right/i,
    });
    await user.click(moveRightBtn);

    expect(handleMove).toHaveBeenCalledWith(0, 0, 1, 1);
  });

  it("handles HTML5 drag and drop between terms", () => {
    const handleMove = vi.fn();

    render(<SemesterBoard plan={samplePlan} onMoveCourse={handleMove} />);

    const courseCard = screen.getByTestId("course-card-CSC 1350");
    const targetTerm = screen.getByTestId("term-column-1");

    // Simulate drag start
    fireEvent.dragStart(courseCard, {
      dataTransfer: {
        setData: vi.fn(),
        effectAllowed: "move",
      },
    });

    // Simulate drop on Spring 2027 term
    fireEvent.drop(targetTerm, {
      dataTransfer: {
        getData: () =>
          JSON.stringify({
            sourceTermIndex: 0,
            sourceCourseIndex: 0,
            code: "CSC 1350",
          }),
      },
    });

    expect(handleMove).toHaveBeenCalledWith(0, 0, 1, 1);
  });

  it("calls onAddTerm when add term form is submitted", async () => {
    const user = userEvent.setup();
    const handleAddTerm = vi.fn();

    render(<SemesterBoard plan={samplePlan} onMoveCourse={vi.fn()} onAddTerm={handleAddTerm} />);

    const addTermBtn = screen.getByTestId("add-term-btn");
    await user.click(addTermBtn);

    expect(handleAddTerm).toHaveBeenCalledWith("Fall", 2027);
  });
});

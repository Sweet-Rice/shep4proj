// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ImportReviewScreen, type TranscriptParseResult } from "./ImportReviewScreen.js";
const reviewFixture: TranscriptParseResult = {
  parsedCourses: [
    { code: "CSC 1350", term: "Fall 2024", grade: "A", selected: true },
    { code: "MATH 1550", term: "Fall 2024", grade: "B+", selected: true },
    { code: "ENGL 1001", term: "Fall 2024", grade: "A-", selected: true },
    { code: "CSC 1351", term: "Spring 2025", grade: "B", selected: true },
  ],
  unrecognizedLines: [
    "PHYS 1000 - In Progress",
    "TOTAL CREDITS EARNED: 14.0",
    "CUMULATIVE GPA: 3.65",
  ],
};

const mockSet = vi.fn();

interface JevScheduleGlobal {
  window: {
    jevschedule?: {
      completed: {
        set: typeof mockSet;
      };
    };
  };
}

describe("ImportReviewScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSet.mockResolvedValue(undefined);

    (globalThis as unknown as JevScheduleGlobal).window.jevschedule = {
      completed: {
        set: mockSet,
      },
    };
  });

  afterEach(() => {
    cleanup();
    delete (globalThis as unknown as JevScheduleGlobal).window.jevschedule;
  });

  it("renders checklist of parsed courses and unrecognized lines", () => {
    render(<ImportReviewScreen parseResult={reviewFixture} />);

    expect(screen.getByTestId("import-review-screen")).toBeInTheDocument();
    expect(screen.getByText("Review Imported Courses")).toBeInTheDocument();

    expect(screen.getByText("CSC 1350")).toBeInTheDocument();
    expect(screen.getByText("MATH 1550")).toBeInTheDocument();
    expect(screen.getByText("PHYS 1000 - In Progress")).toBeInTheDocument();
    expect(screen.getByText("TOTAL CREDITS EARNED: 14.0")).toBeInTheDocument();
  });

  it("allows selecting and deselecting all courses", async () => {
    const user = userEvent.setup();
    render(<ImportReviewScreen parseResult={reviewFixture} />);

    const deselectBtn = screen.getByTestId("deselect-all-btn");
    await user.click(deselectBtn);

    expect(screen.getByText("Parsed Courses (0 / 4 selected)")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-import-btn")).toBeDisabled();

    const selectAllBtn = screen.getByTestId("select-all-btn");
    await user.click(selectAllBtn);

    expect(screen.getByText("Parsed Courses (4 / 4 selected)")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-import-btn")).not.toBeDisabled();
  });

  it("saves selected courses to local store on confirm", async () => {
    const user = userEvent.setup();
    const handleConfirm = vi.fn();

    render(<ImportReviewScreen parseResult={reviewFixture} onConfirm={handleConfirm} />);

    const confirmBtn = screen.getByTestId("confirm-import-btn");
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith("CSC 1350", true);
      expect(mockSet).toHaveBeenCalledWith("MATH 1550", true);
      expect(mockSet).toHaveBeenCalledWith("ENGL 1001", true);
      expect(mockSet).toHaveBeenCalledWith("CSC 1351", true);
    });

    expect(handleConfirm).toHaveBeenCalledWith(["CSC 1350", "MATH 1550", "ENGL 1001", "CSC 1351"]);
  });
});

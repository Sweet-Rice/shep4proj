// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { DegreeProgressScreen } from "./DegreeProgressScreen.js";

const mockGet = vi.fn();
const mockSet = vi.fn();

interface JevScheduleGlobal {
  window: {
    jevschedule?: {
      completed: {
        get: typeof mockGet;
        set: typeof mockSet;
      };
    };
  };
}

describe("DegreeProgressScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSet.mockResolvedValue(undefined);

    (globalThis as unknown as JevScheduleGlobal).window.jevschedule = {
      completed: {
        get: mockGet,
        set: mockSet,
      },
    };
  });

  afterEach(() => {
    cleanup();
    delete (globalThis as unknown as JevScheduleGlobal).window.jevschedule;
  });

  it("renders sample degree data and shows loading state initially", async () => {
    mockGet.mockResolvedValueOnce(["CSC 1350"]);

    render(<DegreeProgressScreen />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading degree progress…");

    await waitFor(() => {
      expect(screen.getByText("Computer Science, B.S.")).toBeInTheDocument();
    });

    expect(screen.getByText("Software Engineering (2026-2027)")).toBeInTheDocument();
    expect(screen.getByText("Semester 1 Core Courses")).toBeInTheDocument();
  });

  it("allows toggling courses directly on the progress screen", async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValueOnce(["CSC 1350"]);

    render(<DegreeProgressScreen />);

    await waitFor(() => {
      expect(screen.getByText("Computer Science, B.S.")).toBeInTheDocument();
    });

    const checkbox1351 = screen.getByRole("checkbox", { name: /CSC 1351/i });
    expect(checkbox1351).not.toBeChecked();

    await user.click(checkbox1351);

    expect(checkbox1351).toBeChecked();
    expect(mockSet).toHaveBeenCalledWith("CSC 1351", true);
  });
});

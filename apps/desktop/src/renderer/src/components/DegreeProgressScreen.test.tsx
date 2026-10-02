// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoredAcademicProgress } from "../../../shared/ipc.js";
import { DegreeProgressScreen } from "./DegreeProgressScreen.js";

vi.mock("../hooks/useDegree.js", () => ({
  useDegree: () => ({
    degree: {
      id: "csc-se-2026",
      program: "Computer Science, B.S.",
      concentration: "Software Engineering",
      catalogYear: "2026-2027",
      totalCredits: 120,
      source: "https://example.test",
      requirements: [],
    },
    loading: false,
    error: null,
  }),
}));
vi.mock("../hooks/useCatalog.js", () => ({
  useCatalogCourses: () => ({ courses: [], error: null, loading: false }),
}));
vi.mock("../hooks/useCompletedCourses.js", () => ({
  useCompletedCourses: () => ({
    completed: new Set(),
    loaded: true,
    loading: false,
    error: null,
    toggleCourse: vi.fn(),
  }),
}));

const audit: StoredAcademicProgress = {
  importedAt: "2026-10-02T13:40:00.000Z",
  result: {
    overall: { definedCredits: 120, inProgressCredits: 3, satisfyingCredits: 90, remainingCredits: 30, status: "In Progress" },
    requirements: [{
      name: "Core Writing",
      status: "satisfied",
      statusText: "Satisfied",
      remaining: "0",
      satisfiedWith: [{ code: "ENGL 1001", text: "ENGL 1001 - English Composition", academicPeriod: "Fall Semester 2025", creditHours: 3 }],
    }],
    unrecognizedRows: [],
  },
};

function setStoredAudit(value: StoredAcademicProgress | null | Error) {
  const getAudit = value instanceof Error
    ? vi.fn().mockRejectedValue(value)
    : vi.fn().mockResolvedValue(value);
  Object.defineProperty(window, "jevschedule", {
    configurable: true,
    value: { academicProgress: { getAudit } },
  });
}

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "jevschedule", { configurable: true, value: undefined });
});

describe("DegreeProgressScreen Workday audit selection", () => {
  it("shows the stored Workday audit and can switch to the catalog plan", async () => {
    const user = userEvent.setup();
    setStoredAudit(audit);
    render(<DegreeProgressScreen />);

    expect(await screen.findByTestId("workday-academic-progress")).toBeInTheDocument();
    expect(screen.getByText(/From Workday · imported/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Catalog plan (2026-2027 Software Engineering)" }));
    expect(screen.queryByTestId("workday-academic-progress")).not.toBeInTheDocument();
    expect(screen.getByTestId("overall-status")).toBeInTheDocument();
  });

  it("shows the catalog plan and Workday prompt when no audit is stored", async () => {
    setStoredAudit(null);
    render(<DegreeProgressScreen />);

    expect(await screen.findByText("Import from Workday to see your official degree audit.")).toBeInTheDocument();
    expect(screen.getByTestId("overall-status")).toBeInTheDocument();
  });

  it("keeps the catalog plan available when loading the audit fails", async () => {
    setStoredAudit(new Error("local store unavailable"));
    render(<DegreeProgressScreen />);

    expect(await screen.findByText("Import from Workday to see your official degree audit.")).toBeInTheDocument();
    expect(screen.getByTestId("overall-status")).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import type { StoredAcademicProgress } from "../../../shared/ipc.js";
import { WorkdayAcademicProgressView } from "./WorkdayAcademicProgressView.js";

const audit: StoredAcademicProgress = {
  importedAt: "2026-10-02T13:40:00.000Z",
  result: {
    overall: {
      definedCredits: 120,
      inProgressCredits: 3,
      satisfyingCredits: 90,
      remainingCredits: 30,
      status: "In Progress",
    },
    requirements: [
      {
        name: "Core Writing",
        status: "satisfied",
        statusText: "Satisfied",
        remaining: "0",
        satisfiedWith: [
          {
            code: "ENGL 1001",
            text: "ENGL 1001 - English Composition",
            academicPeriod: "Fall Semester 2025",
            creditHours: 3,
          },
        ],
      },
    ],
    unrecognizedRows: [],
  },
};

afterEach(() => cleanup());

describe("WorkdayAcademicProgressView", () => {
  it("shows imported date, overall progress, requirement status, and satisfying courses", async () => {
    const user = userEvent.setup();
    render(<WorkdayAcademicProgressView audit={audit} />);

    expect(screen.getByText(/From Workday · imported/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Workday satisfying credits" })).toHaveAttribute(
      "aria-valuenow",
      "75",
    );
    const requirement = screen.getByTestId("workday-requirement-0");
    expect(within(requirement).getByText("Satisfied")).toBeInTheDocument();
    await user.click(within(requirement).getByText("Core Writing"));
    expect(within(requirement).getByText(/English Composition/)).toBeInTheDocument();
    expect(within(requirement).getByText(/Fall Semester 2025/)).toBeInTheDocument();
  });
});

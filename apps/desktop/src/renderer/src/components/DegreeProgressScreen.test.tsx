// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { Course, DegreeProgram, DegreeSummary } from "@jevschedule/shared";
import { DegreeProgressScreen } from "./DegreeProgressScreen.js";

const sampleDegree: DegreeProgram = {
  id: "csc-software-engineering-2026-2027",
  program: "Computer Science, B.S.",
  concentration: "Software Engineering",
  catalogYear: "2026-2027",
  totalCredits: 120,
  source: "https://example.com",
  requirements: [
    {
      kind: "fixed",
      id: "sem-1-courses",
      area: "Computer Science",
      label: "Semester 1 Core Courses",
      semester: 1,
      courses: [
        { code: "CSC 1350", minGrade: "C" },
        { code: "MATH 1550", minGrade: "C" },
      ],
    },
    {
      kind: "creditBucket",
      id: "gened-humanities",
      area: "Humanities",
      label: "General Education Humanities",
      semester: 3,
      credits: 6,
      category: "Humanities",
      eligibleCourses: [{ code: "HIST 1001", minGrade: null }],
    },
  ],
};
const summary: DegreeSummary = {
  id: sampleDegree.id,
  program: sampleDegree.program,
  concentration: sampleDegree.concentration,
  catalogYear: sampleDegree.catalogYear,
  totalCredits: sampleDegree.totalCredits,
};
const catalog: Course[] = [
  {
    code: "CSC 1350",
    title: "Computer Science I",
    credits: { min: 3, max: 3, note: null },
    catalogYear: "2026-2027",
    description: "Introductory course",
    prerequisiteText: null,
  },
];

const mockCompletedGet = vi.fn();
const mockCompletedSet = vi.fn();
const mockListDegrees = vi.fn();
const mockGetDegree = vi.fn();
const mockListCourses = vi.fn();

describe("DegreeProgressScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompletedGet.mockResolvedValue([]);
    mockCompletedSet.mockResolvedValue(undefined);
    mockListDegrees.mockResolvedValue([summary]);
    mockGetDegree.mockResolvedValue(sampleDegree);
    mockListCourses.mockResolvedValue(catalog);
    Object.assign(window, {
      jevschedule: {
        completed: { get: mockCompletedGet, set: mockCompletedSet },
        catalog: {
          listDegrees: mockListDegrees,
          getDegree: mockGetDegree,
          listCourses: mockListCourses,
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "jevschedule");
  });

  it("loads the server degree and shows its requirements", async () => {
    render(<DegreeProgressScreen />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading degree progress…");
    await waitFor(() => expect(screen.getByText("Computer Science, B.S.")).toBeInTheDocument());
    expect(mockListDegrees).toHaveBeenCalledOnce();
    expect(mockGetDegree).toHaveBeenCalledWith(summary.id);
    expect(screen.getByText("Software Engineering (2026-2027)")).toBeInTheDocument();
    expect(screen.getByTestId("area-computer-science")).toHaveTextContent("0 of 2 courses");
  });

  it("allows toggling courses in an expanded area", async () => {
    const user = userEvent.setup();
    render(<DegreeProgressScreen />);
    const area = await screen.findByTestId("area-computer-science");
    await user.click(within(area).getByText("Computer Science"));
    const checkbox = within(area).getByRole("checkbox", { name: /CSC 1350/i });
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(mockCompletedSet).toHaveBeenCalledWith("CSC 1350", true);
  });

  it("shows an actionable error when no degree is available", async () => {
    mockListDegrees.mockResolvedValue([]);
    render(<DegreeProgressScreen />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load the degree program from the server. Start it with pnpm dev and reopen this tab.",
    );
    expect(screen.queryByText("Computer Science, B.S.")).not.toBeInTheDocument();
  });

  it("keeps the overall credit summary when catalog loading fails", async () => {
    mockListCourses.mockRejectedValue(new Error("offline"));
    render(<DegreeProgressScreen />);
    expect(await screen.findByText("Credit-Hour Summary")).toBeInTheDocument();
    expect(screen.getByTestId("overall-required")).toHaveTextContent("120 hrs");
  });
});

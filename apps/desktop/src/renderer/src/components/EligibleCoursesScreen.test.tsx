// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { Course, CourseCode, CourseDetail } from "@jevschedule/shared";
import type { JevscheduleApi } from "../../../shared/ipc.js";
import { EligibleCoursesScreen } from "./EligibleCoursesScreen.js";

const mockCompletedGet = vi.fn<() => Promise<CourseCode[]>>();
const mockListCourses = vi.fn<() => Promise<Course[]>>();
const mockCourseDetails =
  vi.fn<(codes: CourseCode[]) => Promise<Record<CourseCode, CourseDetail>>>();

const course = (code: CourseCode, title: string, credits = 3): Course => ({
  catalogYear: "2026-2027",
  code,
  title,
  credits: { min: credits, max: credits, note: null },
  description: title,
  prerequisiteText: null,
});

const DETAILS: Record<CourseCode, CourseDetail> = {
  "CSC 1350": {
    ...course("CSC 1350", "Computer Science I for Majors", 4),
    prereq: { tree: null, needsReview: false, reviewReason: null, notes: [] },
  },
  "CSC 2700": {
    ...course("CSC 2700", "Special Topics in Computer Science"),
    prereq: { tree: null, needsReview: false, reviewReason: null, notes: [] },
  },
  "CSC 3102": {
    ...course("CSC 3102", "Advanced Data Structures"),
    prerequisiteText: "written consent of instructor",
    prereq: {
      tree: null,
      needsReview: true,
      reviewReason: "unrecognized-token: written consent of instructor",
      notes: [],
    },
  },
  "CSC 4330": {
    ...course("CSC 4330", "Software Systems Development"),
    prereq: {
      tree: {
        type: "AND",
        children: [
          { type: "COURSE", code: "CSC 3102", coreq: false, minGrade: null },
          { type: "COURSE", code: "CSC 3380", coreq: false, minGrade: null },
        ],
      },
      needsReview: false,
      reviewReason: null,
      notes: [],
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCompletedGet.mockResolvedValue([]);
  mockListCourses.mockResolvedValue(
    ["CSC 4330", "CSC 3102", "CSC 2700", "CSC 1350"].map((code) => DETAILS[code]!),
  );
  // Reverse the requested order: the screen must sort, not rely on the response order.
  mockCourseDetails.mockImplementation(async (codes) =>
    Object.fromEntries(
      [...codes].reverse().flatMap((code) => (DETAILS[code] ? [[code, DETAILS[code]]] : [])),
    ),
  );
  Object.assign(window, {
    jevschedule: {
      completed: { get: mockCompletedGet, set: async () => {} },
      plan: { get: async () => null, save: async () => {} },
      transcript: { select: async () => null },
      catalog: {
        listCourses: mockListCourses,
        getCourseDetails: mockCourseDetails,
        getCourseHistory: async () => [],
        listDegrees: async () => [],
        getDegree: async () => {
          throw new Error("none");
        },
      },
    } as unknown as JevscheduleApi,
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "jevschedule");
});

const section = (name: RegExp) => screen.getByRole("region", { name });

describe("EligibleCoursesScreen", () => {
  it("sorts each course into Eligible now, Needs review, or Blocked", async () => {
    render(<EligibleCoursesScreen />);

    expect(screen.getByRole("status")).toHaveTextContent("Checking eligibility…");
    const eligible = await screen.findByRole("region", { name: "Eligible now (2)" });
    expect(
      within(eligible)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "CSC 1350 Computer Science I for Majors 4 cr",
      "CSC 2700 Special Topics in Computer Science 3 cr",
    ]);

    const review = section(/^Needs review \(1\)$/);
    expect(within(review).getByText("CSC 3102")).toBeInTheDocument();
    expect(within(review).getByRole("note")).toHaveTextContent(
      "Prerequisites need manual review; check the catalog before enrolling.",
    );
    expect(
      within(review).getByText("Prerequisite text couldn't be read: written consent of instructor"),
    ).toBeInTheDocument();
    expect(within(review).queryByText(/unrecognized-token/)).not.toBeInTheDocument();

    const blocked = section(/^Blocked \(1\)$/);
    expect(within(blocked).getByText("CSC 4330")).toBeInTheDocument();
  });

  it("hides missing prerequisites until Why blocked? is expanded", async () => {
    const user = userEvent.setup();
    render(<EligibleCoursesScreen />);

    const button = await screen.findByRole("button", { name: "Why blocked?" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("list", { name: "Missing prerequisites for CSC 4330" }),
    ).not.toBeInTheDocument();

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const missing = screen.getByRole("list", { name: "Missing prerequisites for CSC 4330" });
    expect(button).toHaveAttribute("aria-controls", missing.id);
    expect(
      within(missing)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["CSC 3102 completed", "CSC 3380 completed"]);

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("list", { name: "Missing prerequisites for CSC 4330" }),
    ).not.toBeInTheDocument();
  });

  it("omits completed courses and courses without details", async () => {
    mockCompletedGet.mockResolvedValue(["CSC 2700"]);
    mockListCourses.mockResolvedValue([
      DETAILS["CSC 1350"]!,
      DETAILS["CSC 2700"]!,
      course("CSC 4999", "Retired Course"),
    ]);
    render(<EligibleCoursesScreen />);

    const eligible = await screen.findByRole("region", { name: "Eligible now (1)" });
    expect(within(eligible).getByText("CSC 1350")).toBeInTheDocument();
    expect(screen.queryByText("CSC 2700")).not.toBeInTheDocument();
    expect(screen.queryByText("CSC 4999")).not.toBeInTheDocument();
    expect(mockCourseDetails).toHaveBeenCalledWith(["CSC 1350", "CSC 4999"]);
  });

  it("shows the first 25 courses of a long list and reveals the rest on request", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 80 }, (_, i) => {
      const code = `MATH ${1000 + i}`;
      return { ...course(code, `Topic ${i}`), prereq: DETAILS["CSC 1350"]!.prereq };
    });
    mockListCourses.mockResolvedValue(many);
    mockCourseDetails.mockImplementation(async (codes) =>
      Object.fromEntries(many.filter((c) => codes.includes(c.code)).map((c) => [c.code, c])),
    );
    render(<EligibleCoursesScreen />);

    const eligible = await screen.findByRole("region", { name: "Eligible now (80)" });
    expect(within(eligible).getAllByRole("listitem")).toHaveLength(25);
    await user.click(within(eligible).getByRole("button", { name: "Show more (55 remaining)" }));
    expect(within(eligible).getAllByRole("listitem")).toHaveLength(75);
    await user.click(within(eligible).getByRole("button", { name: "Show more (5 remaining)" }));
    expect(within(eligible).getAllByRole("listitem")).toHaveLength(80);
    expect(within(eligible).queryByRole("button", { name: /Show more/ })).not.toBeInTheDocument();
  });

  it("shows a count tile per group that scrolls to its section", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<EligibleCoursesScreen />);

    const tiles = await screen.findByLabelText("Eligibility summary");
    expect(within(tiles).getByRole("button", { name: /2\s*Eligible now/i })).toBeInTheDocument();
    expect(within(tiles).getByRole("button", { name: /1\s*Needs review/i })).toBeInTheDocument();
    await user.click(within(tiles).getByRole("button", { name: /1\s*Blocked/i }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById("blocked-heading"));
  });

  it("keeps a course blocked by an uncompleted corequisite, since no term is planned here", async () => {
    const user = userEvent.setup();
    const withCoreq: CourseDetail = {
      ...course("CSC 2259", "Discrete Structures"),
      prereq: {
        tree: { type: "COURSE", code: "CSC 1350", coreq: true, minGrade: null },
        needsReview: false,
        reviewReason: null,
        notes: [],
      },
    };
    mockListCourses.mockResolvedValue([DETAILS["CSC 1350"]!, withCoreq]);
    mockCourseDetails.mockImplementation(async (codes) =>
      Object.fromEntries(
        codes.map((code) => [code, code === "CSC 2259" ? withCoreq : DETAILS[code]!]),
      ),
    );
    render(<EligibleCoursesScreen />);

    const blocked = await screen.findByRole("region", { name: "Blocked (1)" });
    expect(within(blocked).getByText("CSC 2259")).toBeInTheDocument();
    await user.click(within(blocked).getByRole("button", { name: "Why blocked?" }));
    expect(
      screen.getByRole("list", { name: "Missing prerequisites for CSC 2259" }),
    ).toHaveTextContent("CSC 1350 completed or planned in the same term");
  });

  it("shows an alert instead of loading forever when completed courses cannot be read", async () => {
    mockCompletedGet.mockRejectedValue(new Error("store unavailable"));
    render(<EligibleCoursesScreen />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load or update completed courses. Please try again.",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("shows the server alert when the catalog cannot be loaded", async () => {
    mockListCourses.mockRejectedValue(new Error("offline"));
    render(<EligibleCoursesScreen />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't reach the JevSchedule server. It may be waking up, which can take up to a minute. Try again.",
    );
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("shows the server alert when course details cannot be loaded", async () => {
    mockCourseDetails.mockRejectedValue(new Error("offline"));
    render(<EligibleCoursesScreen />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't reach the JevSchedule server. It may be waking up, which can take up to a minute. Try again.",
    );
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});

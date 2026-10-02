// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type {
  Course,
  CourseCode,
  CourseDetail,
  CourseOfferingHistory,
  Plan,
} from "@jevschedule/shared";
import type { JevscheduleApi } from "../../../shared/ipc.js";
import { PlanScreen } from "./PlanScreen.js";

const mockPlanGet = vi.fn<() => Promise<Plan | null>>();
const mockPlanSave = vi.fn<(plan: Plan) => Promise<void>>();
const mockCompletedGet = vi.fn<() => Promise<CourseCode[]>>();
const mockCatalogList = vi.fn<() => Promise<Course[]>>();
const mockCourseDetails =
  vi.fn<(codes: CourseCode[]) => Promise<Record<CourseCode, CourseDetail>>>();
const mockCourseHistory = vi.fn<(code: CourseCode) => Promise<CourseOfferingHistory[]>>();
const course = (code: CourseCode, title: string, credits = 3): Course => ({
  catalogYear: "2026-2027",
  code,
  title,
  credits: { min: credits, max: credits, note: null },
  description: title,
  prerequisiteText: null,
});
const detailsFor = (code: CourseCode, prereqTree: CourseDetail["prereq"]["tree"] = null) => ({
  ...course(
    code,
    code === "CSC 4330" ? "Software Systems Development" : "Data Structures",
    code === "CSC 4330" ? 4 : 3,
  ),
  prereq: { tree: prereqTree, needsReview: false, reviewReason: null, notes: [] },
});
const emptyPlan: Plan = { creditLimit: 19, terms: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mockPlanGet.mockResolvedValue(emptyPlan);
  mockPlanSave.mockResolvedValue(undefined);
  mockCompletedGet.mockResolvedValue([]);
  mockCatalogList.mockResolvedValue([
    course("CSC 4330", "Software Systems Development", 4),
    course("CSC 3102", "Data Structures"),
  ]);
  mockCourseDetails.mockImplementation(async (codes) => {
    const result: Record<CourseCode, CourseDetail> = {};
    for (const code of codes) {
      result[code] = detailsFor(
        code,
        code === "CSC 4330"
          ? { type: "COURSE", code: "CSC 3102", coreq: false, minGrade: null }
          : null,
      );
    }
    return result;
  });
  mockCourseHistory.mockResolvedValue([]);
  Object.assign(window, {
    jevschedule: {
      completed: { get: mockCompletedGet, set: async () => {} },
      plan: { get: mockPlanGet, save: mockPlanSave },
      transcript: { select: async () => null },
      catalog: {
        listCourses: mockCatalogList,
        getCourseDetails: mockCourseDetails,
        getCourseHistory: mockCourseHistory,
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

describe("PlanScreen", () => {
  it("withholds plan edits until the saved plan has loaded", async () => {
    const user = userEvent.setup();
    let resolvePlan!: (plan: Plan) => void;
    const promise = new Promise<Plan>((resolve) => {
      resolvePlan = resolve;
    });
    mockPlanGet.mockReturnValueOnce(promise);
    render(<PlanScreen />);

    const limit = screen.getByLabelText("Credit limit per semester");
    expect(limit).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add to plan" })).toBeDisabled();
    expect(mockPlanSave).not.toHaveBeenCalled();

    resolvePlan({
      creditLimit: 19,
      terms: [{ season: "Fall", year: 2026, courses: ["CSC 4330"] }],
    });
    expect(await screen.findByTestId("course-card-CSC 4330")).toBeInTheDocument();
    expect(limit).toBeEnabled();
    await user.clear(limit);
    await user.type(limit, "12");
    await user.tab();

    await waitFor(() => {
      expect(mockPlanSave).toHaveBeenCalledWith({
        creditLimit: 12,
        terms: [{ season: "Fall", year: 2026, courses: ["CSC 4330"] }],
      });
    });
  });

  it("warns on a planned course whose history lacks the term's season", async () => {
    mockPlanGet.mockResolvedValueOnce({
      creditLimit: 19,
      terms: [
        { season: "Fall", year: 2026, courses: ["CSC 3102"] },
        { season: "Spring", year: 2027, courses: ["CSC 4330"] },
      ],
    });
    mockCourseHistory.mockResolvedValue([{ term: "LSUAM_FALL_2026", sectionCount: 2 }]);
    render(<PlanScreen />);

    const springCard = await screen.findByTestId("course-card-CSC 4330");
    await waitFor(() => {
      expect(springCard.querySelector(".course-validation-warning")).toHaveTextContent(
        /^Not offered in Spring terms so far \(seen: Fall\)\.$/,
      );
    });
    expect(
      screen.getByTestId("course-card-CSC 3102").querySelector(".course-validation-warning"),
    ).toBeNull();
  });

  it("adds a catalog course to Fall 2026 and persists the plan", async () => {
    const user = userEvent.setup();
    mockPlanGet.mockResolvedValueOnce({
      creditLimit: 19,
      terms: [{ season: "Fall", year: 2026, courses: [] }],
    });
    render(<PlanScreen />);

    await user.selectOptions(await screen.findByRole("combobox", { name: "Course" }), "CSC 4330");
    await user.selectOptions(screen.getByRole("combobox", { name: "Term" }), "Fall-2026");
    await user.click(screen.getByRole("button", { name: "Add to plan" }));

    await waitFor(() => {
      expect(mockPlanSave).toHaveBeenCalledWith({
        creditLimit: 19,
        terms: [{ season: "Fall", year: 2026, courses: ["CSC 4330"] }],
      });
    });
    expect(await screen.findByTestId("course-card-CSC 4330")).toBeInTheDocument();
  });
  it("keeps the selected term when an earlier term is removed", async () => {
    const user = userEvent.setup();
    mockPlanGet.mockResolvedValueOnce({
      creditLimit: 19,
      terms: [
        { season: "Fall", year: 2026, courses: [] },
        { season: "Spring", year: 2027, courses: [] },
        { season: "Fall", year: 2028, courses: [] },
      ],
    });
    render(<PlanScreen />);

    const term = await screen.findByRole("combobox", { name: "Term" });
    await user.selectOptions(term, "Spring-2027");
    await user.selectOptions(screen.getByRole("combobox", { name: "Course" }), "CSC 4330");
    await user.click(screen.getByRole("button", { name: "Remove Fall 2026 term" }));

    await waitFor(() => {
      expect(mockPlanSave).toHaveBeenCalledWith({
        creditLimit: 19,
        terms: [
          { season: "Spring", year: 2027, courses: [] },
          { season: "Fall", year: 2028, courses: [] },
        ],
      });
    });
    await user.click(screen.getByRole("button", { name: "Add to plan" }));

    await waitFor(() => {
      expect(mockPlanSave).toHaveBeenLastCalledWith({
        creditLimit: 19,
        terms: [
          { season: "Spring", year: 2027, courses: ["CSC 4330"] },
          { season: "Fall", year: 2028, courses: [] },
        ],
      });
    });
  });

  it("clears the selected term when that term is removed", async () => {
    const user = userEvent.setup();
    mockPlanGet.mockResolvedValueOnce({
      creditLimit: 19,
      terms: [{ season: "Fall", year: 2026, courses: [] }],
    });
    render(<PlanScreen />);

    const term = await screen.findByRole("combobox", { name: "Term" });
    await user.selectOptions(term, "Fall-2026");
    await user.selectOptions(screen.getByRole("combobox", { name: "Course" }), "CSC 4330");
    await user.click(screen.getByRole("button", { name: "Remove Fall 2026 term" }));

    await waitFor(() => expect(term).toHaveValue(""));
    expect(screen.getByRole("button", { name: "Add to plan" })).toBeDisabled();
    expect(mockPlanSave).toHaveBeenCalledTimes(1);
  });

  it("rolls back a failed plan save and shows the persistence error", async () => {
    const user = userEvent.setup();
    mockPlanGet.mockResolvedValueOnce({
      creditLimit: 19,
      terms: [{ season: "Fall", year: 2026, courses: [] }],
    });
    mockPlanSave.mockRejectedValueOnce(new Error("disk full"));
    render(<PlanScreen />);

    const limit = await screen.findByLabelText("Credit limit per semester");
    await user.clear(limit);
    await user.type(limit, "12");
    await user.tab();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save the plan: disk full",
    );
    await waitFor(() => expect(limit).toHaveValue(19));
    expect(screen.getByText("Credit limit per semester:")).toBeInTheDocument();
    expect(screen.getByText("19 hrs")).toBeInTheDocument();
  });

  it("blocks further edits while a save is pending so a failed save cannot undo a newer one", async () => {
    const user = userEvent.setup();
    mockPlanGet.mockResolvedValueOnce({
      creditLimit: 19,
      terms: [{ season: "Fall", year: 2026, courses: [] }],
    });
    let rejectSave!: (error: Error) => void;
    mockPlanSave.mockReturnValueOnce(
      new Promise<void>((_, reject) => {
        rejectSave = reject;
      }),
    );
    render(<PlanScreen />);

    const limit = await screen.findByLabelText("Credit limit per semester");
    await user.selectOptions(await screen.findByRole("combobox", { name: "Course" }), "CSC 4330");
    await user.selectOptions(screen.getByRole("combobox", { name: "Term" }), "Fall-2026");
    await user.clear(limit);
    await user.type(limit, "12");
    await user.tab();
    await waitFor(() => expect(mockPlanSave).toHaveBeenCalledTimes(1));

    const add = screen.getByRole("button", { name: "Add to plan" });
    expect(add).toBeDisabled();
    expect(limit).toBeDisabled();
    await user.click(add);
    expect(mockPlanSave).toHaveBeenCalledTimes(1);

    rejectSave(new Error("disk full"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save the plan: disk full",
    );
    await waitFor(() => expect(limit).toHaveValue(19));
    expect(screen.queryByTestId("course-card-CSC 4330")).not.toBeInTheDocument();
    expect(limit).toBeEnabled();
    expect(mockPlanSave).toHaveBeenCalledTimes(1);
  });
  it("shows an inline missing-prerequisite error for a course planned too early", async () => {
    mockPlanGet.mockResolvedValueOnce({
      creditLimit: 19,
      terms: [{ season: "Fall", year: 2026, courses: ["CSC 4330"] }],
    });
    render(<PlanScreen />);

    expect(await screen.findByText(/Missing prerequisite: CSC 3102 completed/)).toBeInTheDocument();
  });

  it("persists an edited credit limit and shows the resulting credit warning", async () => {
    const user = userEvent.setup();
    mockPlanGet.mockResolvedValueOnce({
      creditLimit: 19,
      terms: [{ season: "Fall", year: 2026, courses: ["CSC 4330"] }],
    });
    render(<PlanScreen />);

    const limit = await screen.findByLabelText("Credit limit per semester");
    await user.clear(limit);
    await user.type(limit, "3");
    await user.tab();

    await waitFor(() =>
      expect(mockPlanSave).toHaveBeenCalledWith(expect.objectContaining({ creditLimit: 3 })),
    );
    expect(await screen.findByText(/exceed the 3-credit limit/)).toBeInTheDocument();
  });

  it("rejects an invalid credit limit without saving", async () => {
    const user = userEvent.setup();
    render(<PlanScreen />);

    const limit = await screen.findByLabelText("Credit limit per semester");
    await user.clear(limit);
    await user.type(limit, "0");
    await user.tab();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a whole number of credits (1 or more).",
    );
    expect(mockPlanSave).not.toHaveBeenCalled();
    expect(limit).toHaveValue(19);
  });
});

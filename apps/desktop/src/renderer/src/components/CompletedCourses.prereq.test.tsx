// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent, type UserEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { Course, CourseCode, PrereqNode } from "@jevschedule/shared";
import { CompletedCourses } from "./CompletedCourses.js";

const courses: Course[] = ["CSC 3102", "CSC 3380", "CSC 4330"].map((code) => ({
  catalogYear: "2026-2027",
  code: code as CourseCode,
  title: `${code} course`,
  credits: { min: 3, max: 3, note: null },
  description: "Synthetic test catalog course",
  prerequisiteText: null,
}));

const requiredTree: PrereqNode = {
  type: "AND",
  children: [
    { type: "COURSE", code: "CSC 3102", coreq: false, minGrade: null },
    { type: "COURSE", code: "CSC 3380", coreq: false, minGrade: null },
  ],
};

function renderScreen(
  options: {
    completed?: CourseCode[];
    tree?: PrereqNode | null;
    detailsError?: boolean;
  } = {},
) {
  const completed = new Set<CourseCode>(options.completed ?? []);
  const persisted: Array<[CourseCode, boolean]> = [];
  const set = vi.fn(async (code: CourseCode, value: boolean) => {
    persisted.push([code, value]);
    if (value) completed.add(code);
    else completed.delete(code);
  });
  const getCourseDetails = vi.fn(async (codes: readonly CourseCode[]) => {
    if (options.detailsError) throw new Error("server unavailable");
    return Object.fromEntries(
      codes.map((code) => [
        code,
        { prereq: { tree: options.tree === undefined ? requiredTree : options.tree } },
      ]),
    );
  });
  Object.assign(window, {
    jevschedule: {
      completed: { get: async () => [...completed], set },
      catalog: {
        listCourses: async () => courses,
        getCourseDetails,
        getCourseHistory: async () => [],
        listDegrees: async () => [],
        getDegree: async () => {
          throw new Error("none");
        },
      },
      transcript: { select: async () => null },
    },
  });
  render(<CompletedCourses />);
  return { completed, persisted, set, getCourseDetails };
}

async function clickSearchCompletion(user: UserEvent) {
  await user.type(await screen.findByLabelText("Search Courses"), "CSC 4330");
  await user.click(await screen.findByRole("button", { name: "Mark Completed" }));
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "jevschedule");
});

describe("CompletedCourses prerequisite auto-check", () => {
  it("accept persists the target and each required unmet prerequisite", async () => {
    const user = userEvent.setup();
    const { completed, persisted } = renderScreen();
    await clickSearchCompletion(user);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark All Completed" }));

    await waitFor(() =>
      expect([...completed].sort()).toEqual(["CSC 3102", "CSC 3380", "CSC 4330"]),
    );
    expect(persisted).toEqual([
      ["CSC 4330", true],
      ["CSC 3102", true],
      ["CSC 3380", true],
    ]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("decline persists only the target course", async () => {
    const user = userEvent.setup();
    const { completed, persisted } = renderScreen();
    await clickSearchCompletion(user);
    await user.click(await screen.findByRole("button", { name: "Mark Only CSC 4330" }));

    await waitFor(() => expect([...completed]).toEqual(["CSC 4330"]));
    expect(persisted).toEqual([["CSC 4330", true]]);
  });

  it("cancel leaves completion unchanged", async () => {
    const user = userEvent.setup();
    const { completed, persisted } = renderScreen();
    await clickSearchCompletion(user);
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(completed.size).toBe(0);
    expect(persisted).toEqual([]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("marks directly without a dialog when only OR alternatives are unmet", async () => {
    const user = userEvent.setup();
    const tree: PrereqNode = {
      type: "OR",
      children: [
        { type: "COURSE", code: "CSC 3102", coreq: false, minGrade: null },
        { type: "COURSE", code: "CSC 3380", coreq: false, minGrade: null },
      ],
    };
    const { completed, persisted } = renderScreen({ tree });
    await clickSearchCompletion(user);

    await waitFor(() => expect([...completed]).toEqual(["CSC 4330"]));
    expect(persisted).toEqual([["CSC 4330", true]]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("marks the target when course details cannot be fetched", async () => {
    const user = userEvent.setup();
    const { completed, persisted } = renderScreen({ detailsError: true });
    await clickSearchCompletion(user);

    await waitFor(() => expect([...completed]).toEqual(["CSC 4330"]));
    expect(persisted).toEqual([["CSC 4330", true]]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("unmarks a completed course without requesting details or opening a dialog", async () => {
    const user = userEvent.setup();
    const { completed, persisted, getCourseDetails } = renderScreen({ completed: ["CSC 4330"] });
    await user.click(await screen.findByRole("button", { name: "Completed" }));

    await waitFor(() => expect([...completed]).toEqual([]));
    expect(persisted).toEqual([["CSC 4330", false]]);
    expect(getCourseDetails).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("rejects manual CSC 0000 and never calls completed.set", async () => {
    const user = userEvent.setup();
    const { persisted } = renderScreen();
    await user.type(await screen.findByLabelText("Course code"), "CSC 0000");
    await user.click(screen.getByRole("button", { name: "Show course" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "CSC 0000 is not in the LSU course catalog.",
    );
    expect(screen.queryByRole("checkbox", { name: "CSC 0000 completed" })).not.toBeInTheDocument();
    expect(persisted).toEqual([]);
  });

  it("manually completes a catalog course", async () => {
    const user = userEvent.setup();
    const { persisted } = renderScreen();
    await user.type(await screen.findByLabelText("Course code"), "CSC 4330");
    await user.click(screen.getByRole("button", { name: "Show course" }));
    await user.click(await screen.findByRole("checkbox", { name: "CSC 4330 completed" }));

    await waitFor(() => expect(persisted).toEqual([["CSC 4330", true]]));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

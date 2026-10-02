// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CompletedCourses } from "./CompletedCourses.js";

const course = {
  catalogYear: "2026-2027",
  code: "CSC 1350",
  title: "Computer Science I",
  credits: { min: 4, max: 4, note: null },
  description: "Introductory course",
  prerequisiteText: null,
};

function installApi(completed: string[]) {
  Object.assign(window, {
    jevschedule: {
      completed: { get: async () => completed, set: async () => undefined },
      catalog: {
        listCourses: async () => [
          course,
          {
            ...course,
            code: "CSC 2259",
            title: "Discrete Structures",
            credits: { min: 3, max: 3, note: null },
          },
          {
            ...course,
            code: "CSC 4900",
            title: "Independent Study",
            credits: { min: 1, max: 3, note: null },
          },
        ],
        getCourseDetails: async () => ({}),
        listDegrees: async () => [],
        getDegree: async () => {
          throw new Error("none");
        },
      },
      transcript: { select: async () => null },
    },
  });
}

describe("CompletedCourses summary and empty state", () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "jevschedule");
  });

  it("shows the empty state and a zero count when nothing is completed", async () => {
    installApi([]);
    render(<CompletedCourses />);

    expect(await screen.findByText(/No courses marked complete yet/)).toBeInTheDocument();
    expect(screen.getByTestId("completed-summary")).toHaveTextContent(/^0 courses$/);
  });

  it("sums catalog credits and uses the singular for one course", async () => {
    installApi(["CSC 1350"]);
    render(<CompletedCourses />);

    await waitFor(() =>
      expect(screen.getByTestId("completed-summary")).toHaveTextContent("1 course · 4 cr"),
    );
    expect(screen.queryByText(/No courses marked complete yet/)).not.toBeInTheDocument();

    cleanup();
    installApi(["CSC 1350", "CSC 2259"]);
    render(<CompletedCourses />);
    await waitFor(() =>
      expect(screen.getByTestId("completed-summary")).toHaveTextContent("2 courses · 7 cr"),
    );
  });

  it("counts a variable-credit course at its minimum credits", async () => {
    installApi(["CSC 4900"]);
    render(<CompletedCourses />);

    await waitFor(() =>
      expect(screen.getByTestId("completed-summary")).toHaveTextContent("1 course · 1 cr"),
    );
  });

  it("omits credits for completed codes missing from the catalog", async () => {
    installApi(["CSC 9999"]);
    render(<CompletedCourses />);

    await waitFor(() =>
      expect(screen.getByTestId("completed-summary")).toHaveTextContent(/^1 course$/),
    );
  });
});

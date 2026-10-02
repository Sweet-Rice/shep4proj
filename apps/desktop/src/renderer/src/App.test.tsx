// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { JevscheduleApi } from "../../shared/ipc.js";
import { App } from "./App.js";

beforeEach(() => {
  Object.assign(window, {
    jevschedule: {
      completed: { get: async () => [], set: async () => {} },
      plan: {
        get: async () => ({ creditLimit: 19, terms: [] }),
        save: async () => {},
      },
      transcript: { select: async () => null },
      catalog: {
        listCourses: async () => [],
        getCourseDetails: async () => ({}),
        getCourseHistory: async () => [],
        listDegrees: async () => [],
        listSections: async () => [],
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

describe("App tabs", () => {
  it("selects Courses by default", () => {
    render(<App />);

    expect(screen.getByRole("tab", { name: "Courses" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Completed courses" })).toBeInTheDocument();
  });

  it("shows only the selected Degree progress screen", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "Degree progress" }));

    expect(screen.getByRole("tab", { name: "Degree progress" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("heading", { name: "Degree Progress" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Completed courses" })).not.toBeInTheDocument();
  });
  it("shows the Plan screen in its tab", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "Plan" }));

    expect(screen.getByRole("tab", { name: "Plan" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Plan" })).toBeInTheDocument();
  });

  it("places Eligible courses between Degree progress and Plan and shows its screen", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Courses",
      "Degree progress",
      "Eligible courses",
      "Plan",
      "Schedule",
    ]);
    await user.click(screen.getByRole("tab", { name: "Eligible courses" }));

    expect(screen.getByRole("tab", { name: "Eligible courses" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("heading", { name: "Eligible courses" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Plan" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Schedule" }));
    expect(screen.getByRole("tab", { name: "Schedule" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Schedule" })).toBeInTheDocument();
  });
});

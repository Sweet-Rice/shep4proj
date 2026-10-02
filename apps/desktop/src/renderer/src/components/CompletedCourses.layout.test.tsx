// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CompletedCourses } from "./CompletedCourses.js";
import { ImportProgressFlow } from "./ImportProgressFlow.js";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "jevschedule");
});

describe("Courses page chrome", () => {
  it("renders a page header with a subtitle", async () => {
    Object.assign(window, {
      jevschedule: {
        completed: { get: async () => [], set: async () => undefined },
        catalog: { listCourses: async () => [] },
        transcript: { select: async () => null },
      },
    });
    render(<CompletedCourses />);

    const heading = await screen.findByRole("heading", { level: 1, name: "Completed courses" });
    expect(heading.parentElement).toHaveClass("page-header");
    expect(heading.parentElement?.querySelector(".page-subtitle")).toHaveTextContent(
      "Search the LSU catalog",
    );
  });

  it("shows a privacy note on the idle import card", () => {
    render(<ImportProgressFlow catalogCodes={new Set()} />);

    expect(screen.getByTestId("stage-idle")).toHaveTextContent(
      "You review every course before anything is saved, and imported courses stay on this device.",
    );
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { CompletedCourses } from "./CompletedCourses.js";

describe("transcript upload in the installed desktop screen", () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "jevschedule");
  });

  it("selects a PDF, opens review, and refreshes completed courses after confirmation", async () => {
    const user = userEvent.setup();
    const completed = new Set<string>();
    const select = vi.fn().mockResolvedValue({
      courses: [{ code: "CSC 1350", term: { season: "Fall", year: 2024 }, grade: "A" }],
      unrecognizedLines: [],
    });
    Object.assign(window, {
      jevschedule: {
        completed: {
          get: async () => [...completed],
          set: async (code: string, value: boolean) => {
            if (value) completed.add(code);
            else completed.delete(code);
          },
        },
        catalog: {
          listCourses: async () => [],
          getCourseDetails: async () => ({}),
          getCourseHistory: async () => [],
          listDegrees: async () => [],
          getDegree: async () => {
            throw new Error("none");
          },
        },
        transcript: { select },
        workday: {
          start: vi.fn(),
          confirm: vi.fn(),
          onProgress: vi.fn(() => vi.fn()),
        },
      },
    });

    render(<CompletedCourses />);
    expect(screen.getByTestId("start-import-btn")).toBeEnabled();
    await user.click(screen.getByTestId("select-transcript-btn"));
    await waitFor(() => expect(screen.getByTestId("stage-review")).toBeInTheDocument());
    await user.click(screen.getByTestId("confirm-import-btn"));
    await waitFor(() => expect(screen.getByText("CSC 1350 completed")).toBeInTheDocument());
    expect(select).toHaveBeenCalledOnce();
  });
  it("lists server catalog courses and persists a search completion toggle", async () => {
    const user = userEvent.setup();
    const set = vi.fn();
    const catalogCourse = {
      catalogYear: "2026-2027",
      code: "CSC 1350",
      title: "Computer Science I",
      credits: { min: 3, max: 3, note: null },
      description: "Introductory course",
      prerequisiteText: null,
    };
    Object.assign(window, {
      jevschedule: {
        completed: { get: async () => [], set },
        transcript: { select: async () => null },
        catalog: {
          listCourses: async () => [catalogCourse],
          getCourseDetails: async () => ({}),
          getCourseHistory: async () => [],
          listDegrees: async () => [],
          getDegree: async () => {
            throw new Error("none");
          },
        },
      },
    });
    render(<CompletedCourses />);
    await user.click(await screen.findByRole("button", { name: "Mark Completed" }));
    await waitFor(() => expect(set).toHaveBeenCalledWith("CSC 1350", true));
  });
});

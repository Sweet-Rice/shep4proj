// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { CompletedCourses } from "./CompletedCourses.js";

const course = {
  catalogYear: "2026-2027",
  code: "CSC 1350",
  title: "Computer Science I",
  credits: { min: 3, max: 3, note: null },
  description: "Introductory course",
  prerequisiteText: null,
};

function installApi(set: (code: string, completed: boolean) => Promise<void>) {
  Object.assign(window, {
    jevschedule: {
      completed: { get: async () => [], set },
      catalog: {
        listCourses: async () => [course],
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

describe("CompletedCourses save announcement", () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "jevschedule");
  });

  it("announces that changes were saved after a toggle", async () => {
    const user = userEvent.setup();
    installApi(vi.fn().mockResolvedValue(undefined));
    render(<CompletedCourses />);

    await user.click(
      await within(await screen.findByTestId("course-item-CSC 1350")).findByRole("button", {
        name: "Mark Completed",
      }),
    );

    await waitFor(() =>
      expect(screen.getAllByRole("status").map((el) => el.textContent)).toContain(
        "Changes saved on this device.",
      ),
    );
  });
});

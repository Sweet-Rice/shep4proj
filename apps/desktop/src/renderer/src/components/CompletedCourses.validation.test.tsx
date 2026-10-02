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

function installApi(
  set: (code: string, completed: boolean) => Promise<void>,
  completed: string[] = [],
) {
  Object.assign(window, {
    jevschedule: {
      completed: { get: async () => completed, set },
      catalog: {
        listCourses: async () => [course, { ...course, code: "CSC 4103" }],
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

describe("CompletedCourses catalog membership", () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "jevschedule");
  });

  it("rejects manual CSC 0000 without calling completed.set", async () => {
    const user = userEvent.setup();
    const set = vi.fn().mockResolvedValue(undefined);
    installApi(set);
    render(<CompletedCourses />);

    const input = screen.getByRole("textbox", { name: "Course code" });
    await waitFor(() => expect(input).toBeEnabled());
    await user.type(input, "CSC 0000");
    await user.click(screen.getByRole("button", { name: "Show course" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "CSC 0000 is not in the LSU course catalog.",
    );
    expect(screen.queryByRole("checkbox", { name: "CSC 0000 completed" })).not.toBeInTheDocument();
    expect(set).not.toHaveBeenCalled();
  });
  it("surfaces catalog membership failures from completion toggles", async () => {
    const user = userEvent.setup();
    const set = vi.fn().mockRejectedValue(new Error("Not in the LSU course catalog: CSC 1350"));
    installApi(set);
    render(<CompletedCourses />);

    await user.click(
      await within(await screen.findByTestId("course-item-CSC 1350")).findByRole("button", {
        name: "Mark Completed",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Not in the LSU course catalog: CSC 1350",
    );
    expect(
      within(screen.getByTestId("course-item-CSC 1350")).getByRole("button", {
        name: "Mark Completed",
      }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("allows manual entry of a catalog course to be completed", async () => {
    const user = userEvent.setup();
    const set = vi.fn().mockResolvedValue(undefined);
    installApi(set);
    render(<CompletedCourses />);

    const input = screen.getByRole("textbox", { name: "Course code" });
    await waitFor(() => expect(input).toBeEnabled());
    await user.type(input, "CSC 1350");
    await user.click(screen.getByRole("button", { name: "Show course" }));
    await user.click(screen.getByRole("checkbox", { name: "CSC 1350 completed" }));
    await waitFor(() => expect(set).toHaveBeenCalledWith("CSC 1350", true));
  });
  it("normalizes manual suffixed entry to the catalog code", async () => {
    const user = userEvent.setup();
    const set = vi.fn().mockResolvedValue(undefined);
    installApi(set);
    render(<CompletedCourses />);

    const input = screen.getByRole("textbox", { name: "Course code" });
    await waitFor(() => expect(input).toBeEnabled());
    await user.type(input, "CSC 4103G");
    await user.click(screen.getByRole("button", { name: "Show course" }));
    expect(input).toHaveValue("CSC 4103");
    await user.click(screen.getByRole("checkbox", { name: "CSC 4103 completed" }));
    await waitFor(() => expect(set).toHaveBeenCalledWith("CSC 4103", true));
  });
  it("flags a stored completion missing from the loaded catalog", async () => {
    const user = userEvent.setup();
    const set = vi.fn().mockResolvedValue(undefined);
    installApi(set, ["CSC 0000"]);
    render(<CompletedCourses />);

    expect(await screen.findByText("Not in catalog")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "CSC 0000 completed" }));
    await waitFor(() => expect(set).toHaveBeenCalledWith("CSC 0000", false));
  });
});

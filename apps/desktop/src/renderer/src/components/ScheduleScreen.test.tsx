// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { Course, Plan, Section } from "@jevschedule/shared";
import type { JevscheduleApi } from "../../../shared/ipc.js";
import { ScheduleScreen } from "./ScheduleScreen.js";

const courses: Course[] = [
  {
    catalogYear: "2026-2027",
    code: "CSC 4330",
    title: "Software Engineering",
    credits: { min: 3, max: 3, note: null },
    description: "",
    prerequisiteText: null,
  },
  {
    catalogYear: "2026-2027",
    code: "CSC 1350",
    title: "Computer Science I",
    credits: { min: 3, max: 3, note: null },
    description: "",
    prerequisiteText: null,
  },
];

const sections: Section[] = [
  {
    term: "LSUAM_FALL_2026",
    courseCode: "CSC 4330",
    sectionNumber: "001",
    sectionType: "LEC",
    credits: { min: 3, max: 3, note: null },
    instructor: "A. Professor",
    location: "Taylor Hall",
    deliveryMode: "On Campus",
    enrollment: 20,
    capacity: 30,
    meetings: [{ days: ["Mon", "Wed"], startMinute: 600, endMinute: 650 }],
  },
  {
    term: "LSUAM_FALL_2026",
    courseCode: "CSC 1350",
    sectionNumber: "002",
    sectionType: "LEC",
    credits: { min: 3, max: 3, note: null },
    instructor: "B. Professor",
    location: "Coates Hall",
    deliveryMode: "On Campus",
    enrollment: 20,
    capacity: 30,
    meetings: [{ days: ["Mon", "Wed"], startMinute: 625, endMinute: 675 }],
  },
  {
    term: "LSUAM_SPRING_2027",
    courseCode: "CSC 4330",
    sectionNumber: "003",
    sectionType: "LEC",
    credits: { min: 3, max: 3, note: null },
    instructor: "C. Professor",
    location: "Tureaud Hall",
    deliveryMode: "On Campus",
    enrollment: 10,
    capacity: 30,
    meetings: [{ days: ["Tue", "Thu"], startMinute: 600, endMinute: 650 }],
  },
];

const plan: Plan = { creditLimit: 19, terms: [{ season: "Fall", year: 2026, courses: [] }] };

function setup(
  options: {
    planTerms?: typeof plan.terms;
    rejectSections?: boolean;
    pendingSections?: boolean;
    rejectCatalog?: boolean;
  } = {},
) {
  const listSections = vi.fn(async (code: string, term: string) => {
    if (options.rejectSections) throw new Error("offline");
    if (options.pendingSections) return new Promise<Section[]>(() => {});
    return sections.filter((section) => section.courseCode === code && section.term === term);
  });
  Object.assign(window, {
    jevschedule: {
      completed: { get: async () => [], set: async () => {} },
      plan: {
        get: async () => ({ ...plan, terms: options.planTerms ?? plan.terms }),
        save: async () => {},
      },
      transcript: { select: async () => null },
      catalog: {
        listCourses: async () => {
          if (options.rejectCatalog) throw new Error("offline");
          return courses;
        },
        getCourseDetails: async () => ({}),
        listSections,
        listDegrees: async () => [],
        getDegree: async () => {
          throw new Error("none");
        },
      },
    } as unknown as JevscheduleApi,
  });
  return { listSections };
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "jevschedule");
});

describe("ScheduleScreen", () => {
  it("selects the plan term and adds overlapping catalog sections to the calendar", async () => {
    const user = userEvent.setup();
    const { listSections } = setup();
    render(<ScheduleScreen />);

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Term" })).toHaveValue("LSUAM_FALL_2026"),
    );
    expect(screen.getByRole("option", { name: "Fall 2026" })).toBeInTheDocument();

    const addCourseSelect = screen.getByRole("combobox", { name: "Add course" });
    await user.selectOptions(addCourseSelect, "CSC 4330");
    await user.click(screen.getByRole("button", { name: "Add course" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Add course" }), "CSC 1350");
    await user.click(screen.getByRole("button", { name: "Add course" }));

    expect(await screen.findByText("A. Professor")).toBeInTheDocument();
    expect(screen.getByText("Taylor Hall")).toBeInTheDocument();
    expect(screen.getByText("Mon, Wed 10:00 AM–10:50 AM")).toBeInTheDocument();
    await waitFor(() => expect(listSections).toHaveBeenCalledWith("CSC 4330", "LSUAM_FALL_2026"));
    await waitFor(() => expect(listSections).toHaveBeenCalledWith("CSC 1350", "LSUAM_FALL_2026"));

    const csc4330 = within(screen.getByRole("region", { name: "Sections for CSC 4330" }));
    const csc1350 = within(screen.getByRole("region", { name: "Sections for CSC 1350" }));
    await user.click(csc4330.getByRole("button", { name: "Add to schedule" }));
    await user.click(csc1350.getByRole("button", { name: "Add to schedule" }));

    expect(screen.getAllByTestId("meeting-block-CSC 4330-Mon")).toHaveLength(1);
    expect(screen.getAllByTestId("meeting-block-CSC 1350-Mon")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Schedule Conflict Detected");
  }, 15_000);

  it("removes a section from the calendar and clears its conflict", async () => {
    const user = userEvent.setup();
    setup();
    render(<ScheduleScreen />);
    await screen.findByRole("combobox", { name: "Term" });
    for (const code of ["CSC 4330", "CSC 1350"]) {
      await user.selectOptions(screen.getByRole("combobox", { name: "Add course" }), code);
      await user.click(screen.getByRole("button", { name: "Add course" }));
      await user.click(
        await within(
          await screen.findByRole("region", { name: `Sections for ${code}` }),
        ).findByRole("button", { name: "Add to schedule" }),
      );
    }
    expect(screen.getByRole("alert")).toHaveTextContent("Schedule Conflict Detected");

    await user.click(
      within(screen.getByTestId("meeting-block-CSC 4330-Mon")).getByRole("button", {
        name: "Remove section CSC 4330 001",
      }),
    );

    expect(screen.queryByTestId("meeting-block-CSC 4330-Mon")).not.toBeInTheDocument();
    expect(screen.queryByTestId("meeting-block-CSC 4330-Wed")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("meeting-block-CSC 1350-Mon")).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  }, 15_000);

  it("removes a course from the list and offers it again", async () => {
    const user = userEvent.setup();
    setup();
    render(<ScheduleScreen />);
    await screen.findByRole("combobox", { name: "Term" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Add course" }), "CSC 4330");
    await user.click(screen.getByRole("button", { name: "Add course" }));
    expect(
      await screen.findByRole("region", { name: "Sections for CSC 4330" }),
    ).toBeInTheDocument();
    const addCourse = screen.getByRole("combobox", { name: "Add course" });
    expect(within(addCourse).queryByRole("option", { name: /CSC 4330/ })).not.toBeInTheDocument();

    await user.click(
      within(screen.getByRole("region", { name: "Courses to schedule" })).getByRole("button", {
        name: "Remove",
      }),
    );

    expect(screen.queryByRole("region", { name: "Sections for CSC 4330" })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("combobox", { name: "Add course" })).getByRole("option", {
        name: /CSC 4330/,
      }),
    ).toBeInTheDocument();
  });

  it("offers every plan term and requests sections with the selected period id", async () => {
    const user = userEvent.setup();
    const spring = { season: "Spring" as const, year: 2027, courses: [] };
    const { listSections } = setup({ planTerms: [...plan.terms, spring] });
    render(<ScheduleScreen />);

    const termSelect = await screen.findByRole("combobox", { name: "Term" });
    expect(within(termSelect).getByRole("option", { name: "Spring 2027" })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Add course" }), "CSC 4330");
    await user.click(screen.getByRole("button", { name: "Add course" }));
    await user.selectOptions(termSelect, "LSUAM_SPRING_2027");

    await waitFor(() => expect(listSections).toHaveBeenCalledWith("CSC 4330", "LSUAM_SPRING_2027"));
  });

  it("shows only the selected term's sections on the calendar and keeps the others", async () => {
    const user = userEvent.setup();
    const spring = { season: "Spring" as const, year: 2027, courses: [] };
    setup({ planTerms: [...plan.terms, spring] });
    render(<ScheduleScreen />);

    const termSelect = await screen.findByRole("combobox", { name: "Term" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Add course" }), "CSC 4330");
    await user.click(screen.getByRole("button", { name: "Add course" }));
    await user.click(
      await within(await screen.findByRole("region", { name: "Sections for CSC 4330" })).findByRole(
        "button",
        { name: "Add to schedule" },
      ),
    );
    expect(screen.getAllByTestId("meeting-block-CSC 4330-Mon")).toHaveLength(1);

    await user.selectOptions(termSelect, "LSUAM_SPRING_2027");
    expect(await screen.findByText("003-LEC")).toBeInTheDocument();
    expect(screen.queryByTestId("meeting-block-CSC 4330-Mon")).not.toBeInTheDocument();

    await user.click(
      within(screen.getByRole("region", { name: "Sections for CSC 4330" })).getByRole("button", {
        name: "Add to schedule",
      }),
    );
    expect(screen.getAllByTestId("meeting-block-CSC 4330-Tue")).toHaveLength(1);
    expect(screen.queryByTestId("meeting-block-CSC 4330-Mon")).not.toBeInTheDocument();
    expect(screen.queryByTestId("schedule-conflict-banner")).not.toBeInTheDocument();

    await user.selectOptions(termSelect, "LSUAM_FALL_2026");
    await waitFor(() =>
      expect(screen.getAllByTestId("meeting-block-CSC 4330-Mon")).toHaveLength(1),
    );
    expect(screen.queryByTestId("meeting-block-CSC 4330-Tue")).not.toBeInTheDocument();
  });

  it("hides another term's conflict banner and restores it when switching back", async () => {
    const user = userEvent.setup();
    const spring = { season: "Spring" as const, year: 2027, courses: [] };
    setup({ planTerms: [...plan.terms, spring] });
    render(<ScheduleScreen />);

    const termSelect = await screen.findByRole("combobox", { name: "Term" });
    for (const code of ["CSC 4330", "CSC 1350"]) {
      await user.selectOptions(screen.getByRole("combobox", { name: "Add course" }), code);
      await user.click(screen.getByRole("button", { name: "Add course" }));
      await user.click(
        await within(
          await screen.findByRole("region", { name: `Sections for ${code}` }),
        ).findByRole("button", { name: "Add to schedule" }),
      );
    }
    expect(screen.getByTestId("schedule-conflict-banner")).toBeInTheDocument();

    await user.selectOptions(termSelect, "LSUAM_SPRING_2027");
    expect(await screen.findByText("003-LEC")).toBeInTheDocument();
    expect(screen.queryByTestId("schedule-conflict-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("meeting-block-CSC 4330-Mon")).not.toBeInTheDocument();
    expect(screen.queryByTestId("meeting-block-CSC 1350-Mon")).not.toBeInTheDocument();

    await user.selectOptions(termSelect, "LSUAM_FALL_2026");
    expect(await screen.findByTestId("schedule-conflict-banner")).toHaveTextContent(
      "Schedule Conflict Detected (2 sections overlap)",
    );
    expect(screen.getAllByTestId("meeting-block-CSC 4330-Mon")).toHaveLength(1);
    expect(screen.getAllByTestId("meeting-block-CSC 1350-Mon")).toHaveLength(1);
  }, 15_000);

  it("shows the server error for section requests", async () => {
    const user = userEvent.setup();
    setup({ rejectSections: true });
    render(<ScheduleScreen />);
    await screen.findByRole("combobox", { name: "Term" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Add course" }), "CSC 4330");
    await user.click(screen.getByRole("button", { name: "Add course" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach the JevSchedule server. Start it with pnpm dev and reopen this tab.",
    );
  });

  it("shows one server error when the course catalog cannot be loaded", async () => {
    setup({ rejectCatalog: true });
    render(<ScheduleScreen />);

    await screen.findByRole("combobox", { name: "Term" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach the JevSchedule server. Start it with pnpm dev and reopen this tab.",
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("shows a loading status while sections are requested", async () => {
    const user = userEvent.setup();
    setup({ pendingSections: true });
    render(<ScheduleScreen />);
    await screen.findByRole("combobox", { name: "Term" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Add course" }), "CSC 4330");
    await user.click(screen.getByRole("button", { name: "Add course" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Loading sections…");
  });

  it("prompts the user to add a plan term when none exist", async () => {
    setup({ planTerms: [] });
    render(<ScheduleScreen />);

    expect(await screen.findByRole("heading", { name: "Schedule" })).toBeInTheDocument();
    expect(
      await screen.findByText("Add a term in the Plan tab to build a schedule."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Term" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Courses to schedule" })).not.toBeInTheDocument();
  });
});

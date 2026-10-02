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
  const save = vi.fn(async () => {});
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
        save,
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
  return { listSections, save };
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "jevschedule");
});

async function addCourse(user: ReturnType<typeof userEvent.setup>, code: string) {
  const button = await screen.findByRole("button", { name: `Add course ${code}` });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
}

async function addSection(user: ReturnType<typeof userEvent.setup>, code: string) {
  await user.click(
    await within(await screen.findByRole("region", { name: `Sections for ${code}` })).findByRole(
      "button",
      { name: "Add to schedule" },
    ),
  );
}

const SERVER_ALERT =
  "Couldn't reach the JevSchedule server. It may be waking up, which can take up to a minute. Try again.";

describe("ScheduleScreen", () => {
  it("lists one course's sections at a time and flags a clashing section red", async () => {
    const user = userEvent.setup();
    const { listSections } = setup();
    render(<ScheduleScreen />);

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Term" })).toHaveValue("LSUAM_FALL_2026"),
    );
    await addCourse(user, "CSC 4330");
    expect(await screen.findByText("A. Professor")).toBeInTheDocument();
    await addSection(user, "CSC 4330");
    expect(screen.getAllByTestId("meeting-block-CSC 4330-Mon")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Add course CSC 4330" })).toHaveTextContent("Added");

    await addCourse(user, "CSC 1350");
    const csc1350 = await screen.findByRole("region", { name: "Sections for CSC 1350" });
    expect(screen.queryByRole("region", { name: "Sections for CSC 4330" })).not.toBeInTheDocument();
    expect(within(csc1350).getByText("002-LEC").closest("li")).toHaveClass("conflict");
    expect(within(csc1350).getByText("Time conflict with CSC 4330 001")).toBeInTheDocument();

    await addSection(user, "CSC 1350");
    expect(screen.getByTestId("schedule-conflict-banner")).toHaveTextContent(
      "Schedule Conflict Detected",
    );
    expect(listSections).toHaveBeenCalledWith("CSC 1350", "LSUAM_FALL_2026");
  }, 15_000);

  it("hides the previous course's sections when searching for another course", async () => {
    const user = userEvent.setup();
    setup();
    render(<ScheduleScreen />);

    await addCourse(user, "CSC 4330");
    expect(
      await screen.findByRole("region", { name: "Sections for CSC 4330" }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search Courses"), "1350");

    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Sections for CSC 4330" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("opens a details panel from the calendar and removes the section on confirm", async () => {
    const user = userEvent.setup();
    setup();
    render(<ScheduleScreen />);
    for (const code of ["CSC 4330", "CSC 1350"]) {
      await addCourse(user, code);
      await addSection(user, code);
    }
    expect(screen.getByTestId("schedule-conflict-banner")).toBeInTheDocument();

    await user.click(screen.getByTestId("meeting-block-CSC 4330-Mon"));
    const panel = screen.getByRole("region", { name: "CSC 4330 001 details" });
    expect(within(panel).getByText("Taylor Hall")).toBeInTheDocument();
    expect(within(panel).getByText("Software Engineering")).toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("region", { name: "CSC 4330 001 details" })).not.toBeInTheDocument();
    expect(screen.getAllByTestId("meeting-block-CSC 4330-Mon")).toHaveLength(1);

    await user.click(screen.getByTestId("meeting-block-CSC 4330-Mon"));
    await user.click(screen.getByRole("button", { name: "Remove from schedule" }));
    expect(screen.queryByTestId("meeting-block-CSC 4330-Mon")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("meeting-block-CSC 1350-Mon")).toHaveLength(1);
    expect(screen.queryByTestId("schedule-conflict-banner")).not.toBeInTheDocument();
  }, 15_000);

  it("lists only courses with sections in the selected term", async () => {
    const user = userEvent.setup();
    const spring = { season: "Spring" as const, year: 2027, courses: [] };
    const { listSections } = setup({ planTerms: [...plan.terms, spring] });
    render(<ScheduleScreen />);

    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Term" }),
      "LSUAM_SPRING_2027",
    );
    expect(await screen.findByRole("button", { name: "Add course CSC 4330" })).toBeEnabled();
    await waitFor(() => expect(listSections).toHaveBeenCalledWith("CSC 1350", "LSUAM_SPRING_2027"));
    expect(screen.queryByRole("button", { name: "Add course CSC 1350" })).not.toBeInTheDocument();
  });

  it("shows only the selected term's sections on the calendar and keeps the others", async () => {
    const user = userEvent.setup();
    const spring = { season: "Spring" as const, year: 2027, courses: [] };
    setup({ planTerms: [...plan.terms, spring] });
    render(<ScheduleScreen />);

    const termSelect = await screen.findByRole("combobox", { name: "Term" });
    await addCourse(user, "CSC 4330");
    await addSection(user, "CSC 4330");
    expect(screen.getAllByTestId("meeting-block-CSC 4330-Mon")).toHaveLength(1);

    await user.selectOptions(termSelect, "LSUAM_SPRING_2027");
    expect(screen.queryByTestId("meeting-block-CSC 4330-Mon")).not.toBeInTheDocument();
    await addCourse(user, "CSC 4330");
    expect(await screen.findByText("003-LEC")).toBeInTheDocument();
    await addSection(user, "CSC 4330");
    expect(screen.getAllByTestId("meeting-block-CSC 4330-Tue")).toHaveLength(1);

    await user.selectOptions(termSelect, "LSUAM_FALL_2026");
    await waitFor(() =>
      expect(screen.getAllByTestId("meeting-block-CSC 4330-Mon")).toHaveLength(1),
    );
    expect(screen.queryByTestId("meeting-block-CSC 4330-Tue")).not.toBeInTheDocument();
  });

  it("shows the server error for section requests", async () => {
    const user = userEvent.setup();
    setup({ rejectSections: true });
    render(<ScheduleScreen />);
    await addCourse(user, "CSC 4330");

    expect(await screen.findByRole("alert")).toHaveTextContent(SERVER_ALERT);
  });

  it("shows one server error when the course catalog cannot be loaded", async () => {
    setup({ rejectCatalog: true });
    render(<ScheduleScreen />);

    await screen.findByRole("combobox", { name: "Term" });
    expect(await screen.findByRole("alert")).toHaveTextContent(SERVER_ALERT);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("shows a loading status while a planned course's sections are requested", async () => {
    const user = userEvent.setup();
    setup({
      pendingSections: true,
      planTerms: [{ season: "Fall", year: 2026, courses: ["CSC 4330"] }],
    });
    render(<ScheduleScreen />);
    await screen.findByRole("combobox", { name: "Term" });
    expect(screen.queryByText("Loading sections…")).not.toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "CSC 4330" }));
    expect(await screen.findByText("Loading sections…")).toHaveAttribute("role", "status");
  });

  it("prompts the user to add a plan term when none exist", async () => {
    setup({ planTerms: [] });
    render(<ScheduleScreen />);

    expect(await screen.findByRole("heading", { name: "Schedule" })).toBeInTheDocument();
    expect(
      await screen.findByText("Add a term in the Plan tab to build a schedule."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Term" })).not.toBeInTheDocument();
  });

  describe("starting from the plan", () => {
    const twoTerms = [
      { season: "Spring" as const, year: 2027, courses: ["CSC 4330" as const] },
      { season: "Fall" as const, year: 2026, courses: ["CSC 1350" as const, "CSC 3102" as const] },
    ];
    const chips = () =>
      within(screen.getByLabelText("Courses in your plan for this term"))
        .getAllByRole("button")
        .map((button) => button.textContent);

    it("defaults to the earliest plan term and offers its courses as shortcuts", async () => {
      const user = userEvent.setup();
      const { listSections } = setup({ planTerms: twoTerms });
      render(<ScheduleScreen />);

      await waitFor(() =>
        expect(screen.getByRole("combobox", { name: "Term" })).toHaveValue("LSUAM_FALL_2026"),
      );
      await waitFor(() => expect(chips()).toEqual(["CSC 1350", "CSC 3102"]));
      await user.click(screen.getByRole("button", { name: "CSC 1350" }));
      expect(await screen.findByText("B. Professor")).toBeInTheDocument();
      expect(listSections).toHaveBeenCalledWith("CSC 1350", "LSUAM_FALL_2026");
    });

    it("switches the shortcuts with the term and requests its period id", async () => {
      const user = userEvent.setup();
      const { listSections, save } = setup({ planTerms: twoTerms });
      render(<ScheduleScreen />);

      await user.selectOptions(
        await screen.findByRole("combobox", { name: "Term" }),
        "LSUAM_SPRING_2027",
      );
      expect(chips()).toEqual(["CSC 4330"]);
      await user.click(screen.getByRole("button", { name: "CSC 4330" }));
      expect(await screen.findByText("C. Professor")).toBeInTheDocument();
      expect(listSections).toHaveBeenCalledWith("CSC 4330", "LSUAM_SPRING_2027");
      expect(listSections.mock.calls.map(([, term]) => term)).toSatisfy((terms: string[]) =>
        terms.every((term) => /^LSUAM_(SPRING|SUMMER|FALL|WINTER)_\d{4}$/.test(term)),
      );
      expect(save).not.toHaveBeenCalled();
    });

    it("orders terms by year, then Spring, Summer, Fall, Winter", async () => {
      setup({
        planTerms: [
          { season: "Spring", year: 2027, courses: [] },
          { season: "Winter", year: 2026, courses: ["CSC 3102"] },
          { season: "Fall", year: 2026, courses: [] },
          { season: "Summer", year: 2027, courses: [] },
        ],
      });
      render(<ScheduleScreen />);

      const termSelect = await screen.findByRole("combobox", { name: "Term" });
      await waitFor(() => expect(termSelect).toHaveValue("LSUAM_FALL_2026"));
      expect(
        within(termSelect)
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual(["Fall 2026", "Winter 2026", "Spring 2027", "Summer 2027"]);
    });
  });
});

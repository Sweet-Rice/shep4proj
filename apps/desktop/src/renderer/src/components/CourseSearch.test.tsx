// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { Course } from "@jevschedule/shared";
import { CourseSearch } from "./CourseSearch.js";

const TEST_CATALOG: Course[] = [
  ["CSC 1350", "Computer Science I for Majors"],
  ["CSC 1351", "Computer Science II for Majors"],
  ["CSC 2250", "Discrete Structures"],
  ["CSC 3102", "Advanced Data Structures and Algorithm Analysis"],
  ["MATH 1550", "Differential and Integral Calculus"],
  ["MATH 1552", "Analytic Geometry and Calculus II"],
  ["ENGL 1001", "English Composition"],
  ["ENGL 2000", "English Composition II"],
  ["BIOL 1001", "General Biology I"],
  ["CHEM 1201", "Basic Chemistry I"],
].map(([code, title]) => ({
  catalogYear: "2026-2027",
  code: code!,
  title: title!,
  credits: { min: 3, max: 3, note: null },
  description: title!,
  prerequisiteText: null,
}));

const LARGE_CATALOG: Course[] = [
  ...TEST_CATALOG,
  ...Array.from({ length: 55 }, (_, index) => ({
    ...TEST_CATALOG[0]!,
    code: `TST ${1000 + index}`,
    title: `Test Course ${index}`,
  })),
];

describe("CourseSearch", () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "jevschedule");
  });

  it("renders search input and initial course list", () => {
    render(<CourseSearch courses={TEST_CATALOG} />);

    expect(screen.getByLabelText("Search Courses")).toBeInTheDocument();
    expect(screen.getByTestId("course-results-list")).toBeInTheDocument();
    expect(screen.getByText("Showing all 10 courses")).toBeInTheDocument();
  });

  it("reports when the unfiltered catalog exceeds the displayed result cap", () => {
    render(<CourseSearch courses={LARGE_CATALOG} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing 50 of 65 courses. Search to find the rest.",
    );
    expect(screen.getByTestId("course-results-list").children).toHaveLength(50);
  });

  it("reports all query matches when they exceed the displayed result cap", async () => {
    const user = userEvent.setup();
    render(<CourseSearch courses={LARGE_CATALOG} />);
    await user.type(screen.getByLabelText("Search Courses"), "TST");

    expect(screen.getByRole("status")).toHaveTextContent(
      'Found 55 courses matching "TST" (showing first 50)',
    );
    expect(screen.getByTestId("course-results-list").children).toHaveLength(50);
  });

  it("filters courses matching query as user types", async () => {
    const user = userEvent.setup();
    render(<CourseSearch courses={TEST_CATALOG} />);

    const searchInput = screen.getByLabelText("Search Courses");
    await user.type(searchInput, "1350");

    expect(screen.getByText('Found 1 course matching "1350"')).toBeInTheDocument();
    expect(screen.getByTestId("course-item-CSC 1350")).toBeInTheDocument();
    expect(screen.queryByTestId("course-item-MATH 1550")).not.toBeInTheDocument();
  });

  it("displays no results message when query returns no matches", async () => {
    const user = userEvent.setup();
    render(<CourseSearch courses={TEST_CATALOG} />);

    const searchInput = screen.getByLabelText("Search Courses");
    await user.type(searchInput, "XYZ 9999");

    expect(screen.getByTestId("no-results-message")).toHaveTextContent(
      'No courses found matching "XYZ 9999"',
    );
  });

  it("clears search input when clear button is clicked", async () => {
    const user = userEvent.setup();
    render(<CourseSearch courses={TEST_CATALOG} />);

    const searchInput = screen.getByLabelText("Search Courses");
    await user.type(searchInput, "Calculus");
    expect(screen.getByDisplayValue("Calculus")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear search query" }));
    expect(screen.getByLabelText("Search Courses")).toHaveValue("");
    expect(screen.getByText("Showing all 10 courses")).toBeInTheDocument();
  });

  it("triggers onSelectCourse or onToggleCompleted callbacks when clicked", async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    const handleToggle = vi.fn();

    render(
      <CourseSearch
        courses={TEST_CATALOG}
        onSelectCourse={handleSelect}
        onToggleCompleted={handleToggle}
      />,
    );
    await user.type(screen.getByLabelText("Search Courses"), "CSC 1350");
    await user.click(screen.getByRole("button", { name: "Select" }));
    expect(handleSelect).toHaveBeenCalledWith(expect.objectContaining({ code: "CSC 1350" }));
    await user.click(screen.getByRole("button", { name: "Mark Completed" }));
    expect(handleToggle).toHaveBeenCalledWith("CSC 1350");
  });

  it("loads history on disclosure and summarizes typical terms", async () => {
    const getCourseHistory = vi.fn().mockResolvedValue([
      { term: "LSUAM_FALL_2026", sectionCount: 2 },
      { term: "LSUAM_FALL_2027", sectionCount: 1 },
      { term: "LSUAM_SPRING_2027", sectionCount: 4 },
    ]);
    Object.assign(window, { jevschedule: { catalog: { getCourseHistory } } });
    const user = userEvent.setup();
    render(<CourseSearch courses={TEST_CATALOG} />);

    expect(getCourseHistory).not.toHaveBeenCalled();
    const firstCourse = screen.getByTestId("course-item-CSC 1350");
    const disclosure = firstCourse.querySelector("button");
    expect(disclosure).toHaveTextContent("When is this offered?");
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await user.click(disclosure!);

    const summary = await screen.findByText(/Offered in:/);
    expect(summary).toHaveTextContent(
      "Offered in: Fall (2 terms: 2026, 2027); Spring (1 term: 2027)",
    );
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(getCourseHistory).toHaveBeenCalledOnce();
    expect(getCourseHistory).toHaveBeenCalledWith("CSC 1350");
  });

  it("shows empty and server-error offering history states", async () => {
    const getCourseHistory = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("offline"));
    Object.assign(window, { jevschedule: { catalog: { getCourseHistory } } });
    const user = userEvent.setup();
    render(<CourseSearch courses={TEST_CATALOG.slice(0, 2)} />);

    await user.click(screen.getByTestId("course-item-CSC 1350").querySelector("button")!);
    expect(await screen.findByText(/No offering history recorded yet/)).toBeInTheDocument();
    await user.click(screen.getByTestId("course-item-CSC 1351").querySelector("button")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Course catalog unavailable/);
    expect(getCourseHistory).toHaveBeenCalledTimes(2);
  });
});

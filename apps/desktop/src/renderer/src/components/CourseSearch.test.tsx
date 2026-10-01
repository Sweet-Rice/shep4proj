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

describe("CourseSearch", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders search input and initial course list", () => {
    render(<CourseSearch courses={TEST_CATALOG} />);

    expect(screen.getByLabelText("Search Courses")).toBeInTheDocument();
    expect(screen.getByTestId("course-results-list")).toBeInTheDocument();
    expect(screen.getByText("Showing all 10 courses")).toBeInTheDocument();
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
});

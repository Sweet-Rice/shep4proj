// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { CourseSearch } from "./CourseSearch.js";

describe("CourseSearch", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders search input and initial course list", () => {
    render(<CourseSearch />);

    expect(screen.getByLabelText("Search Courses")).toBeInTheDocument();
    expect(screen.getByTestId("course-results-list")).toBeInTheDocument();
    expect(screen.getByText("Showing all 10 courses")).toBeInTheDocument();
  });

  it("filters courses matching query as user types", async () => {
    const user = userEvent.setup();
    render(<CourseSearch />);

    const searchInput = screen.getByLabelText("Search Courses");
    await user.type(searchInput, "1350");

    expect(screen.getByText('Found 1 course matching "1350"')).toBeInTheDocument();
    expect(screen.getByTestId("course-item-CSC 1350")).toBeInTheDocument();
    expect(screen.queryByTestId("course-item-MATH 1550")).not.toBeInTheDocument();
  });

  it("displays no results message when query returns no matches", async () => {
    const user = userEvent.setup();
    render(<CourseSearch />);

    const searchInput = screen.getByLabelText("Search Courses");
    await user.type(searchInput, "XYZ 9999");

    expect(screen.getByTestId("no-results-message")).toHaveTextContent(
      'No courses found matching "XYZ 9999"',
    );
  });

  it("clears search input when clear button is clicked", async () => {
    const user = userEvent.setup();
    render(<CourseSearch />);

    const searchInput = screen.getByLabelText("Search Courses");
    await user.type(searchInput, "Calculus");

    expect(screen.getByDisplayValue("Calculus")).toBeInTheDocument();

    const clearBtn = screen.getByRole("button", { name: "Clear search query" });
    await user.click(clearBtn);

    expect(screen.getByLabelText("Search Courses")).toHaveValue("");
    expect(screen.getByText("Showing all 10 courses")).toBeInTheDocument();
  });

  it("triggers onSelectCourse or onToggleCompleted callbacks when clicked", async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    const handleToggle = vi.fn();

    render(<CourseSearch onSelectCourse={handleSelect} onToggleCompleted={handleToggle} />);

    const searchInput = screen.getByLabelText("Search Courses");
    await user.type(searchInput, "CSC 1350");

    const selectBtn = screen.getByRole("button", { name: "Select" });
    await user.click(selectBtn);

    expect(handleSelect).toHaveBeenCalledWith(expect.objectContaining({ code: "CSC 1350" }));

    const toggleBtn = screen.getByRole("button", { name: "Mark Completed" });
    await user.click(toggleBtn);

    expect(handleToggle).toHaveBeenCalledWith("CSC 1350");
  });
});

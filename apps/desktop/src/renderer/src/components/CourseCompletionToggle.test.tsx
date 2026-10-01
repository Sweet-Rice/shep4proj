// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { CourseCompletionToggle } from "./CourseCompletionToggle.js";

describe("CourseCompletionToggle", () => {
  afterEach(() => {
    cleanup();
  });
  it("renders unchecked by default", () => {
    render(
      <CourseCompletionToggle courseId="CSC 1350" isCompleted={false} onToggle={() => {}} />
    );
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
  });

  it("renders checked when isCompleted is true", () => {
    render(
      <CourseCompletionToggle courseId="CSC 1350" isCompleted={true} onToggle={() => {}} />
    );
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
  });

  it("calls onToggle with the courseId when clicked", async () => {
    const user = userEvent.setup();
    const handleToggle = vi.fn();
    render(
      <CourseCompletionToggle courseId="CSC 1350" isCompleted={false} onToggle={handleToggle} />
    );
    const checkbox = screen.getByRole("checkbox");
    await user.click(checkbox);
    expect(handleToggle).toHaveBeenCalledTimes(1);
    expect(handleToggle).toHaveBeenCalledWith("CSC 1350");
  });

  it("shows the optional label", () => {
    render(
      <CourseCompletionToggle courseId="CSC 1350" isCompleted={false} onToggle={() => {}} label="Completed?" />
    );
    expect(screen.getByText("Completed?")).toBeInTheDocument();
  });

  it("does not call onToggle when disabled", async () => {
    const handleToggle = vi.fn();
    render(
      <CourseCompletionToggle courseId="CSC 1350" isCompleted={false} onToggle={handleToggle} disabled />
    );
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeDisabled();
  });
});

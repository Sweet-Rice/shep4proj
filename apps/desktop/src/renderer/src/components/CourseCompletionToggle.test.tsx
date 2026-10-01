// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { CourseCompletionToggle } from "./CourseCompletionToggle.js";

afterEach(cleanup);

it("follows saved state and rollback instead of retaining the user's unchecked prop change", async () => {
  const user = userEvent.setup();
  const props = { courseId: "CSC 1350", onToggle: () => {} };
  const { rerender } = render(<CourseCompletionToggle {...props} isCompleted={false} />);
  const checkbox = screen.getByRole("checkbox");
  await user.click(checkbox);
  expect(checkbox).not.toBeChecked();
  rerender(<CourseCompletionToggle {...props} isCompleted={true} />);
  expect(checkbox).toBeChecked();
  rerender(<CourseCompletionToggle {...props} isCompleted={false} />);
  expect(checkbox).not.toBeChecked();
});

it("does not change completion through a disabled checkbox or its label", async () => {
  const user = userEvent.setup();
  const onToggle = vi.fn();
  render(
    <CourseCompletionToggle
      courseId="CSC 1350"
      isCompleted={false}
      onToggle={onToggle}
      label="CSC 1350 completed"
      disabled
    />,
  );
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByText("CSC 1350 completed"));
  expect(onToggle).not.toHaveBeenCalled();
  expect(screen.getByRole("checkbox")).not.toBeChecked();
});

// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MarkPrereqsDialog } from "./MarkPrereqsDialog.js";

describe("MarkPrereqsDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not render when isOpen is false or unfulfilledPrereqs is empty", () => {
    const { container: c1 } = render(
      <MarkPrereqsDialog
        isOpen={false}
        targetCourse="CSC 2250"
        unfulfilledPrereqs={["CSC 1350"]}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
      />,
    );
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(
      <MarkPrereqsDialog
        isOpen={true}
        targetCourse="CSC 2250"
        unfulfilledPrereqs={[]}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
      />,
    );
    expect(c2.firstChild).toBeNull();
  });

  it("renders dialog with target course and list of unfulfilled prerequisites", () => {
    render(
      <MarkPrereqsDialog
        isOpen={true}
        targetCourse="CSC 2250"
        unfulfilledPrereqs={["CSC 1350", "MATH 1550"]}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Also mark prerequisites as completed?")).toBeInTheDocument();
    expect(screen.getByText("CSC 1350")).toBeInTheDocument();
    expect(screen.getByText("MATH 1550")).toBeInTheDocument();
  });

  it("calls onAccept when user accepts marking all prerequisites", async () => {
    const user = userEvent.setup();
    const handleAccept = vi.fn();
    const handleDecline = vi.fn();

    render(
      <MarkPrereqsDialog
        isOpen={true}
        targetCourse="CSC 2250"
        unfulfilledPrereqs={["CSC 1350"]}
        onAccept={handleAccept}
        onDecline={handleDecline}
      />,
    );

    const acceptBtn = screen.getByTestId("accept-prereqs-btn");
    await user.click(acceptBtn);

    expect(handleAccept).toHaveBeenCalledWith("CSC 2250", ["CSC 1350"]);
    expect(handleDecline).not.toHaveBeenCalled();
  });

  it("calls onDecline when user declines marking prerequisites", async () => {
    const user = userEvent.setup();
    const handleAccept = vi.fn();
    const handleDecline = vi.fn();

    render(
      <MarkPrereqsDialog
        isOpen={true}
        targetCourse="CSC 2250"
        unfulfilledPrereqs={["CSC 1350"]}
        onAccept={handleAccept}
        onDecline={handleDecline}
      />,
    );

    const declineBtn = screen.getByTestId("decline-prereqs-btn");
    await user.click(declineBtn);

    expect(handleDecline).toHaveBeenCalledWith("CSC 2250");
    expect(handleAccept).not.toHaveBeenCalled();
  });

  it("closes with Escape without marking anything", async () => {
    const user = userEvent.setup();
    const handleAccept = vi.fn();
    const handleDecline = vi.fn();
    const handleCancel = vi.fn();

    render(
      <MarkPrereqsDialog
        isOpen={true}
        targetCourse="CSC 2250"
        unfulfilledPrereqs={["CSC 1350"]}
        onAccept={handleAccept}
        onDecline={handleDecline}
        onCancel={handleCancel}
      />,
    );

    await user.keyboard("{Tab}");
    await user.keyboard("{Escape}");

    expect(handleCancel).toHaveBeenCalledTimes(1);
    expect(handleAccept).not.toHaveBeenCalled();
    expect(handleDecline).not.toHaveBeenCalled();
  });

  it("moves focus into the dialog on open and returns it to the trigger on close", () => {
    const props = {
      targetCourse: "CSC 2250" as const,
      unfulfilledPrereqs: ["CSC 1350" as const],
      onAccept: vi.fn(),
      onDecline: vi.fn(),
    };
    render(<button type="button">Mark Completed</button>);
    const trigger = screen.getByRole("button", { name: "Mark Completed" });
    trigger.focus();

    const { rerender } = render(<MarkPrereqsDialog isOpen={true} {...props} />);
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);

    rerender(<MarkPrereqsDialog isOpen={false} {...props} />);
    expect(trigger).toHaveFocus();
  });

  it("returns focus to the trigger when the parent unmounts the dialog", async () => {
    const user = userEvent.setup();
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Mark Completed
          </button>
          {open && (
            <MarkPrereqsDialog
              isOpen
              targetCourse="CSC 2250"
              unfulfilledPrereqs={["CSC 1350"]}
              onAccept={vi.fn()}
              onDecline={vi.fn()}
              onCancel={() => setOpen(false)}
            />
          )}
        </>
      );
    }
    render(<Host />);
    const trigger = screen.getByRole("button", { name: "Mark Completed" });

    await user.click(trigger);
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("keeps Tab and Shift+Tab inside the dialog", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Outside</button>
        <MarkPrereqsDialog
          isOpen={true}
          targetCourse="CSC 2250"
          unfulfilledPrereqs={["CSC 1350"]}
          onAccept={vi.fn()}
          onDecline={vi.fn()}
          onCancel={vi.fn()}
        />
      </>,
    );
    const dialog = screen.getByRole("dialog");

    for (let i = 0; i < 5; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    for (let i = 0; i < 5; i++) {
      await user.tab({ shift: true });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });
});

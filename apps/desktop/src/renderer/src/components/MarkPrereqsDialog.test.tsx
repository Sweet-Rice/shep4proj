// @vitest-environment jsdom
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
});

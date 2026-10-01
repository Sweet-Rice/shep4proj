// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { SectionWatchToggle } from "./SectionWatchToggle.js";

describe("SectionWatchToggle", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders unwatching state with '☆ Watch Seats' label", () => {
    render(
      <SectionWatchToggle sectionKey="CSC 1350-001" isWatching={false} onToggleWatch={vi.fn()} />,
    );

    const btn = screen.getByTestId("watch-toggle-CSC 1350-001");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(btn).toHaveTextContent("Watch Seats");
  });

  it("renders watching state with '★ Watching Seats' label", () => {
    render(
      <SectionWatchToggle sectionKey="CSC 1350-001" isWatching={true} onToggleWatch={vi.fn()} />,
    );

    const btn = screen.getByTestId("watch-toggle-CSC 1350-001");
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(btn).toHaveTextContent("Watching Seats");
  });

  it("calls onToggleWatch when clicked", async () => {
    const user = userEvent.setup();
    const handleToggle = vi.fn();

    render(
      <SectionWatchToggle
        sectionKey="CSC 1350-001"
        isWatching={false}
        onToggleWatch={handleToggle}
      />,
    );

    const btn = screen.getByTestId("watch-toggle-CSC 1350-001");
    await user.click(btn);

    expect(handleToggle).toHaveBeenCalledWith("CSC 1350-001");
  });
});

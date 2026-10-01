// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ImportProgressFlow } from "./ImportProgressFlow.js";

describe("ImportProgressFlow", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders idle state initially and transitions through signing in, fetching, and review", async () => {
    const user = userEvent.setup();
    render(<ImportProgressFlow initialStage="idle" />);

    expect(screen.getByTestId("stage-idle")).toBeInTheDocument();

    const startBtn = screen.getByTestId("start-import-btn");
    await user.click(startBtn);

    // Transitions to signing_in -> fetching -> review
    await waitFor(() => {
      expect(screen.getByTestId("stage-review")).toBeInTheDocument();
    });
  });

  it("completes import flow from review stage to done", async () => {
    const user = userEvent.setup();
    const handleComplete = vi.fn();

    render(<ImportProgressFlow initialStage="review" onImportComplete={handleComplete} />);

    expect(screen.getByTestId("stage-review")).toBeInTheDocument();

    const confirmBtn = screen.getByTestId("confirm-import-btn");
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByTestId("stage-done")).toBeInTheDocument();
    });

    expect(screen.getByText("Import Complete!")).toBeInTheDocument();
    expect(handleComplete).toHaveBeenCalledWith(["CSC 1350", "MATH 1550", "ENGL 1001", "CSC 1351"]);
  });

  it("handles failure state and provides Upload Transcript Instead fallback", async () => {
    const user = userEvent.setup();
    const handleFallback = vi.fn();

    render(<ImportProgressFlow initialStage="failure" onFallbackUpload={handleFallback} />);

    expect(screen.getByTestId("stage-failure")).toBeInTheDocument();
    expect(screen.getByText("Import Failed")).toBeInTheDocument();

    const uploadInsteadBtn = screen.getByTestId("upload-instead-btn");
    await user.click(uploadInsteadBtn);

    expect(handleFallback).toHaveBeenCalled();
  });

  it("opens the PDF picker and reviews parsed courses", async () => {
    const user = userEvent.setup();
    const select = vi.fn().mockResolvedValue({
      courses: [{ code: "CSC 1350", term: { season: "Fall", year: 2024 }, grade: "A" }],
      unrecognizedLines: [],
    });
    Object.assign(window, { jevschedule: { transcript: { select } } });
    try {
      render(<ImportProgressFlow />);
      await user.click(screen.getByTestId("select-transcript-btn"));
      await waitFor(() => expect(screen.getByTestId("stage-review")).toBeInTheDocument());
      expect(select).toHaveBeenCalledOnce();
      expect(screen.getByText("Fall 2024")).toBeInTheDocument();
      expect(screen.getByText("Grade: A")).toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(window, "jevschedule");
    }
  });
});

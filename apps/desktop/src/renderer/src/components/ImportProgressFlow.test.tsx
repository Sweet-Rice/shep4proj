// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkdayImportProgress, WorkdayImportReview } from "../../../shared/ipc.js";
import { ImportProgressFlow } from "./ImportProgressFlow.js";

const review: WorkdayImportReview = {
  completed: ["CSC 1350"],
  inProgress: [{ season: "Fall", year: 2026, courses: ["CSC 4330"] }],
  skipped: [],
};

function installWorkdayApi(api: Record<string, unknown>) {
  Object.assign(window, { jevschedule: api });
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "jevschedule");
});

describe("ImportProgressFlow", () => {
  it("shows real signing-in and fetching progress before review", async () => {
    const user = userEvent.setup();
    let emit: ((progress: WorkdayImportProgress) => void) | undefined;
    let resolveStart: (result: WorkdayImportReview) => void = () => undefined;
    const start = vi.fn(
      () => new Promise<WorkdayImportReview>((resolve) => (resolveStart = resolve)),
    );
    installWorkdayApi({
      workday: {
        start,
        confirm: vi.fn(),
        onProgress: vi.fn((listener: (progress: WorkdayImportProgress) => void) => {
          emit = listener;
          return vi.fn();
        }),
      },
    });
    render(<ImportProgressFlow />);
    await user.click(screen.getByTestId("start-import-btn"));
    expect(screen.getByTestId("stage-signing-in")).toBeInTheDocument();
    await act(async () => emit?.({ stage: "fetching" }));
    expect(screen.getByTestId("stage-fetching")).toBeInTheDocument();
    await act(async () => resolveStart(review));
    expect(await screen.findByTestId("stage-review")).toBeInTheDocument();
    expect(start).toHaveBeenCalledOnce();
  });

  it("writes nothing before confirm and confirms selected Workday courses", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn().mockResolvedValue(undefined);
    installWorkdayApi({
      completed: { set: vi.fn() },
      workday: {
        start: vi.fn().mockResolvedValue(review),
        confirm,
        onProgress: vi.fn(() => vi.fn()),
      },
    });
    render(<ImportProgressFlow />);
    await user.click(screen.getByTestId("start-import-btn"));
    await screen.findByTestId("stage-review");
    expect(window.jevschedule.completed.set).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("confirm-import-btn"));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(review));
    expect(screen.getByTestId("stage-done")).toBeInTheDocument();
  });

  it("shows the shape-change message and switches to transcript upload", async () => {
    const user = userEvent.setup();
    const transcript = {
      select: vi.fn().mockResolvedValue({
        courses: [{ code: "CSC 1350", term: { season: "Fall", year: 2024 }, grade: "A" }],
        unrecognizedLines: [],
      }),
    };
    installWorkdayApi({
      transcript,
      workday: {
        start: vi.fn(async () => {
          throw new Error("shape change");
        }),
        confirm: vi.fn(),
        onProgress: vi.fn((listener: (progress: WorkdayImportProgress) => void) => {
          listener({
            stage: "error",
            fallback: "upload",
            message: "Workday's pages changed. Import your transcript PDF instead.",
          });
          return vi.fn();
        }),
      },
    });
    render(<ImportProgressFlow />);
    await user.click(screen.getByTestId("start-import-btn"));
    expect(
      await screen.findByText("Workday's pages changed. Import your transcript PDF instead."),
    ).toBeInTheDocument();
    await user.click(screen.getByTestId("select-transcript-fallback-btn"));
    await screen.findByTestId("stage-review");
    expect(transcript.select).toHaveBeenCalledOnce();
    expect(screen.getByText("Fall 2024")).toBeInTheDocument();
  });

  it("keeps the failure message when the transcript picker is cancelled", async () => {
    const user = userEvent.setup();
    const select = vi.fn().mockResolvedValue(null);
    installWorkdayApi({
      transcript: { select },
      workday: {
        start: vi.fn(async () => {
          throw new Error("closed");
        }),
        confirm: vi.fn(),
        onProgress: vi.fn((listener: (progress: WorkdayImportProgress) => void) => {
          listener({ stage: "error", message: "Could not import records from Workday." });
          return vi.fn();
        }),
      },
    });
    render(<ImportProgressFlow />);
    await user.click(screen.getByTestId("start-import-btn"));
    await screen.findByText("Could not import records from Workday.");
    await user.click(screen.getByTestId("select-transcript-fallback-btn"));
    await waitFor(() => expect(select).toHaveBeenCalledOnce());
    expect(await screen.findByTestId("failure-message")).toHaveTextContent(
      "Could not import records from Workday.",
    );
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { DegreeProgram, DegreeSummary } from "@jevschedule/shared";
import { useDegree } from "./useDegree.js";

const degree: DegreeProgram = {
  id: "csc-software-engineering-2026-2027",
  program: "Computer Science, B.S.",
  concentration: "Software Engineering",
  catalogYear: "2026-2027",
  totalCredits: 120,
  source: "https://example.com",
  requirements: [],
};
const summary: DegreeSummary = {
  id: degree.id,
  program: degree.program,
  concentration: degree.concentration,
  catalogYear: degree.catalogYear,
  totalCredits: degree.totalCredits,
};

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "jevschedule");
});

describe("useDegree", () => {
  it("loads the first degree returned by the server", async () => {
    const listDegrees = vi.fn().mockResolvedValue([summary]);
    const getDegree = vi.fn().mockResolvedValue(degree);
    Object.assign(window, { jevschedule: { catalog: { listDegrees, getDegree } } });

    const { result } = renderHook(() => useDegree());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.degree).toEqual(degree));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(listDegrees).toHaveBeenCalledOnce();
    expect(getDegree).toHaveBeenCalledWith(summary.id);
  });

  it("reports an error when the server has no degrees", async () => {
    const getDegree = vi.fn();
    Object.assign(window, {
      jevschedule: { catalog: { listDegrees: vi.fn().mockResolvedValue([]), getDegree } },
    });

    const { result } = renderHook(() => useDegree());
    await waitFor(() => {
      expect(result.current.error?.message).toBe(
        "No degree programs are available from the server",
      );
    });
    expect(result.current.degree).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(getDegree).not.toHaveBeenCalled();
  });

  it("reports server failures", async () => {
    Object.assign(window, {
      jevschedule: {
        catalog: {
          listDegrees: vi.fn().mockRejectedValue(new Error("offline")),
          getDegree: vi.fn(),
        },
      },
    });

    const { result } = renderHook(() => useDegree());
    await waitFor(() => expect(result.current.error?.message).toBe("offline"));
    expect(result.current.loading).toBe(false);
  });
});

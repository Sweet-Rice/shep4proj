// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Plan } from "@jevschedule/shared";
import { usePlan } from "./usePlan.js";

const mockGet = vi.fn();
const mockSave = vi.fn();

interface JevScheduleGlobal {
  window: {
    jevschedule?: {
      plan: {
        get: typeof mockGet;
        save: typeof mockSave;
      };
    };
  };
}

describe("usePlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue(undefined);

    (globalThis as unknown as JevScheduleGlobal).window.jevschedule = {
      plan: {
        get: mockGet,
        save: mockSave,
      },
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as JevScheduleGlobal).window.jevschedule;
  });

  it("loads saved plan from store on mount", async () => {
    const savedPlan: Plan = {
      creditLimit: 18,
      terms: [
        { season: "Fall", year: 2026, courses: ["CSC 1350"] },
        { season: "Spring", year: 2027, courses: ["CSC 1351"] },
      ],
    };
    mockGet.mockResolvedValueOnce(savedPlan);

    const { result } = renderHook(() => usePlan());

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    expect(result.current.plan).toEqual(savedPlan);
  });

  it("keeps a saved credit limit when the saved plan has no terms", async () => {
    const savedPlan: Plan = { creditLimit: 12, terms: [] };
    mockGet.mockResolvedValueOnce(savedPlan);

    const { result } = renderHook(() => usePlan());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.plan).toEqual(savedPlan);
  });

  it("uses an empty plan when no plan is saved", async () => {
    mockGet.mockResolvedValueOnce(null);
    const { result } = renderHook(() => usePlan());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.plan.terms).toEqual([]);
  });

  it("moves courses between terms and persists to store", async () => {
    const initialPlan: Plan = {
      creditLimit: 18,
      terms: [
        { season: "Fall", year: 2026, courses: ["CSC 1350", "MATH 1550"] },
        { season: "Spring", year: 2027, courses: ["CSC 1351"] },
      ],
    };
    mockGet.mockResolvedValueOnce(initialPlan);

    const { result } = renderHook(() => usePlan(initialPlan));

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    // Move MATH 1550 from Term 0, Index 1 to Term 1, Index 1
    await act(async () => {
      await result.current.moveCourse(0, 1, 1, 1);
    });

    expect(result.current.plan.terms[0]?.courses).toEqual(["CSC 1350"]);
    expect(result.current.plan.terms[1]?.courses).toEqual(["CSC 1351", "MATH 1550"]);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it("adds and removes terms", async () => {
    mockGet.mockResolvedValueOnce(null);
    const { result } = renderHook(() => usePlan());

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    const initialLength = result.current.plan.terms.length;

    await act(async () => {
      await result.current.addTerm("Summer", 2027);
    });

    expect(result.current.plan.terms.length).toBe(initialLength + 1);
    expect(result.current.plan.terms[initialLength]).toEqual({
      season: "Summer",
      year: 2027,
      courses: [],
    });

    await act(async () => {
      await result.current.removeTerm(initialLength);
    });

    expect(result.current.plan.terms.length).toBe(initialLength);
  });

  it("ignores edits while a save is pending, so a failed save restores the persisted plan", async () => {
    const persisted: Plan = {
      creditLimit: 18,
      terms: [{ season: "Fall", year: 2026, courses: ["CSC 1350"] }],
    };
    mockGet.mockResolvedValueOnce(persisted);
    let rejectSave!: (error: Error) => void;
    mockSave.mockReturnValueOnce(
      new Promise<void>((_, reject) => {
        rejectSave = reject;
      }),
    );
    const { result } = renderHook(() => usePlan());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.addTerm("Spring", 2027);
    });
    expect(result.current.saving).toBe(true);
    await act(async () => {
      await result.current.removeCourseFromTerm(0, "CSC 1350");
    });
    expect(mockSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectSave(new Error("disk full"));
      await pending.catch(() => {});
    });
    expect(result.current.plan).toEqual(persisted);
    expect(result.current.saving).toBe(false);
    expect(result.current.error?.message).toBe("disk full");
  });
});
